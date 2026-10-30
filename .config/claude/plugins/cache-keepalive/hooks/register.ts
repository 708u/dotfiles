import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import type { Warmth } from "../types";

const MINUTE = 60 * 1000;
const CACHE_TTL = 60 * MINUTE;
// 期限のこの時間前から判定を始める。入力中で見送っても再判定の余裕を残す
const REFRESH_WINDOW = 5 * MINUTE;
// 期限がここまで迫ったら入力中でも fork する。fork は prompt box と transcript に触れない
const LAST_CHANCE = 1 * MINUTE;
const TYPING_GRACE = 1 * MINUTE;
const POLL_INTERVAL = 30 * 1000;

const warmth = atom(
  { plugin: "cache-keepalive", key: "warmth" } as const,
  null
);
const isTurnRunning = atom(
  { plugin: "cache-keepalive", key: "isTurnRunning" } as const,
  false
);

let lastEditAt = 0;
let isForking = false;
// cache の期限はリクエストを送り始めた時刻から数えるため、turn の終了時刻では生成時間の分だけ遅く見積もる
let lastRequestStartedAt: number | null = null;
// 放置がこれを超えたら戻らないと見て止める。fork 1 回の cache read は、model により作り直しの 1/80〜1/20
let maxIdle = 6 * 60 * MINUTE;

// fork は transcript に残らないため、送った回数と cache の当たり外れを後から確かめる手段として残す
async function appendLog($: EngineInterface, entry: Record<string, unknown>) {
  try {
    const home = await $.env.get("HOME");
    const path = `${home}/.cache/claude-cache-keepalive/${await $.session.id()}.jsonl`;
    const previous = (await $.fs.exists(path))
      ? ((await $.fs.read(path)) as string)
      : "";
    await $.fs.write(path, `${previous}${JSON.stringify(entry)}\n`);
  } catch (error) {
    $.ui.log(`cache-keepalive: log write failed (${String(error)})`, {
      to: "debug",
    });
  }
}

async function tick($: EngineInterface) {
  const state = await read($, warmth);
  if (state === null || isForking || (await read($, isTurnRunning))) return;

  const now = await $.clock.now();
  const remaining = state.refreshedAt + CACHE_TTL - now;
  // 期限切れ後の fork は prefix を cache なしで送るだけで、延長にならない
  if (remaining <= 0 || remaining > REFRESH_WINDOW) return;
  if (now - state.respondedAt > maxIdle) return;
  if (now - lastEditAt < TYPING_GRACE && remaining > LAST_CHANCE) return;
  if ((await $.session.model()) !== state.model) return;

  isForking = true;
  try {
    const reply = await $.model.fork({ prompt: "Reply with only: ok" });
    const cacheRead =
      "usage" in reply ? reply.usage.cache_read_input_tokens : 0;
    await appendLog($, {
      at: new Date(now).toISOString(),
      minutesSinceResponse: Math.round((now - state.respondedAt) / MINUTE),
      forks: state.forks + 1,
      isAnswered: reply.isAnswered,
      reason: reply.isAnswered ? undefined : reply.reason,
      usage: "usage" in reply ? reply.usage : undefined,
    });
    if (cacheRead === 0) {
      const reason = reply.isAnswered ? "no cache read" : reply.reason;
      $.ui.log(`cache-keepalive: refresh missed (${reason})`, { to: "debug" });
      // 529 などの一時的な失敗は cache 自体が切れたわけではないため、期限までの次の判定で再試行する
      if (reply.isAnswered || reply.reason === "nothing-to-fork") {
        // 当たらなかった cache を延長し続けても費用だけかかるため、次の main の応答まで止める
        await update($, warmth, () => null);
        $.ui.status(undefined);
      }
      return;
    }
    const next = await update($, warmth, (w) =>
      w === null ? w : { ...w, refreshedAt: now, forks: w.forks + 1 }
    );
    if (next !== null) $.ui.status(`cache keepalive ${next.forks}`);
  } finally {
    isForking = false;
  }
}

// 打鍵ごとに host への往復を待つと入力の反映が遅れるため、hook は時刻の取得を待たずに next へ渡す
function markEdit($: EngineInterface) {
  void $.clock.now().then((at) => {
    lastEditAt = at;
  });
}

export const register: Register = (on, options) => {
  maxIdle = Number(options.maxIdleHours ?? 6) * 60 * MINUTE;

  on("session.start", ($, e, next) => {
    $.clock.every(POLL_INTERVAL, () =>
      tick($).catch((error) =>
        $.ui.log(`cache-keepalive: tick failed (${String(error)})`, {
          to: "debug",
        })
      )
    );
    return next(e);
  });

  on("prompt.edit", ($, e, next) => {
    markEdit($);
    return next(e);
  });

  on("prompt.change", ($, e, next) => {
    markEdit($);
    return next(e);
  });

  on("turn.start", async ($, e, next) => {
    if (e.agentId === undefined && !isForking) {
      lastRequestStartedAt = null;
      await update($, isTurnRunning, () => true);
    }
    return next(e);
  });

  on("turn.step", async function* ($, e, next) {
    if (e.agentId === undefined && !isForking)
      lastRequestStartedAt = await $.clock.now();
    return yield* next(e);
  });

  on("turn.complete", async ($, e, next) => {
    // subagent の応答は main thread の prefix を温めない
    if (e.agentId !== undefined || isForking) return next(e);

    // API エラーで終わった turn と、リクエストを送る前に中断した turn は cache を書いていないため、期限の起点を前の応答のまま残す
    if (
      e.reason === "error" ||
      (e.reason === "aborted" && lastRequestStartedAt === null)
    ) {
      await update($, isTurnRunning, () => false);
      return next(e);
    }

    const now = await $.clock.now();
    const model = await $.session.model();
    const fresh: Warmth = {
      respondedAt: now,
      // turn の途中で module が読み込み直されると送り始めの時刻が残らないため、終了時刻で代用する
      refreshedAt: lastRequestStartedAt ?? now,
      model,
      forks: 0,
    };
    await update($, warmth, () => fresh);
    await update($, isTurnRunning, () => false);
    $.ui.status(undefined);
    return next(e);
  });

  // 状態の更新に失敗しても compact の結果はそのまま返す。catch の next は呼び済みなら再実行されない
  on("session.compact", async ($, e, next) => {
    const result = await next(e);
    // fork は compact 前の transcript を送るため、以後のリクエストが読まない prefix を温めることになる。precompute は要約を用意するだけで transcript を置き換えない
    if (
      e.agentId === undefined &&
      e.trigger !== "precompute" &&
      result.messages !== undefined
    ) {
      await update($, warmth, () => null);
      $.ui.status(undefined);
    }
    return result;
  }).catch(($, e, next) => next(e));
};
