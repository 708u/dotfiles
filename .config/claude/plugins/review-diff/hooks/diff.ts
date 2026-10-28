import type { EngineInterface } from "claude-code";

import type { DiffBase, DiffFile, DiffLine, Worktree } from "../types";

// pane に描けるテキストは 1 ツリーあたり 100,000 文字までなので、巨大な diff は先頭だけ保持する
const MAX_TOTAL_LINES = 20000;
const MAX_UNTRACKED = 50;
const MAX_LINE_CHARS = 400;

export type LoadedDiff = { files: DiffFile[]; baseLabel: string };

export async function git(
  $: EngineInterface,
  cwd: string,
  args: readonly string[]
) {
  return $.process.run(["git", ...args], { cwd, timeoutMs: 30000 });
}

export function parseWorktrees(porcelain: string): Worktree[] {
  const list: Worktree[] = [];
  for (const block of porcelain.split("\n\n")) {
    let path = "";
    let branch = "(detached)";
    let isBare = false;
    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
      else if (line.startsWith("branch "))
        branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
      else if (line === "bare") isBare = true;
    }
    if (path !== "" && !isBare) list.push({ path, branch });
  }

  return list;
}

export async function listWorktrees(
  $: EngineInterface,
  cwd: string
): Promise<Worktree[]> {
  const run = await git($, cwd, ["worktree", "list", "--porcelain"]);

  return run.exitCode === 0 ? parseWorktrees(run.stdout) : [];
}

/**
 * cwd を含む worktree のうち最も深いものを返す
 *
 * @param worktrees git worktree list の結果
 * @param cwd 判定するディレクトリ
 * @returns 該当する worktree、無ければ undefined
 */
export function worktreeOf(
  worktrees: readonly Worktree[],
  cwd: string
): Worktree | undefined {
  return worktrees
    .filter((wt) => cwd === wt.path || cwd.startsWith(`${wt.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

// Text は制御文字を受け付けないため、タブは空白に置き換えそれ以外は落とす
function clean(text: string): string {
  const flat = text.replace(/\t/g, "  ").replace(/[\u0000-\u001f\u007f]/g, "");

  return flat.length > MAX_LINE_CHARS
    ? `${flat.slice(0, MAX_LINE_CHARS)}…`
    : flat;
}

export function parseDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | undefined;
  let isInHunk = false;
  let oldNo = 0;
  let newNo = 0;

  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const bPath = line.match(/ b\/(.*)$/)?.[1] ?? line;
      current = {
        path: bPath,
        added: 0,
        removed: 0,
        isBinary: false,
        lines: [],
      };
      files.push(current);
      isInHunk = false;
      continue;
    }
    if (current === undefined) continue;

    // hunk に入るまでの行は header。hunk 内の "--- " は "-- " で始まる行の削除なので区別する
    if (line.startsWith("@@")) {
      const nums = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      oldNo = Number(nums?.[1] ?? 0);
      newNo = Number(nums?.[2] ?? 0);
      current.lines.push({ kind: "hunk", text: clean(line) });
      isInHunk = true;
      continue;
    }
    if (!isInHunk) {
      if (line.startsWith("+++ ") && line !== "+++ /dev/null")
        current.path = line.slice(4).replace(/^b\//, "");
      else if (line.startsWith("Binary files ")) current.isBinary = true;
      continue;
    }

    const sign = line[0];
    const body = clean(line.slice(1));
    let row: DiffLine | undefined;
    if (sign === "+") {
      row = { kind: "add", text: body, newNo: newNo++ };
      current.added += 1;
    } else if (sign === "-") {
      row = { kind: "del", text: body, oldNo: oldNo++ };
      current.removed += 1;
    } else if (sign === " ") {
      row = { kind: "ctx", text: body, oldNo: oldNo++, newNo: newNo++ };
    }
    if (row !== undefined) current.lines.push(row);
  }

  return files;
}

function capLines(files: DiffFile[]): DiffFile[] {
  let room = MAX_TOTAL_LINES;

  return files.map((file) => {
    const lines = file.lines.slice(0, Math.max(0, room));
    room -= lines.length;

    return { ...file, lines };
  });
}

async function resolveBase(
  $: EngineInterface,
  cwd: string,
  base: DiffBase
): Promise<{ rev: string; label: string } | { error: string }> {
  if (base === "head") return { rev: "HEAD", label: "HEAD との差分 (未 commit・untracked)" };

  const origin = await git($, cwd, [
    "rev-parse",
    "--abbrev-ref",
    "origin/HEAD",
  ]);
  // origin/HEAD は clone 方法によって未設定のため、既定 branch の候補を順に試す
  const candidates = [
    ...(origin.exitCode === 0 ? [origin.stdout.trim()] : []),
    "origin/staging",
    "origin/main",
    "origin/master",
  ];
  for (const upstream of candidates) {
    const mergeBase = await git($, cwd, ["merge-base", "HEAD", upstream]);
    if (mergeBase.exitCode !== 0) continue;
    const rev = mergeBase.stdout.trim();

    return {
      rev,
      label: `${upstream} との merge-base ${rev.slice(0, 8)} からの全体 (commit 済み・未 commit・untracked)`,
    };
  }

  return { error: `merge-base を求められません (${candidates.join(", ")})` };
}

/**
 * worktree の作業ツリーと base の差分を、未追跡ファイルを含めて読み込む
 *
 * @param $ engine interface
 * @param cwd 対象 worktree の path
 * @param base 比較の基準
 * @returns 解析済みの差分と基準の表示名、失敗時は error
 */
export async function loadDiff(
  $: EngineInterface,
  cwd: string,
  base: DiffBase
): Promise<LoadedDiff | { error: string }> {
  const resolved = await resolveBase($, cwd, base);
  if ("error" in resolved) return resolved;

  const tracked = await git($, cwd, [
    "diff",
    "--no-color",
    "--no-ext-diff",
    resolved.rev,
  ]);
  if (tracked.exitCode !== 0)
    return { error: tracked.stderr.trim() || "git diff に失敗しました" };

  // git diff は未追跡ファイルを含まないため、新規ファイルは /dev/null との比較で補う
  const others = await git($, cwd, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  const untracked = others.stdout.split("\0").filter((p) => p !== "");
  const extra: string[] = [];
  for (const path of untracked.slice(0, MAX_UNTRACKED)) {
    const one = await git($, cwd, [
      "diff",
      "--no-color",
      "--no-index",
      "--",
      "/dev/null",
      path,
    ]);
    extra.push(one.stdout);
  }

  const files = capLines(parseDiff([tracked.stdout, ...extra].join("\n")));

  return { files, baseLabel: resolved.label };
}
