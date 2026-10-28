import { expect, test } from "claude-code/testing";
import type { Engine, TestBody } from "claude-code/testing";

type On = Parameters<TestBody>[1];

const PANE = {
  plugin: "review-diff",
  component: "Pane",
  requestId: "review-diff",
  props: {
    title: "Review diff",
    isFocused: true,
    bodyColumns: 80,
    placement: "dock",
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const;

const WORKTREES = [
  "worktree /repo",
  "HEAD aaa",
  "branch refs/heads/staging",
  "",
  "worktree /repo-wt/feat",
  "HEAD bbb",
  "branch refs/heads/feat",
  "",
].join("\n");

// 行の位置: 0 hunk, 1 " def foo" (L1), 2 "-  1" (削除 L2), 3 "+  2" (L2), 4 "+  3" (L3)
const DIFF = [
  "diff --git a/app/a.rb b/app/a.rb",
  "index 111..222 100644",
  "--- a/app/a.rb",
  "+++ b/app/a.rb",
  "@@ -1,2 +1,3 @@",
  " def foo",
  "-  1",
  "+  2",
  "+  3",
  "",
].join("\n");

type GhAnswers = { view: string; graphql: string };

async function startSession(
  $: Engine,
  on: On,
  diff = DIFF,
  gh: GhAnswers | null = null
) {
  const submitted: string[] = [];
  const diffCwds: string[] = [];

  on("ui.log", () => ({ value: undefined }));
  on("command.register", () => ({ value: { command: "review-diff" } }));
  on("session.start", (_, e) => ({ cwd: e.cwd }));
  on("session.root", () => ({ value: "/repo" }));
  on("session.cwd", () => ({ value: "/repo" }));
  on("ui.panes", () => ({ value: [] }));
  on("ui.toast", () => ({ value: undefined }));
  on("clock.now", () => ({ value: 1 }));
  on("process.run", (_, e) => {
    const args = e.argv.slice(1).join(" ");
    const out = (stdout: string, exitCode = 0) => ({
      value: {
        exitCode,
        stdout,
        stderr: "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    });
    if (e.argv[0] === "gh") {
      if (gh === null) return out("", 1);
      return out(args.startsWith("pr view") ? gh.view : gh.graphql);
    }
    if (args.startsWith("worktree list")) return out(WORKTREES);
    if (args.startsWith("diff")) {
      diffCwds.push(e.init?.cwd ?? "");
      return out(diff);
    }

    return out("");
  });
  on("prompt.submit", (_, e) => {
    submitted.push(e.text);

    return { text: e.text };
  });

  await $.session.start({
    cwd: "/repo",
    surface: "terminal",
    isInteractive: true,
  });

  return { submitted, diffCwds };
}

test("複数行をドラッグしてコメントし Claude に送ると prompt になる", async ($, on) => {
  const { submitted, diffCwds } = await startSession($, on);

  for (const surface of ["terminal", "desktop"] as const) {
    const ui = await $.ui.mount({ ...PANE, surface });

    await ui.press({ key: "pick-worktree" });
    await ui.press({ key: "worktree:/repo-wt/feat" });
    expect(diffCwds.at(-1)).toBe("/repo-wt/feat");

    await ui.pointer({
      in: "diff-0",
      type: "down",
      x: 2,
      y: 3,
      button: "left",
    });
    await ui.pointer({
      in: "diff-0",
      type: "move",
      x: 2,
      y: 4,
      button: "left",
    });
    await ui.pointer({ in: "diff-0", type: "up", x: 2, y: 4, button: "left" });
    await ui.input({ key: "comment", text: "定数にする" });
    expect(await ui.find({ type: "Text", text: /^ 自分 $/ })).toBeDefined();
    expect((await ui.find({ type: "Text", text: /コメント 1 件/ }))?.text).toBe(
      "コメント 1 件"
    );

    await ui.press({ key: "submit" });
    const text = submitted.at(-1) ?? "";
    expect(text).toContain("対象 worktree: /repo-wt/feat (branch: feat)");
    expect(text).toContain("1. app/a.rb:L2-L3");
    expect(text).toContain("     +   2\n     +   3");
    expect(text).toContain("コメント: 定数にする");
    expect(
      await ui.find({ type: "Text", text: /コメント 0 件/ })
    ).toBeDefined();

    await ui.unmount();
  }
});

test("クリック後に Shift+↓ で範囲を広げ Enter でコメントできる", async ($, on) => {
  const { submitted } = await startSession($, on);
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });

  await ui.press({ key: "pick-worktree" });
  await ui.press({ key: "worktree:/repo-wt/feat" });
  await ui.pointer({ in: "diff-0", type: "down", x: 2, y: 1, button: "left" });
  await ui.pointer({ in: "diff-0", type: "up", x: 2, y: 1, button: "left" });
  expect(await ui.find({ key: "comment" })).toBeUndefined();

  await ui.key({ in: "diff-0", key: "down", shift: true });
  await ui.key({ in: "diff-0", key: "return" });
  await ui.input({ key: "comment", text: "削除の理由を書く" });
  await ui.press({ key: "submit" });

  const text = submitted.at(-1) ?? "";
  expect(text).toContain("1. app/a.rb:L1 (削除行 L2 を含む)");
  expect(text).toContain("       def foo\n     -   1");
  await ui.unmount();
});

test("Shift+↑ を続けて押すと上方向へ途切れずに広がる", async ($, on) => {
  const { submitted } = await startSession($, on);
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });

  await ui.press({ key: "pick-worktree" });
  await ui.press({ key: "worktree:/repo-wt/feat" });
  await ui.pointer({ in: "diff-0", type: "down", x: 2, y: 4, button: "left" });
  await ui.pointer({ in: "diff-0", type: "up", x: 2, y: 4, button: "left" });
  for (let i = 0; i < 3; i += 1) {
    await ui.key({ in: "diff-0", key: "up", shift: true });
  }
  await ui.key({ in: "diff-0", key: "return" });
  await ui.input({ key: "comment", text: "まとめて見直す" });
  await ui.press({ key: "submit" });

  expect(submitted.at(-1)).toContain("1. app/a.rb:L1-L3 (削除行 L2 を含む)");
  await ui.unmount();
});

test("入力欄を閉じると下書きが残り、再開できる", async ($, on) => {
  const { submitted } = await startSession($, on);
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });

  await ui.press({ key: "pick-worktree" });
  await ui.press({ key: "worktree:/repo-wt/feat" });
  await ui.pointer({ in: "diff-0", type: "down", x: 2, y: 3, button: "left" });
  await ui.pointer({ in: "diff-0", type: "up", x: 2, y: 4, button: "left" });
  await ui.input({ key: "comment", text: "書きかけ", kind: "change" });

  await ui.press({ key: "cancel" });
  expect(await ui.find({ key: "comment" })).toBeUndefined();
  expect(await ui.find({ key: "compose" })).toBeUndefined();
  expect(await ui.find({ type: "Text", text: /下書き 1 件/ })).toBeDefined();

  await ui.press({ key: "resume:app/a.rb:L2-L3" });
  expect((await ui.find({ key: "comment" }))?.props.value).toBe("書きかけ");
  await ui.input({ key: "comment", text: "書きかけを仕上げた" });
  expect(await ui.find({ type: "Text", text: /下書き/ })).toBeUndefined();

  await ui.press({ key: "submit" });
  expect(submitted.at(-1)).toContain("コメント: 書きかけを仕上げた");
  await ui.unmount();
});

test("コメントは対象行の直下に出て、キー操作はそれをまたいで広げられる", async ($, on) => {
  const { submitted } = await startSession($, on);
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });

  await ui.press({ key: "pick-worktree" });
  await ui.press({ key: "worktree:/repo-wt/feat" });
  for (let i = 0; i < 2; i += 1) {
    await ui.pointer({
      in: "diff-0",
      type: "down",
      x: 2,
      y: 1,
      button: "left",
    });
    await ui.pointer({ in: "diff-0", type: "up", x: 2, y: 1, button: "left" });
  }
  await ui.input({ key: "comment", text: "上のコメント" });

  expect(await ui.find({ type: "Text", text: /^上のコメント$/ })).toBeDefined();
  expect(await ui.find({ key: "diff-2" })).toBeDefined();

  await ui.pointer({ in: "diff-0", type: "down", x: 2, y: 1, button: "left" });
  await ui.pointer({ in: "diff-0", type: "up", x: 2, y: 1, button: "left" });
  for (let i = 0; i < 3; i += 1) {
    await ui.key({ in: "diff-0", key: "down", shift: true });
  }
  await ui.key({ in: "diff-0", key: "return" });
  await ui.input({ key: "comment", text: "またいだ範囲" });
  await ui.press({ key: "submit" });

  const text = submitted.at(-1) ?? "";
  expect(text).toContain("1. app/a.rb:L1\n");
  expect(text).toContain("2. app/a.rb:L1-L3 (削除行 L2 を含む)");
  await ui.unmount();
});

test("長い行は折り返し、続きの行を押してもその行が選ばれる", async ($, on) => {
  const longDiff = [
    "diff --git a/app/a.rb b/app/a.rb",
    "--- a/app/a.rb",
    "+++ b/app/a.rb",
    "@@ -0,0 +1,2 @@",
    `+${"a".repeat(100)}`,
    "+short",
    "",
  ].join("\n");
  const { submitted } = await startSession($, on, longDiff);
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });

  await ui.press({ key: "pick-worktree" });
  await ui.press({ key: "worktree:/repo-wt/feat" });
  await ui.resize({ in: "diff-0", columns: 40, rows: 10 });
  // 0 行目は見出し、1〜4 行目が長い行 L1 の折り返し、5 行目が L2。折り返さなければ 3 行目は L2 になる
  for (let i = 0; i < 2; i += 1) {
    await ui.pointer({
      in: "diff-0",
      type: "down",
      x: 2,
      y: 3,
      button: "left",
    });
    await ui.pointer({ in: "diff-0", type: "up", x: 2, y: 3, button: "left" });
  }
  await ui.input({ key: "comment", text: "長い" });
  await ui.press({ key: "submit" });

  expect(submitted.at(-1)).toContain("1. app/a.rb:L1\n");
  await ui.unmount();
});

test("hunk の見出し行は選べず、範囲にも入らない", async ($, on) => {
  const { submitted } = await startSession($, on);
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });

  await ui.press({ key: "pick-worktree" });
  await ui.press({ key: "worktree:/repo-wt/feat" });
  await ui.pointer({ in: "diff-0", type: "down", x: 2, y: 0, button: "left" });
  await ui.pointer({ in: "diff-0", type: "up", x: 2, y: 0, button: "left" });
  expect(await ui.find({ key: "compose" })).toBeUndefined();

  await ui.pointer({ in: "diff-0", type: "down", x: 2, y: 2, button: "left" });
  await ui.pointer({ in: "diff-0", type: "move", x: 2, y: 0, button: "left" });
  await ui.pointer({ in: "diff-0", type: "up", x: 2, y: 0, button: "left" });
  expect(await ui.find({ key: "comment" })).toBeUndefined();

  for (let i = 0; i < 2; i += 1) {
    await ui.key({ in: "diff-0", key: "up", shift: true });
  }
  await ui.key({ in: "diff-0", key: "return" });
  await ui.input({ key: "comment", text: "先頭まで" });
  await ui.press({ key: "submit" });

  const text = submitted.at(-1) ?? "";
  expect(text).toContain("1. app/a.rb:L1 (削除行 L2 を含む)");
  expect(text).not.toContain("@@");
  await ui.unmount();
});

test("worktree・比較基準・ファイルの一覧は行を押したときだけ開く", async ($, on) => {
  await startSession($, on);
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });

  expect(await ui.find({ key: "worktree:/repo-wt/feat" })).toBeUndefined();
  await ui.press({ key: "pick-worktree" });
  await ui.press({ key: "worktree:/repo-wt/feat" });
  expect(await ui.find({ key: "worktree:/repo-wt/feat" })).toBeUndefined();
  expect(await ui.find({ type: "Text", text: /^feat$/ })).toBeDefined();

  expect(await ui.find({ key: "base:head" })).toBeUndefined();
  expect((await ui.find({ key: "pick-base" }))?.text).toMatch(/^▸ /);
  await ui.press({ key: "pick-base" });
  expect((await ui.find({ key: "pick-base" }))?.text).toMatch(/^▾ /);
  expect((await ui.find({ key: "base:head" }))?.text).toContain("● ");
  await ui.press({ key: "base:branch" });
  expect(await ui.find({ key: "base:branch" })).toBeUndefined();
  expect(
    await ui.find({ type: "Text", text: /^merge-base からの全体/ })
  ).toBeDefined();

  expect(await ui.find({ key: "file:app/a.rb" })).toBeUndefined();
  expect(await ui.find({ key: "diff-0" })).toBeDefined();
  await ui.press({ key: "pick-file" });
  expect(await ui.find({ key: "file:app/a.rb" })).toBeDefined();
  expect(await ui.find({ key: "diff-0" })).toBeUndefined();
  expect(await ui.find({ key: "submit" })).toBeUndefined();
  await ui.press({ key: "pick-file" });
  expect(await ui.find({ key: "file:app/a.rb" })).toBeUndefined();
  expect(await ui.find({ key: "diff-0" })).toBeDefined();
  await ui.unmount();
});

test("PR の未解決コメントを対象行に出し、選んだものを Claude に送る", async ($, on) => {
  const thread = (fields: Record<string, unknown>) => ({
    isResolved: false,
    isOutdated: false,
    diffSide: "RIGHT",
    ...fields,
  });
  const graphql = JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [
              thread({
                id: "T1",
                path: "app/a.rb",
                line: 2,
                comments: {
                  nodes: [
                    {
                      author: { login: "alice" },
                      body: "ここ直して\n理由はこれ",
                      diffHunk: "@@ -1,2 +1,3 @@\n def foo\n-  1\n+  2",
                    },
                  ],
                },
              }),
              thread({
                id: "T2",
                isResolved: true,
                path: "app/a.rb",
                line: 3,
                comments: {
                  nodes: [
                    {
                      author: { login: "bob" },
                      body: "解決済み",
                      diffHunk: "",
                    },
                  ],
                },
              }),
              thread({
                id: "T3",
                isOutdated: true,
                path: "app/b.rb",
                line: 5,
                comments: {
                  nodes: [
                    {
                      author: { login: "carol" },
                      body: "古い指摘",
                      diffHunk: "",
                    },
                  ],
                },
              }),
            ],
          },
        },
      },
    },
  });
  const { submitted } = await startSession($, on, DIFF, {
    view: JSON.stringify({ number: 7, url: "https://github.com/o/r/pull/7" }),
    graphql,
  });
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });

  await ui.press({ key: "pick-worktree" });
  await ui.press({ key: "worktree:/repo-wt/feat" });
  expect(
    await ui.find({ type: "Text", text: /^#7 未解決 2 件$/ })
  ).toBeDefined();
  expect(await ui.find({ type: "Text", text: /^ alice $/ })).toBeDefined();
  expect(await ui.find({ type: "Text", text: /解決済み/ })).toBeUndefined();

  // 枠の見出しを押すと本文が 1 行にたたまれ、もう一度押すと開く
  expect(await ui.find({ type: "Text", text: /^理由はこれ$/ })).toBeDefined();
  await ui.press({ key: "fold:T1" });
  expect(await ui.find({ type: "Text", text: /^理由はこれ$/ })).toBeUndefined();
  expect(await ui.find({ type: "Text", text: /^ ここ直して$/ })).toBeDefined();
  await ui.press({ key: "fold:T1" });
  expect(await ui.find({ type: "Text", text: /^理由はこれ$/ })).toBeDefined();

  await ui.press({ key: "pick-pr" });
  await ui.press({ key: "thread:T1" });
  expect((await ui.find({ key: "thread:T3" }))?.text).toContain(
    "PR 上で outdated"
  );
  await ui.press({ key: "thread:T3" });
  expect((await ui.find({ key: "include-all-threads" }))?.text).toBe(
    "すべて外す"
  );
  await ui.press({ key: "include-all-threads" });
  expect(
    await ui.find({ type: "Text", text: /Claude に送る 0 件/ })
  ).toBeDefined();
  await ui.press({ key: "include-all-threads" });
  await ui.press({ key: "pick-pr" });
  expect(
    await ui.find({ type: "Text", text: /Claude に送る 2 件/ })
  ).toBeDefined();

  await ui.press({ key: "submit" });
  const text = submitted.at(-1) ?? "";
  expect(text).toContain("GitHub PR #7 (https://github.com/o/r/pull/7)");
  expect(text).toContain(
    "1. app/a.rb:L2\n   コード:   2\n   @alice:\n     ここ直して\n     理由はこれ"
  );
  expect(text).toContain("2. app/b.rb:L5\n   @carol:\n     古い指摘");
  expect(
    await ui.find({ type: "Text", text: /Claude に送る 0 件/ })
  ).toBeDefined();
  await ui.unmount();

  // 幅 20 では枠・▸・名前のラベルを除くと 6 桁しか残らず、本文の 1 行目は切り詰められる
  const narrow = await $.ui.mount({
    ...PANE,
    surface: "terminal",
    props: { ...PANE.props, bodyColumns: 20 },
  });
  await narrow.press({ key: "fold:T1" });
  expect(await narrow.find({ type: "Text", text: /^ ここ…$/ })).toBeDefined();
  await narrow.unmount();
});

test("Client の無い vscode では行を押してコメントできる", async ($, on) => {
  const { submitted } = await startSession($, on);
  const ui = await $.ui.mount({ ...PANE, surface: "vscode" });

  await ui.press({ key: "pick-worktree" });
  await ui.press({ key: "worktree:/repo-wt/feat" });
  await ui.press({ key: "line:3" });
  await ui.input({ key: "comment", text: "定数にする" });
  await ui.press({ key: "submit" });

  expect(submitted.at(-1)).toContain("1. app/a.rb:L2\n");
  await ui.unmount();
});

test("セッション開始時は読み込みより先に、キーボードを移さず pane を開く", async ($, on) => {
  const events: string[] = [];
  on("ui.open", (_, e) => {
    events.push(`open:${e.id}:${e.focus === true ? "focus" : "no-focus"}`);

    return { value: { isPlaced: true } };
  });
  const { diffCwds } = await startSession($, on);

  // 読み込みは session.start を待たせずに進むので、終わるまで engine とのやり取りを挟んで待つ
  for (let i = 0; i < 50 && !diffCwds.includes("/repo"); i += 1) {
    const probe = await $.ui.mount({ ...PANE, surface: "terminal" });
    await probe.unmount();
  }

  expect(diffCwds).toContain("/repo");
  expect(events).toEqual(["open:review-diff:no-focus"]);
});

test("twig add で増えた worktree にレビュー対象が移る", async ($, on) => {
  let porcelain = "worktree /repo\nHEAD aaa\nbranch refs/heads/staging\n";
  const diffCwds: string[] = [];
  const toasts: string[] = [];

  on("command.register", () => ({ value: { command: "review-diff" } }));
  on("session.start", (_, e) => ({ cwd: e.cwd }));
  on("session.root", () => ({ value: "/repo" }));
  on("session.cwd", () => ({ value: "/repo" }));
  on("ui.panes", () => ({ value: [] }));
  on("ui.toast", (_, e) => {
    toasts.push(e.text);

    return { value: undefined };
  });
  on("process.run", (_, e) => {
    const args = e.argv.slice(1).join(" ");
    if (args.startsWith("diff")) diffCwds.push(e.init?.cwd ?? "");

    return {
      value: {
        exitCode: 0,
        stdout: args.startsWith("worktree list") ? porcelain : "",
        stderr: "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });
  on("tool.call", () => {
    porcelain +=
      "\nworktree /repo-wt/new\nHEAD ccc\nbranch refs/heads/708u/new\n";

    return { result: {} };
  });

  await $.session.start({
    cwd: "/repo",
    surface: "terminal",
    isInteractive: true,
  });
  await $.tool.call({ tool: "Bash", command: "twig add 708u/new" });

  expect(diffCwds.at(-1)).toBe("/repo-wt/new");
  expect(toasts.at(-1)).toContain("708u/new");
});
