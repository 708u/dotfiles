import { beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./gate";

let root: string;
let repo: string;
let store: string;

beforeEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = mkdtempSync(join(tmpdir(), "natural-japanese-gate-"));
  repo = join(root, "repo");
  store = join(root, "store");
  mkdirSync(repo);
  mkdirSync(join(store, "approved"), { recursive: true });
  Bun.spawnSync(["git", "init", "-q", repo]);
  writeFileSync(
    join(repo, "doc.md"),
    [
      "# Doc",
      "",
      "- 未完了のサブタスクがある。`get_task` は各サブタスクが完了しているかどうかを返さないため、各サブタスクを取得する",
      "- trace には session の cookie が記録される",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(repo, "a.sh"),
    [
      "#!/bin/bash",
      "# 設定ファイルが無い環境では既定値を使う",
      "echo hi",
      "",
    ].join("\n"),
  );
});

const approve = (name: string, text: string) =>
  writeFileSync(join(store, "approved", name), text);

const decide = (tool_name: string, tool_input: object) =>
  run(JSON.stringify({ tool_name, tool_input }), store)?.hookSpecificOutput
    ? "deny"
    : "allow";

const edit = (file: string, new_string: string, old_string = "ZZZ") =>
  decide("Edit", { file_path: join(repo, file), old_string, new_string });

const bash = (command: string) => decide("Bash", { command });

describe("Edit", () => {
  test("日本語を変えずに識別子を足した文は通す", () => {
    expect(
      edit(
        "doc.md",
        "- 未完了のサブタスクがある。`get_task` は各サブタスクが完了しているかどうかを返さないため、`get_task(task_id=<gid>)` で各サブタスクを取得する",
      ),
    ).toBe("allow");
  });

  test("既存の文の語尾の修正は通す", () => {
    expect(edit("doc.md", "- trace には session の cookie を記録する")).toBe(
      "allow",
    );
  });

  test("新しい文はブロックし、同じ内容の再試行は 1 回だけ通す", () => {
    const line = "- 組織の担当者として画面を開き、候補者の一覧を確認する";
    expect(edit("doc.md", line)).toBe("deny");
    expect(edit("doc.md", line)).toBe("allow");
    expect(edit("doc.md", line)).toBe("deny");
  });

  test("大きな書き換えはブロックする", () => {
    expect(
      edit(
        "doc.md",
        "- trace にはユーザーが閲覧したページの履歴がすべて保存される",
      ),
    ).toBe("deny");
  });

  test("コードのコメントの小さな修正は通し、新しいコメントはブロックする", () => {
    expect(edit("a.sh", "# 設定ファイルが無い環境では既定の値を使う")).toBe(
      "allow",
    );
    expect(edit("a.sh", "# 値を返す")).toBe("deny");
  });

  test("小さな修正でも合計の変更が多ければブロックする", () => {
    expect(
      edit(
        "doc.md",
        "- 未完了のタスクがある。`get_task` は各タスクが終わったかを返さないので、各タスクを取る\n- trace には cookie を保存する",
      ),
    ).toBe("deny");
  });

  test("行の一部の置換は、行全体で判定する", () => {
    expect(edit("doc.md", "の `cookie` が", "の cookie が")).toBe("allow");
    expect(
      edit(
        "doc.md",
        "が記録される。ユーザーの閲覧履歴も別の場所に残す",
        "が記録される",
      ),
    ).toBe("deny");
  });

  test("MultiEdit は各編集を判定する", () => {
    expect(
      decide("MultiEdit", {
        file_path: join(repo, "doc.md"),
        edits: [
          { old_string: "session", new_string: "`session`" },
          { old_string: "# Doc", new_string: "# 新しい文書の見出しを書く" },
        ],
      }),
    ).toBe("deny");
  });

  test("Write は既存のファイルと比べる", () => {
    expect(
      decide("Write", {
        file_path: join(repo, "doc.md"),
        content: "# Doc\n\n- trace には `session` の cookie が記録される\n",
      }),
    ).toBe("allow");
  });

  test("git で管理されていないファイルは対象外", () => {
    expect(
      decide("Write", {
        file_path: join(root, "outside.md"),
        content: "新しい文を書く",
      }),
    ).toBe("allow");
  });
});

describe("Bash", () => {
  test("変数で指定した本文のファイルを読み込む", () => {
    writeFileSync(join(root, "msg.txt"), "feat: 設定を読み込む\n");
    expect(bash(`D=${root}; git commit -F "$D/msg.txt"`)).toBe("deny");
    approve("msg.txt", "feat: 設定を読み込む\n");
    expect(bash(`D=${root}; git commit -F "$D/msg.txt"`)).toBe("allow");
  });

  test("展開できない変数のパスは、再試行してもブロックする", () => {
    expect(bash("git commit -F $UNDEFINED_PATH/msg.txt")).toBe("deny");
    expect(bash("git commit -F $UNDEFINED_PATH/msg.txt")).toBe("deny");
  });

  test("gh api の -F key=@file を読み込む", () => {
    writeFileSync(join(root, "reply.txt"), "ご指摘の箇所を直しました\n");
    approve("reply.txt", "ご指摘の箇所を直しました\n");
    expect(
      bash(
        `gh pr comment 1 --body-file ${root}/reply.txt && gh api repos/o/r/pulls/1/comments -F body=@${root}/reply.txt`,
      ),
    ).toBe("allow");
  });

  test("sed の置換式は本文として扱わない", () => {
    approve("msg.txt", "feat: 設定を読み込む\n");
    writeFileSync(join(root, "msg.txt"), "feat: 設定を読み込む\n");
    expect(
      bash(
        `perl -pi -e 's/旧い文を書き換える/新しい文に書き換える/' doc.md && git commit -F ${root}/msg.txt`,
      ),
    ).toBe("allow");
  });

  test.each([
    ["-m", 'git commit -m "fix: 新しい処理を加える"'],
    ["-am", 'git commit -am "fix: 新しい処理を加える"'],
    ["変数", "MSG='新しい処理を加える'; git commit -m \"$MSG\""],
    [
      "ヒアドキュメント",
      "git commit -m \"$(cat <<'EOF'\nfix: 新しい処理を加える\nEOF\n)\"",
    ],
    ["release --notes", 'gh release create v1 --notes "新しい処理を加える"'],
    ["release -n", 'gh release create v1 -n "新しい処理を加える"'],
  ])("%s の未承認の本文をブロックする", (_, command) => {
    expect(bash(command)).toBe("deny");
  });

  test("ヒアドキュメントで作るファイルは、ヒアドキュメントの本文で判定する", () => {
    expect(
      bash(
        `cat > ${root}/new.txt <<'EOF'\n本文を新しく書く\nEOF\ngh pr create --body-file ${root}/new.txt`,
      ),
    ).toBe("deny");
  });

  test("commit や gh 以外のコマンドは対象外", () => {
    expect(bash('echo "新しい処理を加える"')).toBe("allow");
  });
});

describe("Artifact と MCP", () => {
  test("承認済みの文はタグを除いて比べる", () => {
    approve("asana.txt", "1. 組織の担当者として /<slug>/scout を開く\n");
    expect(
      decide("mcp__claude_ai_Asana__create_tasks", {
        tasks: [{ notes: "1. 組織の担当者として /<slug>/scout を開く" }],
      }),
    ).toBe("allow");
  });

  test("書き込み用の MCP の未承認の文はブロックする", () => {
    expect(
      decide("mcp__claude_ai_Asana__create_tasks", {
        tasks: [{ notes: "候補者の一覧を新しく作る" }],
      }),
    ).toBe("deny");
  });

  test("読み込み用の MCP は対象外", () => {
    expect(
      decide("mcp__claude_ai_Asana__get_task", {
        query: "候補者の一覧を新しく作る",
      }),
    ).toBe("allow");
  });

  test("Artifact の未承認の文はブロックする", () => {
    writeFileSync(
      join(root, "page.html"),
      "<html><body><p>新しいページの説明を書く</p></body></html>\n",
    );
    expect(decide("Artifact", { file_path: join(root, "page.html") })).toBe(
      "deny",
    );
  });
});
