import { expect, mock, test } from "claude-code/testing";
import type { ModelForkResult, On, PromptEditInput } from "claude-code";
import type { Engine } from "claude-code/testing";

const MINUTE = 60 * 1000;
const SUMMARY = [{ role: "user" as const, text: "summary", toolUses: [] }];

const HIT = {
  input_tokens: 10,
  output_tokens: 1,
  cache_read_input_tokens: 50_000,
  cache_creation_input_tokens: 0,
};
const MISS = { ...HIT, cache_read_input_tokens: 0, input_tokens: 50_000 };

function engine(
  on: On,
  options: {
    models?: string[];
    usage?: typeof HIT;
    replies?: ModelForkResult[];
  } = {}
) {
  const clock = mock.clock(on);
  const models = options.models ?? ["opus"];
  let forks = 0;

  on("session.start", (_, e) => ({ cwd: e.cwd }));
  on("session.model", () => ({
    value: models.length > 1 ? models.shift()! : models[0]!,
  }));
  on("turn.start", (_, e) => ({ turnId: e.turnId }));
  on("turn.complete", (_, e) => ({ text: e.answer }));
  on("prompt.edit", (_, e) => ({ text: e.text, cursor: e.cursor }));
  on("ui.status", () => ({ value: undefined }));
  on("model.fork", () => {
    forks += 1;
    const reply: ModelForkResult = options.replies?.shift() ?? {
      isAnswered: true,
      text: "ok",
      usage: options.usage ?? HIT,
    };
    return { value: reply };
  });

  return { clock, forks: () => forks };
}

async function respond($: Engine) {
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  await $.turn.start({ text: "hi", turnId: "t1" });
  await $.turn.complete({
    answer: "hello",
    durationMs: 1,
    isAborted: false,
    turnId: "t1",
    reason: "answer",
  });
}

async function type($: Engine) {
  // NOTE: prompt.edit は engine が発火させるイベントで、testing kit の型には呼び出しとして載っていない
  const prompt = ($.prompt as unknown) as {
    edit: (e: PromptEditInput) => Promise<unknown>;
  };
  await prompt.edit({
    origin: { kind: "composer" },
    text: "",
    cursor: 0,
    start: 0,
    end: 0,
    inputText: "a",
  });
}

test("放置中は期限の 5 分前に fork し、6 時間の放置で止まる", async ($, on) => {
  const { clock, forks } = engine(on);
  await respond($);

  await clock.advance(54 * MINUTE);
  expect(forks()).toBe(0);

  await clock.advance(2 * MINUTE);
  expect(forks()).toBe(1);

  await clock.advance(10 * 60 * MINUTE);
  expect(forks()).toBe(6);
});

test("入力中は見送り、期限の 1 分前には入力中でも fork する", async ($, on) => {
  const { clock, forks } = engine(on);
  await respond($);

  await clock.advance(54.5 * MINUTE);
  for (let i = 0; i < 8; i++) {
    await type($);
    await clock.advance(MINUTE / 2);
  }
  expect(forks()).toBe(0);

  await type($);
  await clock.advance(MINUTE / 2);
  expect(forks()).toBe(1);
});

test("最後の応答のあとに model が切り替わったら fork しない", async ($, on) => {
  const { clock, forks } = engine(on, { models: ["opus", "sonnet"] });
  await respond($);

  await clock.advance(60 * MINUTE);
  expect(forks()).toBe(0);
});

test("compact のあとは次の応答まで fork しない", async ($, on) => {
  const { clock, forks } = engine(on);
  on("session.compact", () => ({ messages: SUMMARY }));
  await respond($);

  await $.session.compact({ trigger: "manual", messages: SUMMARY });
  await clock.advance(60 * MINUTE);
  expect(forks()).toBe(0);
});

test("fork が cache に当たらなければ次の応答まで止まる", async ($, on) => {
  const { clock, forks } = engine(on, { usage: MISS });
  await respond($);

  await clock.advance(3 * 60 * MINUTE);
  expect(forks()).toBe(1);
});

test("fork のたびに session ごとのファイルへ 1 行追記する", async ($, on) => {
  const { clock } = engine(on);
  const files = new Map<string, string>();
  on("env.get", () => ({ value: "/home/me" }));
  on("session.id", () => ({ value: "s1" }));
  on("fs.exists", (_, e) => ({ value: files.has(e.path) }));
  on("fs.read", (_, e) => ({ value: files.get(e.path) ?? "" }));
  on("fs.write", (_, e) => {
    files.set(e.path, e.text);
    return { value: undefined };
  });
  await respond($);

  await clock.advance(2 * 60 * MINUTE);
  const lines = files
    .get("/home/me/.cache/claude-cache-keepalive/s1.jsonl")
    ?.trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(lines?.map((l) => [l.forks, l.minutesSinceResponse])).toEqual([
    [1, 55],
    [2, 110],
  ]);
});

test(
  "放置の上限を 1 時間にすると fork は 1 回で止まる",
  { options: { maxIdleHours: "1" } },
  async ($, on) => {
    const { clock, forks } = engine(on);
    await respond($);

    await clock.advance(5 * 60 * MINUTE);
    expect(forks()).toBe(1);
  }
);

test("期限は turn の終了ではなく最後のリクエストを送り始めた時刻から数える", async ($, on) => {
  const { clock, forks } = engine(on);
  on("turn.step", async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: "",
      toolUses: [],
      stopReason: "end_turn" as const,
      usage: null,
    };
  });
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  await $.turn.start({ text: "hi", turnId: "t1" });
  // result は stream を最後まで読み進めてから確定する
  const step = $.turn.step({
    turnId: "t1",
    index: 0,
    model: "opus",
    messageCount: 1,
  });
  for await (const _ of step);
  await step.result;
  await clock.advance(6 * MINUTE);
  await $.turn.complete({
    answer: "hello",
    durationMs: 6 * MINUTE,
    isAborted: false,
    turnId: "t1",
    reason: "answer",
  });

  await clock.advance(50 * MINUTE);
  expect(forks()).toBe(1);
});

test("API エラーで終わった turn は期限の起点を動かさない", async ($, on) => {
  const { clock, forks } = engine(on);
  await respond($);

  await clock.advance(30 * MINUTE);
  await $.turn.start({ text: "again", turnId: "t2" });
  await $.turn.complete({
    answer: "",
    durationMs: 1,
    isAborted: false,
    turnId: "t2",
    reason: "error",
  });

  await clock.advance(26 * MINUTE);
  expect(forks()).toBe(1);
});

test("fork が一時的な API エラーになったら次の判定で再試行する", async ($, on) => {
  const { clock, forks } = engine(on, {
    replies: [
      {
        isAnswered: false,
        reason: "api-error",
        status: 529,
        error: "overloaded",
        usage: { ...HIT, cache_read_input_tokens: 0 },
      },
    ],
  });
  await respond($);

  await clock.advance(55.5 * MINUTE);
  expect(forks()).toBe(2);

  await clock.advance(55 * MINUTE);
  expect(forks()).toBe(3);
});

test("リクエストを送る前に中断した turn は期限の起点を動かさない", async ($, on) => {
  const { clock, forks } = engine(on);
  await respond($);

  await clock.advance(40 * MINUTE);
  await $.turn.start({ text: "hi", turnId: "t2" });
  await $.turn.complete({
    answer: "",
    durationMs: 1,
    isAborted: true,
    turnId: "t2",
    reason: "aborted",
  });

  await clock.advance(16 * MINUTE);
  expect(forks()).toBe(1);
});

test("precompute の compact では fork を止めない", async ($, on) => {
  const { clock, forks } = engine(on);
  on("session.compact", () => ({ messages: SUMMARY }));
  await respond($);

  await $.session.compact({ trigger: "precompute", messages: SUMMARY });
  await clock.advance(56 * MINUTE);
  expect(forks()).toBe(1);
});
