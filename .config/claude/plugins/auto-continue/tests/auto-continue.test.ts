import { expect, mock, test } from "claude-code/testing";
import type { AgentInfo, On } from "claude-code";

import { parseWorktrees } from "../hooks/probe";
import {
  JUDGE_SYSTEM,
  buildContinuePrompt,
  buildJudgePrompt,
  describeChanges,
  parseJudge,
  parsePrRef,
  parseStatus,
  parseTarget,
} from "../hooks/prompts";
import type { PrSnapshot } from "../types";

const MINUTE = 60 * 1000;

const PR: PrSnapshot = {
  number: 12,
  url: "https://github.com/example/repo/pull/12",
  state: "OPEN",
  reviewDecision: "REVIEW_REQUIRED",
  mergeStateStatus: "BLOCKED",
  headSha: "aaaaaaaaaaaa",
  reviews: 0,
  comments: 0,
  checks: "SUCCESS:3",
};

const USAGE = {
  input_tokens: 10,
  output_tokens: 10,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

type World = {
  submitted: string[];
  judged: number;
  verdict: string;
  pr: Record<string, unknown> | null;
  worktrees: string;
  closed: unknown[];
  target: string | null;
  // gh pr view に渡された PR の URL か番号
  viewed: string[];
  // 他の PR は番号 (URL の末尾) で引ける
  others: Record<string, Record<string, unknown>>;
  agents: AgentInfo[];
};

function world(on: On, initial: Partial<World> = {}): World {
  const state: World = {
    submitted: [],
    judged: 0,
    verdict: "WAIT_EXTERNAL",
    pr: {
      ...PR,
      headRefOid: PR.headSha,
      reviews: [],
      comments: [],
      statusCheckRollup: [
        { conclusion: "SUCCESS" },
        { conclusion: "SUCCESS" },
        { conclusion: "SUCCESS" },
      ],
    },
    worktrees: "",
    closed: [],
    target: PR.url,
    viewed: [],
    others: {},
    agents: [],
    ...initial,
  };

  on("command.register", () => ({ value: { command: "auto-continue" } }));
  on("session.start", (_, e) => ({ cwd: e.cwd }));
  on("session.cwd", () => ({ value: "/repo" }));
  on("agent.list", () => ({ value: state.agents }));
  on("turn.complete", (_, e) => ({ text: e.answer }));
  on("ui.status", () => ({ value: undefined }));
  on("ui.log", () => ({ value: undefined }));
  on("prompt.submit", (_, e) => {
    state.submitted.push(e.text);

    return { text: e.text };
  });
  on("model.complete", () => {
    state.judged += 1;

    return {
      value: {
        isAnswered: true,
        text: JSON.stringify({
          summary: "PR を作成し、レビューを待っている",
          verdict: state.verdict,
          target: state.target,
        }),
        usage: USAGE,
      },
    };
  });
  on("process.run", (_, e) => {
    const command = e.argv.slice(0, 3).join(" ");
    const out = (stdout: string, exitCode = 0) => ({
      value: {
        exitCode,
        stdout,
        stderr: "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    });
    if (command === "gh pr view") {
      const ref = e.argv[3] ?? "";
      // 引数なしは current branch の PR を引くため、mod から呼ばれてはならない
      if (ref.startsWith("--")) {
        throw new Error("gh pr view が PR を指定せずに呼ばれた");
      }
      state.viewed.push(ref);
      const other = state.others[ref.split("/").at(-1) ?? ""];
      if (other !== undefined) {
        return out(JSON.stringify(other));
      }
      if (state.pr === null || !(ref === PR.url || ref === "12")) {
        return out("", 1);
      }

      return out(JSON.stringify(state.pr));
    }
    if (command === "gh pr list") {
      return out(JSON.stringify(state.closed));
    }
    if (command === "git worktree list") {
      return out(state.worktrees);
    }
    if (command === "git rev-parse --show-toplevel") {
      return out("/repo\n");
    }

    return out("");
  });

  return state;
}

function turn(answer: string) {
  return {
    answer,
    durationMs: 1,
    isAborted: false,
    turnId: `t-${answer.length}`,
    reason: "answer" as const,
  };
}

test("STATUS 行を末尾から読み取る", () => {
  expect(parseStatus("完了しました\nSTATUS: done")).toBe("done");
  expect(parseStatus("STATUS: `waiting`\n")).toBe("waiting");
  expect(parseStatus("STATUS: done は途中の行にある\n続きの行")).toBe(null);
});

test("判定結果の JSON を前後の文章から取り出す", () => {
  expect(
    parseJudge('結果:\n{"summary":"s","verdict":"DONE","target":null}'),
  ).toEqual({
    summary: "s",
    verdict: "DONE",
    target: null,
    reason: "",
  });
  expect(
    parseJudge(
      '{"summary":"s","verdict":"WAIT_USER","target":null,"reason":"確認してください"}',
    )?.reason,
  ).toBe("確認してください");
  expect(parseJudge('{"summary":"s","verdict":"MAYBE"}')).toBe(null);
});

test("PR の変化を項目ごとに書き出す", () => {
  expect(describeChanges(PR, PR)).toEqual([]);
  expect(
    describeChanges(PR, { ...PR, reviews: 2, checks: "FAILURE:1 SUCCESS:2" }),
  ).toEqual(["review の件数: 0 → 2", "CI: SUCCESS:3 → FAILURE:1 SUCCESS:2"]);
});

test("worktree の一覧から path と branch を読み取る", () => {
  const porcelain =
    "worktree /repo\nHEAD 1\nbranch refs/heads/main\n\nworktree /repo-feat\nHEAD 2\nbranch refs/heads/feat/a\n";
  expect(parseWorktrees(porcelain)).toEqual([
    { path: "/repo", branch: "main" },
    { path: "/repo-feat", branch: "feat/a" },
  ]);
});

test("継続の文言は観測値を tag で囲み、制約を必ず含む", () => {
  const text = buildContinuePrompt({
    verdict: "WAIT_EXTERNAL",
    target: null,
    pr: PR,
    changes: ["review の件数: 0 → 2"],
  });
  expect(text).toContain("<observed>\n分類: WAIT_EXTERNAL");
  expect(text).toContain("前回からの変化: review の件数: 0 → 2");
  expect(text).toContain(
    "review thread への返信、Slack への投稿、reviewer への催促や追加はしない",
  );
  expect(
    text
      .trim()
      .endsWith(
        "STATUS: changed | waiting | blocked-on-user | done のどれかを出力する",
      ),
  ).toBe(true);
});

test("レビュー待ちは 1 回だけ投稿し、PR に変化が無ければ次は投稿しない", async ($, on) => {
  const clock = mock.clock(on);
  const state = world(on);
  await $.session.start({
    cwd: "/repo",
    surface: "terminal",
    isInteractive: true,
  });

  await $.turn.complete(
    turn("PR #12 を作成しました。レビューを待っています。"),
  );
  await clock.advance(29 * MINUTE);
  expect(state.submitted).toHaveLength(0);

  await clock.advance(2 * MINUTE);
  expect(state.judged).toBe(1);
  expect(state.submitted).toHaveLength(1);
  expect(state.submitted[0]).toContain("PR: #12");

  await $.turn.complete(turn("レビューはまだありません。\nSTATUS: waiting"));
  await clock.advance(40 * MINUTE);
  expect(state.judged).toBe(1);
  expect(state.submitted).toHaveLength(1);

  state.pr = { ...state.pr, reviews: [{}, {}] };
  await clock.advance(5 * MINUTE);
  expect(state.submitted).toHaveLength(2);
  expect(state.submitted[1]).toContain("前回からの変化: review の件数: 0 → 2");
});

test("ユーザーの判断待ちでは model を呼ばずに止まる", async ($, on) => {
  const clock = mock.clock(on);
  const state = world(on);
  await $.session.start({
    cwd: "/repo",
    surface: "terminal",
    isInteractive: true,
  });

  // 自動投稿の turn でなくても、STATUS 行があればそれで判定する
  await $.turn.complete(
    turn("どちらの方針にしますか。\nSTATUS: blocked-on-user"),
  );
  await clock.advance(60 * MINUTE);
  expect(state.judged).toBe(0);
  expect(state.submitted).toHaveLength(0);
});

test("PR が merge 済みなら片付けの文言を 1 回だけ送る", async ($, on) => {
  const clock = mock.clock(on);
  const state = world(on, {
    verdict: "DONE",
    worktrees:
      "worktree /repo\nbranch refs/heads/main\n\nworktree /repo-feat\nbranch refs/heads/feat/a\n",
    closed: [{ headRefName: "feat/a", state: "MERGED" }],
  });
  state.pr = { ...state.pr, state: "MERGED" };
  await $.session.start({
    cwd: "/repo",
    surface: "terminal",
    isInteractive: true,
  });

  await $.turn.complete(turn("PR が merge されました。"));
  await clock.advance(31 * MINUTE);
  expect(state.submitted).toHaveLength(1);
  expect(state.submitted[0]).toContain(
    "[片付けの対象] merge 済みの worktree: /repo-feat (feat/a)",
  );

  await $.turn.complete(turn("片付けました。\nSTATUS: cleaned"));
  await clock.advance(60 * MINUTE);
  expect(state.submitted).toHaveLength(1);
});

test("片付けの対象が報告だけなら turn を起こさない", async ($, on) => {
  const clock = mock.clock(on);
  const state = world(on, { verdict: "DONE", pr: null });
  await $.session.start({
    cwd: "/repo",
    surface: "terminal",
    isInteractive: true,
  });

  await $.turn.complete(turn("設定を変更して commit しました。"));
  await clock.advance(31 * MINUTE);
  expect(state.judged).toBe(1);
  expect(state.submitted).toHaveLength(0);
});

test("太字で囲まれた STATUS 行も読み取る", () => {
  expect(parseStatus("報告です\n**STATUS:** waiting")).toBe("waiting");
  expect(parseStatus("報告です\n**STATUS: done**")).toBe("done");
});

test("自動投稿の turn が push した変更では次の投稿をしない", async ($, on) => {
  const clock = mock.clock(on);
  const state = world(on);
  await $.session.start({
    cwd: "/repo",
    surface: "terminal",
    isInteractive: true,
  });

  await $.turn.complete(
    turn("PR #12 を作成しました。レビューを待っています。"),
  );
  await clock.advance(31 * MINUTE);
  expect(state.submitted).toHaveLength(1);

  state.pr = { ...state.pr, headRefOid: "bbbbbbbbbbbb" };
  await $.turn.complete(
    turn("指摘を修正して push しました。\nSTATUS: changed"),
  );
  await clock.advance(40 * MINUTE);
  expect(state.submitted).toHaveLength(1);

  state.pr = { ...state.pr, comments: [{}] };
  await clock.advance(5 * MINUTE);
  expect(state.submitted).toHaveLength(2);
  expect(state.submitted[1]).toContain("前回からの変化: comment の件数: 0 → 1");
  expect(state.submitted[1]).not.toContain("head の commit");
});

test("判定結果が PR の番号だけでも、その PR を引いて以後は URL で引く", async ($, on) => {
  const clock = mock.clock(on);
  const state = world(on, { target: "PR #12" });
  await $.session.start({
    cwd: "/repo",
    surface: "terminal",
    isInteractive: true,
  });

  await $.turn.complete(turn("worktree で PR #12 を作成しました。"));
  await clock.advance(31 * MINUTE);
  expect(state.submitted).toHaveLength(1);
  expect(state.submitted[0]).toContain("PR: #12");
  expect(state.viewed[0]).toBe("12");

  await $.turn.complete(turn("レビューはまだありません。\nSTATUS: waiting"));
  await clock.advance(1 * MINUTE);
  expect(state.viewed.at(-1)).toBe(PR.url);
});

test("PR を待っていない判定なら PR を引かず、監視の対象外として止まる", async ($, on) => {
  const clock = mock.clock(on);
  const state = world(on, { target: null });
  await $.session.start({
    cwd: "/repo",
    surface: "terminal",
    isInteractive: true,
  });

  await $.turn.complete(turn("deploy の完了を待っています。"));
  await clock.advance(31 * MINUTE);
  expect(state.viewed).toEqual([]);
  expect(state.submitted).toHaveLength(0);
});

test("動作中の agent があるあいだは判定も投稿もしない", async ($, on) => {
  const clock = mock.clock(on);
  const agent: AgentInfo = {
    id: "a1",
    description: "PR を作る",
    type: "general-purpose",
    status: "running",
  };
  const state = world(on, { verdict: "CONTINUE", agents: [agent] });
  await $.session.start({
    cwd: "/repo",
    surface: "terminal",
    isInteractive: true,
  });

  await $.turn.complete(turn("subagent に任せました。終わったら報告します。"));
  await clock.advance(60 * MINUTE);
  expect(state.judged).toBe(0);
  expect(state.submitted).toHaveLength(0);

  state.agents = [{ ...agent, status: "completed" }];
  await clock.advance(1 * MINUTE);
  expect(state.submitted).toHaveLength(1);
});

test("自動投稿の turn が返した TARGET 行で監視する PR を切り替える", async ($, on) => {
  const clock = mock.clock(on);
  const other = "https://github.com/example/repo/pull/34";
  const state = world(on, {
    others: {
      "34": {
        ...PR,
        number: 34,
        url: other,
        headRefOid: PR.headSha,
        reviews: [],
        comments: [],
        statusCheckRollup: [],
      },
    },
  });
  await $.session.start({
    cwd: "/repo",
    surface: "terminal",
    isInteractive: true,
  });

  await $.turn.complete(
    turn("PR #12 を作成しました。レビューを待っています。"),
  );
  await clock.advance(31 * MINUTE);
  expect(state.submitted).toHaveLength(1);

  await $.turn.complete(
    turn(`#12 は別の作業の PR でした。\nTARGET: ${other}\nSTATUS: waiting`),
  );
  await clock.advance(1 * MINUTE);
  expect(state.viewed.at(-1)).toBe(other);

  state.others["34"] = { ...state.others["34"], comments: [{}] };
  await clock.advance(40 * MINUTE);
  expect(state.submitted).toHaveLength(2);
  expect(state.submitted[1]).toContain(`PR: #34 ${other}`);
});

test("TARGET 行と PR の参照を読み取る", () => {
  expect(
    parseTarget("報告\nTARGET: https://github.com/o/r/pull/1\nSTATUS: waiting"),
  ).toBe("https://github.com/o/r/pull/1");
  expect(parseTarget("報告\n**TARGET:** none\nSTATUS: done")).toBe(null);
  expect(parseTarget("報告\nSTATUS: done")).toBe(undefined);
  expect(parsePrRef("https://github.com/o/r/pull/1/files")).toBe(
    "https://github.com/o/r/pull/1",
  );
  expect(parsePrRef("PR #29194")).toBe("29194");
  expect(parsePrRef("staging への deploy")).toBe(null);
});

test("対応が要らない CI の進行と merge 可否の再計算は変化として扱わない", () => {
  expect(
    describeChanges(
      { ...PR, checks: "PENDING:2", mergeStateStatus: "UNKNOWN" },
      { ...PR, checks: "SUCCESS:3", mergeStateStatus: "CLEAN" },
    ),
  ).toEqual([]);
  expect(describeChanges(PR, { ...PR, mergeStateStatus: "BEHIND" })).toEqual(
    [],
  );
  expect(describeChanges(PR, { ...PR, mergeStateStatus: "DIRTY" })).toEqual([
    "mergeStateStatus: BLOCKED → DIRTY",
  ]);
});

test("approve 済みの PR が base に遅れたら変化として扱う", () => {
  const approved: PrSnapshot = {
    ...PR,
    reviewDecision: "APPROVED",
    mergeStateStatus: "CLEAN",
  };
  expect(
    describeChanges(approved, { ...approved, mergeStateStatus: "BEHIND" }),
  ).toEqual(["mergeStateStatus: CLEAN → BEHIND"]);
  // BEHIND のまま approve されたときは reviewDecision の変化で投稿する
  expect(
    describeChanges(
      { ...PR, mergeStateStatus: "BEHIND" },
      { ...approved, mergeStateStatus: "BEHIND" },
    ),
  ).toEqual(["reviewDecision: REVIEW_REQUIRED → APPROVED"]);
  expect(
    buildContinuePrompt({
      verdict: "WAIT_EXTERNAL",
      target: null,
      pr: { ...approved, mergeStateStatus: "BEHIND" },
      changes: [],
    }),
  ).toContain("(OPEN, reviewDecision: APPROVED, mergeStateStatus: BEHIND)");
});

test("判定の入力は最後の返答を分け、ユーザー以外の入力を event として渡す", () => {
  // 1 分設定の動作確認で、Haiku が WAIT_USER を CONTINUE と誤判定した会話
  const last =
    "1 分ほど何もしないでいると、判定が走ります。確認が終わったら値を 30 分に戻します。";
  const prompt = buildJudgePrompt("", [
    {
      role: "event",
      text: "The person enabled mod hot-reloading for this session",
    },
    { role: "assistant", text: "mod が読み込まれました。" },
    { role: "user", text: "1分にかえてテスト" },
    { role: "assistant", text: last },
  ]);

  expect(prompt).toContain("[event]\nThe person enabled mod hot-reloading");
  expect(prompt).toContain(`<last_assistant>\n${last}\n</last_assistant>`);
  expect(prompt.split(last)).toHaveLength(2);
  expect(JUDGE_SYSTEM).toContain(
    "「確認が終わったら〜する」のように、ユーザー側の出来事を条件とする予告は WAIT_USER とする",
  );
});

test("conflict が発生したら投稿し、base が進んだだけなら投稿しない", async ($, on) => {
  const clock = mock.clock(on);
  const state = world(on);
  await $.session.start({
    cwd: "/repo",
    surface: "terminal",
    isInteractive: true,
  });

  await $.turn.complete(
    turn("PR #12 を作成しました。レビューを待っています。"),
  );
  await clock.advance(31 * MINUTE);
  await $.turn.complete(turn("レビューはまだありません。\nSTATUS: waiting"));
  expect(state.submitted).toHaveLength(1);

  state.pr = { ...state.pr, mergeStateStatus: "BEHIND" };
  await clock.advance(40 * MINUTE);
  expect(state.submitted).toHaveLength(1);

  state.pr = { ...state.pr, mergeStateStatus: "DIRTY" };
  await clock.advance(5 * MINUTE);
  expect(state.submitted).toHaveLength(2);
  expect(state.submitted[1]).toContain(
    "前回からの変化: mergeStateStatus: BEHIND → DIRTY",
  );
  expect(state.submitted[1]).toContain(
    "mergeStateStatus が DIRTY (conflict) のとき",
  );
});
