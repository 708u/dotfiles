import type { EngineInterface } from "claude-code";

import type { PrSnapshot } from "../types";
import type { CleanupItem } from "./prompts";

async function run(
  $: EngineInterface,
  cwd: string,
  argv: readonly string[],
): Promise<string | null> {
  try {
    const result = await $.process.run(argv, { cwd, timeoutMs: 30_000 });

    return result.exitCode === 0 ? result.stdout : null;
  } catch {
    return null;
  }
}

type CheckItem = { conclusion?: string; status?: string; state?: string };

export function summarizeChecks(
  items: readonly CheckItem[] | undefined,
): string {
  const counts = new Map<string, number>();
  for (const item of items ?? []) {
    const value = item.conclusion || item.state || item.status || "UNKNOWN";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, count]) => `${value}:${count}`)
    .join(" ");
}

export async function probePullRequest(
  $: EngineInterface,
  cwd: string,
  ref: string,
): Promise<PrSnapshot | null> {
  const out = await run($, cwd, [
    "gh",
    "pr",
    "view",
    ref,
    "--json",
    "number,url,state,reviewDecision,mergeStateStatus,headRefOid,reviews,comments,statusCheckRollup",
  ]);
  if (out === null) {
    return null;
  }

  try {
    const pr = JSON.parse(out);

    return {
      number: pr.number,
      url: pr.url,
      state: pr.state,
      reviewDecision: pr.reviewDecision ?? "",
      mergeStateStatus: pr.mergeStateStatus ?? "",
      headSha: pr.headRefOid ?? "",
      reviews: pr.reviews?.length ?? 0,
      comments: pr.comments?.length ?? 0,
      checks: summarizeChecks(pr.statusCheckRollup),
    };
  } catch {
    return null;
  }
}

type Worktree = { path: string; branch: string | null };

export function parseWorktrees(porcelain: string): Worktree[] {
  return porcelain
    .split("\n\n")
    .map((block) => {
      const path = /^worktree (.+)$/m.exec(block)?.[1];
      const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null;

      return path === undefined ? null : { path, branch };
    })
    .filter((one): one is Worktree => one !== null);
}

export async function probeCleanup(
  $: EngineInterface,
  cwd: string,
): Promise<CleanupItem[]> {
  const items: CleanupItem[] = [];
  const [root, porcelain, closed, stashes, unpushed] = await Promise.all([
    run($, cwd, ["git", "rev-parse", "--show-toplevel"]),
    run($, cwd, ["git", "worktree", "list", "--porcelain"]),
    run($, cwd, [
      "gh",
      "pr",
      "list",
      "--state",
      "closed",
      "--limit",
      "200",
      "--json",
      "headRefName,state",
    ]),
    run($, cwd, ["git", "stash", "list"]),
    run($, cwd, ["git", "log", "@{u}..HEAD", "--oneline"]),
  ]);

  const states = new Map<string, string>();
  try {
    for (const pr of JSON.parse(closed ?? "[]") as {
      headRefName: string;
      state: string;
    }[]) {
      // 同じ branch 名で複数の PR があるときは merge 済みを優先する
      if (states.get(pr.headRefName) !== "MERGED") {
        states.set(pr.headRefName, pr.state);
      }
    }
  } catch {
    // gh が使えない環境では merge の判定ができないので worktree の候補を出さない
  }

  const selfRoot = root?.trim() ?? "";
  // 先頭は main の worktree なので片付けの対象から外す
  const worktrees = parseWorktrees(porcelain ?? "").slice(1);
  const finished = new Set<string>();
  for (const tree of worktrees) {
    if (tree.branch === null) {
      continue;
    }
    const state = states.get(tree.branch);
    if (state === "MERGED") {
      finished.add(tree.branch);
      items.push({
        kind: tree.path === selfRoot ? "self" : "remove",
        text: `merge 済みの worktree: ${tree.path} (${tree.branch})`,
      });
    } else if (state === "CLOSED") {
      finished.add(tree.branch);
      items.push({
        kind: "report",
        text: `merge されずに close された branch の worktree: ${tree.path} (${tree.branch})`,
      });
    }
  }

  for (const line of (stashes ?? "").split("\n")) {
    const branch = /: (?:WIP on|On) ([^:]+):/.exec(line)?.[1];
    if (branch !== undefined && finished.has(branch)) {
      items.push({ kind: "report", text: `stash: ${line}` });
    }
  }

  const commits = (unpushed ?? "").trim();
  if (commits !== "") {
    items.push({
      kind: "report",
      text: `push していない commit: ${commits.split("\n").length} 件`,
    });
  }

  return items;
}
