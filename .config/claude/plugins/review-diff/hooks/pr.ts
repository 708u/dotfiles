import type { EngineInterface } from "claude-code";

import type { PrInfo, PrThread } from "../types";

const THREADS_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          diffSide
          comments(first: 50) {
            nodes { author { login } body diffHunk }
          }
        }
      }
    }
  }
}`;

type ThreadNode = {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number | null;
  diffSide: "LEFT" | "RIGHT";
  comments: {
    nodes: {
      author: { login: string } | null;
      body: string;
      diffHunk: string;
    }[];
  };
};

export type LoadedPr = { pr: PrInfo | null; threads: PrThread[] };

async function gh($: EngineInterface, cwd: string, args: readonly string[]) {
  return $.process.run(["gh", ...args], { cwd, timeoutMs: 30000 });
}

/**
 * diff_hunk の最後の行から先頭の符号を除いたものを返す
 *
 * diff_hunk はコメントした行で終わるので、現在の diff の行と照合して位置のずれを見つけるのに使う。
 *
 * @param diffHunk GitHub が返す diff_hunk
 * @returns コメントした行のコード
 */
function anchorOf(diffHunk: string): string {
  const last =
    diffHunk
      .split("\n")
      .filter((line) => line !== "")
      .at(-1) ?? "";

  return last.startsWith("@@") ? "" : last.slice(1);
}

/**
 * worktree の branch に紐づく PR と、その未解決の review thread を読み込む
 *
 * PR が無いときや gh が使えないときは PR 無しとして返し、diff の表示は続けられるようにする。
 *
 * @param $ engine interface
 * @param cwd 対象 worktree の path
 * @returns PR と未解決の thread
 */
export async function loadPr(
  $: EngineInterface,
  cwd: string
): Promise<LoadedPr> {
  const none: LoadedPr = { pr: null, threads: [] };
  try {
    const view = await gh($, cwd, ["pr", "view", "--json", "number,url"]);
    if (view.exitCode !== 0) return none;
    const pr = JSON.parse(view.stdout) as PrInfo;
    const repo = pr.url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\//);
    if (repo === null) return { pr, threads: [] };

    const result = await gh($, cwd, [
      "api",
      "graphql",
      "-f",
      `query=${THREADS_QUERY}`,
      "-F",
      `owner=${repo[1]}`,
      "-F",
      `name=${repo[2]}`,
      "-F",
      `number=${pr.number}`,
    ]);
    if (result.exitCode !== 0) return { pr, threads: [] };

    const nodes = (JSON.parse(result.stdout) as {
      data: {
        repository: {
          pullRequest: { reviewThreads: { nodes: ThreadNode[] } };
        };
      };
    }).data.repository.pullRequest.reviewThreads.nodes;

    const threads = nodes
      .filter((node) => !node.isResolved && node.comments.nodes.length > 0)
      .map(
        (node): PrThread => ({
          id: node.id,
          path: node.path,
          line: node.line,
          side: node.diffSide,
          isOutdated: node.isOutdated,
          anchor: anchorOf(node.comments.nodes[0]?.diffHunk ?? ""),
          comments: node.comments.nodes.map((comment) => ({
            author: comment.author?.login ?? "(不明)",
            body: comment.body,
          })),
        })
      );

    return { pr, threads };
  } catch {
    return none;
  }
}
