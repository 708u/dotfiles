import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";

import { parseWorktrees } from "../hooks/probe";
import {
  JUDGE_SYSTEM,
  buildContinuePrompt,
  buildJudgePrompt,
  describeChanges,
  parseJudge,
  parseStatus,
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
  // session の作業 directory の branch には PR が無く、URL を渡したときだけ引ける状態
  isPrOnlyByUrl?: boolean;
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
    ...initial,
  };

  on("command.register", () => ({ value: { command: "auto-continue" } }));
  on("session.start", (_, e) => ({ cwd: e.cwd }));
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
          target: PR.url,
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
      const isByUrl = e.argv[3]?.startsWith("https://") ?? false;
      if (state.pr === null || (state.isPrOnlyByUrl === true && !isByUrl)) {
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

test("作業 directory に PR が無いときは判定結果の URL で PR を引く", async ($, on) => {
  const clock = mock.clock(on);
  const state = world(on, { isPrOnlyByUrl: true });
  await $.session.start({
    cwd: "/repo",
    surface: "terminal",
    isInteractive: true,
  });

  await $.turn.complete(turn("worktree で PR #12 を作成しました。"));
  await clock.advance(31 * MINUTE);
  expect(state.submitted).toHaveLength(1);
  expect(state.submitted[0]).toContain("PR: #12");
});

test("判定の入力は最後の返答を分け、ユーザー以外の入力を event として渡す", () => {
  // 1 分設定の動作確認で、Haiku が WAIT_USER を CONTINUE と誤判定した会話
  const last =
    "1 分ほど何もしないでいると、判定が走ります。確認が終わったら値を 30 分に戻します。";
  const prompt = buildJudgePrompt("", [
    { role: "event", text: "The person enabled mod hot-reloading for this session" },
    { role: "assistant", text: "mod が読み込まれました。" },
    { role: "user", text: "1分にかえてテスト" },
    { role: "assistant", text: last },
  ]);

  expect(prompt).toContain("[event]\nThe person enabled mod hot-reloading");
  expect(prompt).toContain(`<last_assistant>\n${last}\n</last_assistant>`);
  expect(prompt.split(last)).toHaveLength(2);
  expect(JUDGE_SYSTEM).toContain("「確認が終わったら〜する」のように、ユーザー側の出来事を条件とする予告は WAIT_USER とする");
});
