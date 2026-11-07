import { atom, read, update } from "claude-code";
import type { AgentStatus, EngineInterface, Register } from "claude-code";

import type { Entry, Memory, PrSnapshot, Verdict } from "../types";
import { probeCleanup, probePullRequest } from "./probe";
import {
  JUDGE_SYSTEM,
  buildCleanupPrompt,
  buildContinuePrompt,
  buildJudgePrompt,
  describeChanges,
  parseJudge,
  parsePrRef,
  parseStatus,
  parseTarget,
} from "./prompts";

const IDLE_MS = 30 * 60 * 1000;
const PR_POLL_MS = 5 * 60 * 1000;
const TICK_MS = 60 * 1000;
// ユーザーの入力が無いまま自動投稿だけで session が回り続けないよう上限を設ける
const MAX_AUTO_TURNS = 6;
const ENTRY_CHARS = 4000;
const BUFFER_LIMIT = 20;
const HUMAN_ORIGINS = new Set(["composer", "bridge", "sdk"]);
// 動作中の agent は終わると session に通知が届くため、その間は投稿しない
const BUSY_AGENT_STATUSES = new Set<AgentStatus>([
  "pending",
  "running",
  "waiting",
]);
const JUDGE_REQUEST = {
  model: "haiku",
  system: JUDGE_SYSTEM,
  effort: "high",
  maxTokens: 8000,
  timeoutMs: 180_000,
} as const;

const INITIAL: Memory = {
  isEnabled: true,
  stoppedReason: null,
  lastActivityAt: 0,
  lastPolledAt: 0,
  lastStatus: null,
  wasAborted: false,
  autoTurns: 0,
  summary: "",
  verdict: null,
  target: null,
  pr: null,
  isCleanupSent: false,
};

const memory = atom(
  { plugin: "auto-continue", key: "memory" } as const,
  INITIAL,
  { shape: "memory-1" },
);
const buffer = atom({ plugin: "auto-continue", key: "buffer" } as const, [], {
  shape: "buffer-1",
});

function clip(text: string): string {
  return text.length > ENTRY_CHARS ? `…${text.slice(-ENTRY_CHARS)}` : text;
}

// 再読み込みで初期化されてよい値だけを module の変数に置き、残したい値は $.state に置く
let isTurnRunning = false;
let isDeciding = false;
let isAutoInFlight = false;
let timer: { cancel: () => void } | null = null;

async function append($: EngineInterface, entry: Entry): Promise<void> {
  await update($, buffer, (list) =>
    [...list, { ...entry, text: clip(entry.text) }].slice(-BUFFER_LIMIT),
  );
}

async function show($: EngineInterface): Promise<void> {
  const m = await read($, memory);
  if (!m.isEnabled) {
    $.ui.status("off");
  } else if (m.stoppedReason !== null) {
    $.ui.status(`停止 (${m.stoppedReason})`);
  } else if (m.verdict === "WAIT_EXTERNAL" && m.pr !== null) {
    $.ui.status(`PR #${m.pr.number} を監視中`);
  } else {
    $.ui.status("待機中");
  }
}

async function stop($: EngineInterface, reason: string): Promise<string> {
  await update($, memory, (m) => ({ ...m, stoppedReason: reason }));
  await show($);

  return `停止: ${reason}`;
}

async function submit(
  $: EngineInterface,
  text: string,
  patch: Partial<Memory>,
): Promise<string> {
  isAutoInFlight = true;
  await update($, memory, (m) => ({
    ...m,
    ...patch,
    autoTurns: m.autoTurns + 1,
  }));
  await show($);
  const result = await $.prompt.submit({ text });
  if (result.drop !== undefined) {
    isAutoInFlight = false;

    return `投稿が取り消された: ${result.drop}`;
  }

  return "投稿した";
}

// session の起動位置の branch から PR を推定すると、別の用途の branch (deploy 用など) の PR を拾うため、会話から得た対象だけを引く
async function probeTarget(
  $: EngineInterface,
  target: string | null,
): Promise<PrSnapshot | null> {
  const ref = parsePrRef(target);
  if (ref === null) {
    return null;
  }

  return probePullRequest($, await $.session.cwd(), ref);
}

// turn の終わりの PR の状態を基準にし、その turn が push した変更を外部からの変化として扱わない
async function recordBaseline($: EngineInterface): Promise<void> {
  const { target } = await read($, memory);
  const pr = await probeTarget($, target);
  if (pr === null) {
    return;
  }
  await update($, memory, (m) => (m.target === target ? { ...m, pr } : m));
}

async function judge($: EngineInterface, m: Memory): Promise<Verdict | null> {
  const entries = await read($, buffer);
  if (entries.length === 0) {
    return m.verdict;
  }

  const result = await $.model.complete({
    ...JUDGE_REQUEST,
    prompt: buildJudgePrompt(m.summary, entries),
  });
  if (!result.isAnswered) {
    $.ui.log(`auto-continue: 判定に失敗 (${result.reason})`);

    return null;
  }
  const parsed = parseJudge(result.text);
  if (parsed === null) {
    $.ui.log("auto-continue: 判定結果を JSON として読めなかった");

    return null;
  }

  $.ui.log(
    `auto-continue: ${parsed.verdict} (in ${result.usage.input_tokens} / out ${result.usage.output_tokens} tokens) 根拠: ${parsed.reason}`,
  );
  await update($, memory, (one) => ({
    ...one,
    summary: parsed.summary,
    verdict: parsed.verdict,
    target: parsed.target,
  }));
  // 判定中に追加された分は残し、渡した分だけを捨てる
  await update($, buffer, (list) => list.slice(entries.length));

  return parsed.verdict;
}

async function decide($: EngineInterface, isForced: boolean): Promise<string> {
  const m = await read($, memory);
  if (!m.isEnabled) {
    return "off";
  }
  if (m.stoppedReason !== null && !isForced) {
    return `停止中: ${m.stoppedReason}`;
  }
  const now = await $.clock.now();
  if (!isForced && now - m.lastActivityAt < IDLE_MS) {
    return "待機時間に達していない";
  }
  const agents = await $.agent.list();
  if (agents.some((agent) => BUSY_AGENT_STATUSES.has(agent.status))) {
    return "動作中の agent があるので見送った";
  }

  // 段 1: 直前の turn の結果だけで決める
  if (m.wasAborted) {
    return stop($, "ユーザーが直前の turn を中断した");
  }
  if (m.autoTurns >= MAX_AUTO_TURNS) {
    return stop($, "自動投稿の上限に達した");
  }
  if (m.lastStatus === "blocked-on-user") {
    return stop($, "ユーザーの判断待ち");
  }
  if (m.lastStatus === "cleaned") {
    return stop($, "片付けが完了した");
  }

  // 段 2: STATUS 行が無い (ユーザーが指示した turn の後) ときだけ Haiku に判定させる
  let verdict: Verdict | null;
  if (m.lastStatus === "done") {
    verdict = "DONE";
  } else if (m.lastStatus === "waiting") {
    verdict = "WAIT_EXTERNAL";
  } else if (m.lastStatus === "changed") {
    verdict = m.verdict ?? "CONTINUE";
  } else {
    verdict = await judge($, m);
  }
  if (verdict === null) {
    // 判定できないときは次の待機時間まで見送る
    await update($, memory, (one) => ({ ...one, lastActivityAt: now }));

    return "判定できなかったので見送った";
  }
  if (verdict === "WAIT_USER") {
    return stop($, "ユーザーの判断待ち");
  }

  // 段 3: PR の状態を model を使わずに確認する
  const latest = await read($, memory);
  const isPollDue = isForced || now - latest.lastPolledAt >= PR_POLL_MS;
  if (verdict === "WAIT_EXTERNAL" && !isPollDue) {
    return "PR の確認間隔に達していない";
  }
  const pr = await probeTarget($, latest.target);
  // 番号で引いた PR は、以後 cwd の repository に左右されないよう URL で覚える
  await update($, memory, (one) => ({
    ...one,
    lastPolledAt: now,
    target: pr?.url ?? one.target,
  }));
  if (pr !== null && pr.state === "OPEN" && verdict === "DONE") {
    verdict = "WAIT_EXTERNAL";
  }
  if (pr !== null && pr.state === "MERGED" && verdict === "WAIT_EXTERNAL") {
    verdict = "DONE";
  }

  if (verdict === "DONE") {
    if (latest.isCleanupSent) {
      return stop($, "タスクが完了した");
    }
    const items = await probeCleanup($, await $.session.cwd());
    // 報告だけの候補のために turn を起こさない
    if (!items.some((item) => item.kind === "remove")) {
      for (const item of items) {
        $.ui.log(`auto-continue: ${item.text}`);
      }
      if (items.length > 0) {
        $.ui.toast(
          `auto-continue: 片付けの候補が ${items.length} 件ある (自分の worktree など)。詳細は log を参照`,
        );
      }

      return stop($, "タスクが完了した");
    }

    return submit($, buildCleanupPrompt(items), {
      isCleanupSent: true,
      verdict,
      pr,
    });
  }

  if (verdict === "WAIT_EXTERNAL") {
    if (pr === null) {
      return stop($, "PR 以外の待ちは監視の対象外");
    }
    const changes = describeChanges(latest.pr, pr);
    if (changes.length === 0) {
      await update($, memory, (one) => ({ ...one, verdict, pr }));
      await show($);

      return "PR に変化が無いので投稿しない";
    }

    return submit(
      $,
      buildContinuePrompt({ verdict, target: latest.target, pr, changes }),
      { verdict, pr },
    );
  }

  return submit(
    $,
    buildContinuePrompt({ verdict, target: latest.target, pr, changes: [] }),
    { verdict, pr },
  );
}

async function tick($: EngineInterface, isForced: boolean): Promise<string> {
  if (isDeciding || isTurnRunning || isAutoInFlight) {
    return "実行中の処理があるので見送った";
  }
  isDeciding = true;
  try {
    return await decide($, isForced);
  } catch (error) {
    $.ui.log(`auto-continue: ${String(error)}`);

    return `失敗: ${String(error)}`;
  } finally {
    isDeciding = false;
  }
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    const result = await next(e);
    await $.command.register({
      name: "auto-continue",
      description: "auto-continue の操作: on | off | status | now",
    });
    const now = await $.clock.now();
    await update($, memory, (m) =>
      m.lastActivityAt === 0 ? { ...m, lastActivityAt: now } : m,
    );
    timer?.cancel();
    timer = $.clock.every(TICK_MS, () => {
      void tick($, false);
    });
    await show($);

    return result;
  });

  on("prompt.submit", async ($, e, next) => {
    const result = await next(e);
    if (result.drop !== undefined || e.command !== undefined) {
      return result;
    }
    const isHuman = HUMAN_ORIGINS.has(e.origin.kind);
    await append($, { role: isHuman ? "user" : "event", text: e.text });
    if (isHuman) {
      // ユーザーが新しく指示したら、止まっていても監視を再開する
      await update($, memory, (m) => ({
        ...m,
        stoppedReason: null,
        lastStatus: null,
        wasAborted: false,
        autoTurns: 0,
        isCleanupSent: false,
      }));
      await show($);
    }

    return result;
    // 記録に失敗してもユーザーの入力は止めない
  }).catch(($, e, next) => next(e));

  on("turn.start", ($, e, next) => {
    if (e.agentId === undefined) {
      isTurnRunning = true;
    }

    return next(e);
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    if (e.agentId !== undefined) {
      return result;
    }
    isTurnRunning = false;
    isAutoInFlight = false;
    const now = await $.clock.now();
    if (e.answer !== "") {
      await append($, { role: "assistant", text: e.answer });
    }
    const target = parseTarget(e.answer);
    await update($, memory, (m) => ({
      ...m,
      lastActivityAt: now,
      wasAborted: e.isAborted,
      // STATUS 行が無い turn は null にして Haiku の判定に回す
      lastStatus: parseStatus(e.answer),
      target: target === undefined ? m.target : target,
    }));
    // gh の応答を待って turn の終わりを遅らせないよう、基準の記録は待たない
    void recordBaseline($).catch((error: unknown) =>
      $.ui.log(`auto-continue: ${String(error)}`),
    );

    return result;
  });

  on("command.run", { command: "auto-continue" }, async ($, e) => {
    const action = e.args.trim();
    if (action === "on" || action === "off") {
      const isEnabled = action === "on";
      const now = await $.clock.now();
      await update($, memory, (m) => ({
        ...m,
        isEnabled,
        stoppedReason: null,
        wasAborted: false,
        lastStatus: null,
        autoTurns: 0,
        lastActivityAt: now,
      }));
      await show($);

      return { text: `auto-continue を ${action} にした` };
    }
    if (action === "now") {
      // 投稿は session が待機状態になってから始まるため、command の dispatch の外で判定する
      $.clock.after(1, () => {
        void tick($, true).then((outcome) =>
          $.ui.log(`auto-continue: ${outcome}`),
        );
      });

      return { text: "auto-continue: 判定を始めた。結果は log に出す" };
    }

    const m = await read($, memory);
    const lines = [
      `有効: ${m.isEnabled}`,
      `停止の理由: ${m.stoppedReason ?? "なし"}`,
      `分類: ${m.verdict ?? "未判定"}`,
      `直前の STATUS: ${m.lastStatus ?? "なし"}`,
      `自動投稿の回数: ${m.autoTurns}`,
      `PR: ${m.pr === null ? "なし" : `#${m.pr.number} ${m.pr.state}`}`,
      `要約: ${m.summary || "なし"}`,
    ];

    return { text: lines.join("\n") };
  });
};
