import type { SessionMessage } from "claude-code";
import { expect, test } from "claude-code/testing";

const PANE = {
  plugin: "session-summary",
  component: "Pane",
  requestId: "session-summary",
  props: {
    title: "セッションの要約",
    isFocused: false,
    bodyColumns: 50,
    placement: "dock",
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const;

const USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

const REPLY = JSON.stringify({
  topic: "要約ペインの構成を見直している。",
  open: ["表示項目を増やすか"],
  settings: [{ name: "モデル", value: "haiku" }],
  next: ["テストを更新する"],
});

test("ターン完了後にペインへ要約が表示される", async ($, on) => {
  let prompt = "";
  const messages: SessionMessage[] = [
    {
      role: "user",
      text: "<system-reminder>内部</system-reminder>要約ペインを作りたい",
      toolUses: [],
    },
    {
      role: "assistant",
      text: "作ります",
      toolUses: [{ tool: "Write", tool_use_id: "toolu_1", input: {} }],
    },
  ];
  on("session.messages", () => ({ value: messages }));
  on("model.complete", (_, e) => {
    prompt = e.prompt;
    return { value: { isAnswered: true, text: REPLY, usage: USAGE } };
  });
  on("clock.now", () => ({ value: 0 }));
  on("clock.after", () => ({ value: undefined }));
  on("turn.complete", (_, e) => ({ text: e.answer }));

  await $.turn.complete({
    answer: "",
    durationMs: 1,
    isAborted: false,
    turnId: "t1",
    reason: "answer",
  });

  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  // 要約はタイマーで切り離して走るため、描画に反映されるまで find を繰り返す
  for (let i = 0; i < 50; i++) {
    if (await ui.find({ type: "Text", text: /haiku/ })) break;
  }

  expect((await ui.find({ type: "Text", text: /haiku/ }))?.text).toBe(
    "- モデル: haiku"
  );
  expect((await ui.find({ type: "Text", text: /表示項目/ }))?.text).toBe(
    "- 表示項目を増やすか"
  );
  expect(prompt).toContain("使用ツール: Write");
  expect(prompt).not.toContain("内部");
  await ui.unmount();
});

test("更新に失敗したときだけ上部に理由を出す", async ($, on) => {
  let isFailed = false;
  on("state.get", ($, e, next) =>
    isFailed && e.key === "summary"
      ? {
          value: {
            value: {
              shape: "summary-2",
              value: {
                topic: "",
                open: [],
                settings: [],
                next: [],
                updatedAt: null,
                status: "error",
                error: "api-error",
              },
            },
            version: 1,
          },
        }
      : next(e)
  );

  const idle = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await idle.find({ type: "Text", text: /更新に失敗/ })).toBeUndefined();
  await idle.unmount();

  isFailed = true;
  const failed = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect((await failed.find({ type: "Text", text: /更新に失敗/ }))?.text).toBe(
    "更新に失敗: api-error"
  );
  await failed.unmount();
});

test("項目へのコメントを下書きにため、ペイン上部の送信ボタンでまとめて送る", async ($, on) => {
  const summary = {
    topic: "コメント機能を作っている。",
    open: ["送信方法を決める"],
    settings: [],
    next: [],
    updatedAt: 0,
    status: "idle",
  };
  on("state.get", ($, e, next) =>
    e.key === "summary"
      ? { value: { value: { shape: "summary-2", value: summary }, version: 1 } }
      : next(e)
  );
  let submitted = "";
  on("prompt.submit", (_, e) => {
    submitted = e.text ?? "";
    return { text: submitted };
  });
  const opened: unknown[] = [];
  on("ui.open", (_, e) => {
    opened.push(e.focus);
    return { value: { isPlaced: true } };
  });

  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  await ui.press({ key: "row-open-0" });

  expect(opened).toEqual([true]);
  await ui.input({ key: "comment-target", text: "submit で送る" });
  expect(
    (await ui.find({ type: "Text", text: /-> submit/ }))?.text
  ).toBe("  -> submit で送る");
  await ui.input({ key: "comment-general", text: "全体へのメモ" });

  expect(
    (await ui.find({ type: "Text", text: /下書き 2 件/ }))?.text
  ).toBeDefined();
  await ui.press({ key: "send" });

  expect(submitted).toBe(
    "セッションの要約へのコメントです。\n\n> 送信方法を決める\nsubmit で送る\n\n全体へのメモ"
  );
  expect(
    (await ui.find({ type: "Text", text: /下書き 0 件/ }))?.text
  ).toBeDefined();
  await ui.unmount();
});

test("下書きを編集できる", async ($, on) => {
  on("ui.open", () => ({ value: { isPlaced: true } }));

  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  await ui.input({ key: "comment-general", text: "書きかけ" });
  const editButton = await ui.find({ type: "Button", text: /-> 書きかけ/ });
  expect(editButton?.key).toBeDefined();
  await ui.press({ key: editButton?.key ?? "" });
  await ui.input({
    key: (editButton?.key ?? "").replace("row-edit-", "edit-"),
    text: "書き直した",
  });

  expect((await ui.find({ type: "Text", text: /書き直した/ }))?.text).toBe(
    "-> 書き直した"
  );
  expect(await ui.find({ type: "Text", text: /書きかけ/ })).toBeUndefined();
  await ui.unmount();
});

test("ペインからキーが外れると編集中の欄を閉じて下書きを元の表示に戻す", async ($, on) => {
  on("ui.open", () => ({ value: { isPlaced: true } }));

  const focused = await $.ui.mount({
    ...PANE,
    props: { ...PANE.props, isFocused: true },
    surface: "terminal",
  });
  await focused.input({ key: "comment-general", text: "残したい" });
  const editButton = await focused.find({ type: "Button", text: /残したい/ });
  await focused.press({ key: editButton?.key ?? "" });
  await focused.unmount();

  const blurred = await $.ui.mount({ ...PANE, surface: "terminal" });
  for (let i = 0; i < 50; i++) {
    if (await blurred.find({ type: "Text", text: /-> 残したい/ })) break;
  }

  expect(
    (await blurred.find({ type: "Text", text: /-> 残したい/ }))?.text
  ).toBe("-> 残したい");
  await blurred.unmount();
});
