import { atom, read, update } from "claude-code";
import type { EngineInterface, Register, RenderChildren } from "claude-code";

import type {
  CommentDraft,
  DiffBase,
  DiffFile,
  DiffLine,
  DiffRow,
  DiffViewMessage,
  Picker,
  PrInfo,
  PrThread,
  LineCaret,
  LineRange,
  ReviewComment,
  Worktree,
} from "../types";
import { listWorktrees, loadDiff, worktreeOf } from "./diff";
import { loadPr } from "./pr";
import {
  OWN_COMMENT_COLOR,
  PR_COMMENT_COLOR,
  SELECTED_BACKGROUND,
} from "./theme";

const PANE = "review-diff";
const COMMAND = "review-diff";
// Client の props は 100,000 文字までなので、1 回に渡す行数と 1 行の文字数を抑える
const LINE_PAGE = 250;
const MAX_ROW_CHARS = 240;
const MAX_CODE_LINES = 30;
// pane は横に並べると端末幅の 45% が上限で、prompt の上では空いている高さまでしか広がらない。
// 端末の行数は分からないため、高さは上限を超える値を渡して空いている分まで広げてもらう
const DOCK_SHARE = 0.45;
const MIN_DOCK_COLUMNS = 24;
const PANE_ROWS = 500;
const FOCUS_RETRY_MS = 50;
const FOCUS_ATTEMPTS = 10;
// twig も git worktree も worktree の増減を伴うので、実行後に一覧を読み直す
const WORKTREE_COMMAND = /\b(twig|git\s+worktree)\b/;

// shape の tag は値の形を変えたときに上げる。reload 後も旧版の値が残るため
const worktrees = atom(
  { plugin: "review-diff", key: "worktrees" } as const,
  [],
  {
    shape: "worktrees-1",
  }
);
const target = atom({ plugin: "review-diff", key: "target" } as const, null);
const openPicker = atom(
  { plugin: "review-diff", key: "openPicker" } as const,
  null
);
const base = atom({ plugin: "review-diff", key: "base" } as const, "head");
const baseLabel = atom(
  { plugin: "review-diff", key: "baseLabel" } as const,
  ""
);
const files = atom({ plugin: "review-diff", key: "files" } as const, [], {
  shape: "files-1",
});
const file = atom({ plugin: "review-diff", key: "file" } as const, null);
const selection = atom(
  { plugin: "review-diff", key: "selection" } as const,
  null,
  { shape: "selection-2" }
);
const lineLimit = atom(
  { plugin: "review-diff", key: "lineLimit" } as const,
  LINE_PAGE
);
const comments = atom({ plugin: "review-diff", key: "comments" } as const, [], {
  shape: "comments-2",
});
const drafts = atom({ plugin: "review-diff", key: "drafts" } as const, [], {
  shape: "drafts-1",
});
const pr = atom({ plugin: "review-diff", key: "pr" } as const, null, {
  shape: "pr-1",
});
const prThreads = atom(
  { plugin: "review-diff", key: "prThreads" } as const,
  [],
  { shape: "pr-threads-1" }
);
const includedThreads = atom(
  { plugin: "review-diff", key: "includedThreads" } as const,
  []
);
const collapsedComments = atom(
  { plugin: "review-diff", key: "collapsedComments" } as const,
  []
);

async function toggleCollapsed($: EngineInterface, id: string) {
  await update($, collapsedComments, (list) =>
    list.includes(id) ? list.filter((one) => one !== id) : [...list, id]
  );
}
const status = atom({ plugin: "review-diff", key: "status" } as const, null);

let loadGeneration = 0;
let prGeneration = 0;

/**
 * 対象 worktree の branch の PR と未解決の review thread を読み直す
 *
 * GitHub への問い合わせは 1 回に 1 秒前後かかるので、ターンごとの diff の読み直しでは呼ばず、
 * pane を開いたとき・再読込・対象の切り替えのときだけ呼ぶ。
 *
 * @param $ engine interface
 */
async function refreshPr($: EngineInterface): Promise<void> {
  const generation = ++prGeneration;
  const path = await read($, target);
  const loaded =
    path === null ? { pr: null, threads: [] } : await loadPr($, path);
  if (generation !== prGeneration) return;

  await update($, pr, () => loaded.pr);
  await update($, prThreads, () => loaded.threads);
  // 解決されて一覧から消えた thread を、送信に含める対象からも外す
  const ids = new Set(loaded.threads.map((thread) => thread.id));
  await update($, includedThreads, (list) => list.filter((id) => ids.has(id)));
}

async function toggleThread($: EngineInterface, id: string) {
  await update($, includedThreads, (list) =>
    list.includes(id) ? list.filter((one) => one !== id) : [...list, id]
  );
}

// すべて含めているときは外し、そうでなければ未解決の thread をすべて含める
async function toggleAllThreads($: EngineInterface) {
  const ids = (await read($, prThreads)).map((thread) => thread.id);
  await update($, includedThreads, (list) =>
    ids.every((id) => list.includes(id)) ? [] : ids
  );
}

async function refreshWorktrees($: EngineInterface): Promise<Worktree[]> {
  const list = await listWorktrees($, await $.session.root());
  await update($, worktrees, () => list);

  return list;
}

/**
 * 対象 worktree と比較基準から diff を読み直す
 *
 * 選択中のファイルが diff から消えた場合は先頭のファイルに移る。
 *
 * @param $ engine interface
 */
async function refreshDiff($: EngineInterface): Promise<void> {
  const generation = ++loadGeneration;
  const path = await read($, target);
  if (path === null) {
    await update($, status, () => "対象の worktree が未選択です");
    return;
  }

  await update($, status, () => "読み込み中…");
  const loaded = await loadDiff($, path, await read($, base));
  // 読み込み中に対象が切り替わった場合、古い結果で上書きしない
  if (generation !== loadGeneration) return;

  if ("error" in loaded) {
    await update($, files, () => []);
    await update($, status, () => loaded.error);
    return;
  }

  await update($, files, () => loaded.files);
  await update($, baseLabel, () => loaded.baseLabel);
  await update($, status, () =>
    loaded.files.length === 0 ? "差分はありません" : null
  );
  const selected = await read($, file);
  if (!loaded.files.some((one) => one.path === selected)) {
    await selectFile($, loaded.files[0]?.path ?? null);
  }
}

async function selectFile($: EngineInterface, path: string | null) {
  await flushTyping($);
  await update($, file, () => path);
  await update($, selection, () => null);
  await update($, lineLimit, () => LINE_PAGE);
}

async function setTarget($: EngineInterface, path: string) {
  await update($, target, () => path);
  await update($, includedThreads, () => []);
  await selectFile($, null);
  await Promise.all([refreshDiff($), refreshPr($)]);
}

async function setBase($: EngineInterface, value: DiffBase) {
  await update($, base, () => value);
  await refreshDiff($);
}

function whereOf(line: DiffLine): string {
  if (line.kind === "hunk") return `hunk ${line.text}`;
  if (line.kind === "del") return `L${line.oldNo} (削除行)`;

  return `L${line.newNo}`;
}

function signOf(line: DiffLine): string {
  if (line.kind === "add") return "+";
  if (line.kind === "del") return "-";

  return " ";
}

function spanOf(numbers: readonly number[]): string {
  const low = Math.min(...numbers);
  const high = Math.max(...numbers);

  return low === high ? `L${low}` : `L${low}-L${high}`;
}

/**
 * 選択した行の範囲を、新しい側の行番号を主として表す
 *
 * 削除行だけを選んだときは古い側の行番号で表す。
 *
 * @param lines 選択した行
 * @returns `L10-L14` のような位置の表記
 */
function rangeWhere(lines: readonly DiffLine[]): string {
  if (lines.length === 1 && lines[0] !== undefined) return whereOf(lines[0]);

  const added = lines.flatMap((line) =>
    line.kind === "del" || line.newNo === undefined ? [] : [line.newNo]
  );
  const removed = lines.flatMap((line) =>
    line.kind === "del" && line.oldNo !== undefined ? [line.oldNo] : []
  );
  if (added.length === 0 && removed.length === 0) return "hunk";
  if (added.length === 0) return `${spanOf(removed)} (削除行)`;
  if (removed.length === 0) return spanOf(added);

  return `${spanOf(added)} (削除行 ${spanOf(removed)} を含む)`;
}

function codeOf(line: DiffLine): string {
  return line.kind === "hunk" ? line.text : `${signOf(line)} ${line.text}`;
}

async function addComment(
  $: EngineInterface,
  diffFile: DiffFile,
  range: LineRange,
  body: string
) {
  const text = body.trim();
  if (text === "") return;

  const worktree = await read($, target);
  if (worktree === null) return;

  const lines = diffFile.lines
    .slice(range.start, range.end + 1)
    .filter((line) => line.kind !== "hunk");
  if (lines.length === 0) return;

  const code = lines.slice(0, MAX_CODE_LINES).map(codeOf);
  if (lines.length > MAX_CODE_LINES)
    code.push(`… 他 ${lines.length - MAX_CODE_LINES} 行`);

  const comment: ReviewComment = {
    id: `${await $.clock.now()}-${Math.random().toString(36).slice(2, 8)}`,
    worktree,
    file: diffFile.path,
    where: rangeWhere(lines),
    marks: lines.map(whereOf),
    code: code.join("\n"),
    body: text,
  };
  await update($, comments, (list) => [...list, comment]);
  typing = null;
  await removeDraft($, { worktree, file: diffFile.path, where: comment.where });
  await update($, selection, () => null);
}

async function removeComment($: EngineInterface, id: string) {
  await update($, comments, (list) => list.filter((one) => one.id !== id));
}

type DraftKey = Pick<CommentDraft, "worktree" | "file" | "where">;

function isSameDraft(a: DraftKey, b: DraftKey): boolean {
  return a.worktree === b.worktree && a.file === b.file && a.where === b.where;
}

/**
 * 入力途中のコメントを、worktree・ファイル・範囲の組ごとに 1 件の下書きとして保存する
 *
 * 空になった下書きは残さない。
 *
 * @param $ engine interface
 * @param draft 保存する下書き
 */
async function saveDraft($: EngineInterface, draft: CommentDraft) {
  await update($, drafts, (list) => {
    const others = list.filter((one) => !isSameDraft(one, draft));

    return draft.body.trim() === "" ? others : [...others, draft];
  });
}

async function removeDraft($: EngineInterface, key: DraftKey) {
  await update($, drafts, (list) =>
    list.filter((one) => !isSameDraft(one, key))
  );
}

// キー入力ごとに state へ書くと pane が描き直され、入力中の文字が古い value で上書きされうる。
// そのため入力途中の文字はここに置き、入力欄を離れるときだけ下書きとして保存する
let typing: CommentDraft | null = null;

async function flushTyping($: EngineInterface) {
  const pending = typing;
  typing = null;
  if (pending !== null) await saveDraft($, pending);
}

/**
 * コメント欄の入力欄へフォーカスを移す
 *
 * diff の行をクリックするとキーボードはクリックした Client が握り、autoFocus も $.ui.focus も効かない。
 * Client はコメント欄を開いた後の描画で作り直されてキーボードを手放すが、その描画を待つ手段が無い。
 * そのため pane を focus 付きで開き直してキーボードを戻す操作と入力欄へのフォーカス移動を、
 * 成功するまで間隔を空けてやり直す。
 * 呼び出し元の描画を止めないよう結果は待たない。
 *
 * @param $ engine interface
 * @param attempt これまでに試した回数
 */
function focusComposer($: EngineInterface, attempt = 0) {
  const refuse = (reason: string) =>
    $.ui.log(`review-diff: focus refused: ${reason}`, { to: "debug" });

  void (async () => {
    if (!(await read($, selection))?.isComposing) return;
    await openPane($);
    const result = await $.ui.focus({ requestId: PANE, key: "comment" });
    if (result.deny === undefined) return;
    if (attempt + 1 >= FOCUS_ATTEMPTS) {
      refuse(result.deny);
      return;
    }
    $.clock.after(FOCUS_RETRY_MS, () => focusComposer($, attempt + 1));
  })().catch((error) => refuse(String(error)));
}

async function openComposer($: EngineInterface, caret: LineCaret) {
  await update($, selection, () => ({ ...caret, isComposing: true }));
  focusComposer($);
}

async function resumeDraft($: EngineInterface, draft: CommentDraft) {
  await flushTyping($);
  await update($, file, () => draft.file);
  await openComposer($, { anchor: draft.anchor, head: draft.head });
}

// 書きかけは下書きの一覧から再開できるので、選択は残さない
async function closeComposer($: EngineInterface) {
  await flushTyping($);
  await update($, selection, () => null);
}

function threadWhere(thread: PrThread): string {
  if (thread.line === null) return "(位置不明)";

  return thread.side === "LEFT"
    ? `L${thread.line} (削除行)`
    : `L${thread.line}`;
}

function composePrompt(
  list: readonly ReviewComment[],
  threads: readonly PrThread[],
  prInfo: PrInfo | null,
  worktree: Worktree | undefined,
  path: string,
  label: string
): string {
  const head = [
    "diff へのレビューコメントです。各コメントに対応してください。",
    "",
    `対象 worktree: ${path}${worktree ? ` (branch: ${worktree.branch})` : ""}`,
    `比較基準: ${label}`,
    "",
  ];
  const body = list.flatMap((one, i) => [
    `${i + 1}. ${one.file}:${one.where}`,
    "   コード:",
    ...one.code.split("\n").map((line) => `     ${line}`),
    `   コメント: ${one.body}`,
  ]);
  const prPart =
    threads.length === 0 || prInfo === null
      ? []
      : [
          ...(list.length > 0 ? [""] : []),
          `GitHub PR #${prInfo.number} (${prInfo.url}) の未解決のレビューコメント:`,
          ...threads.flatMap((thread, i) => [
            `${list.length + i + 1}. ${thread.path}:${threadWhere(thread)}`,
            ...(thread.anchor === "" ? [] : [`   コード: ${thread.anchor}`]),
            ...thread.comments.flatMap((comment) => [
              `   @${comment.author}:`,
              ...comment.body.split("\n").map((line) => `     ${line}`),
            ]),
          ]),
        ];

  return [...head, ...body, ...prPart].join("\n");
}

/**
 * 対象 worktree に溜めたコメントと、送信に含めると選んだ PR の thread を 1 つの prompt にまとめ、
 * ユーザーの入力として送信する
 *
 * 送信中に二重送信されないよう、送信前にコメントと選択を取り除き、失敗したら戻す。
 * prompt.submit はターン実行中だと idle になるまで resolve しないため、待たずに返す。
 *
 * @param $ engine interface
 */
async function submitComments($: EngineInterface) {
  const path = await read($, target);
  if (path === null) return;

  const all = await read($, comments);
  const mine = all.filter((one) => one.worktree === path);
  const included = await read($, includedThreads);
  const threads = (await read($, prThreads)).filter((thread) =>
    included.includes(thread.id)
  );
  if (mine.length === 0 && threads.length === 0) {
    $.ui.toast("Claude に送るコメントがありません");
    return;
  }

  const worktree = (await read($, worktrees)).find((one) => one.path === path);
  const text = composePrompt(
    mine,
    threads,
    await read($, pr),
    worktree,
    path,
    await read($, baseLabel)
  );
  await update($, comments, (list) =>
    list.filter((one) => one.worktree !== path)
  );
  await update($, includedThreads, () => []);
  void $.prompt.submit({ text, asUser: true }).catch(async (error) => {
    await update($, comments, (list) => [...mine, ...list]);
    await update($, includedThreads, () => included);
    $.ui.toast(`Claude に送れませんでした: ${String(error)}`);
  });
  $.ui.toast(`${mine.length + threads.length} 件を Claude に送りました`);
}

// 開き直すと大きさの指定も設定し直されるため、コマンド実行時に決めた幅を覚えておく
let paneColumns: number | undefined;

/**
 * pane を開く。focus 付きなら、開いている pane にもキーボードを戻す
 *
 * @param $ engine interface
 * @param terminalColumns コマンド実行時の端末幅。省略時は前回決めた幅で開く
 * @param hasFocus キーボードを pane に移すか
 * @returns 開いた結果
 */
async function openPane(
  $: EngineInterface,
  terminalColumns?: number,
  hasFocus = true
) {
  if (terminalColumns !== undefined) {
    paneColumns = Math.max(
      MIN_DOCK_COLUMNS,
      Math.floor(terminalColumns * DOCK_SHARE)
    );
  }

  return $.ui.open({
    id: PANE,
    title: "Review diff",
    ...(hasFocus ? { focus: true } : {}),
    backgroundColor: "transparent",
    closeOnEscape: true,
    rows: PANE_ROWS,
    ...(paneColumns === undefined ? {} : { columns: paneColumns }),
  });
}

async function isPaneOpen($: EngineInterface) {
  return (await $.ui.panes()).some((pane) => pane.id === PANE);
}

function isViewMessage(data: unknown): data is DiffViewMessage {
  if (typeof data !== "object" || data === null) return false;
  const message = data as Record<string, unknown>;

  return (
    (message.type === "select" || message.type === "compose") &&
    Number.isInteger(message.anchor) &&
    Number.isInteger(message.head)
  );
}

/**
 * PR の thread が現在の diff のどの行に当たるかを探す
 *
 * PR のコメントは push 済みの commit の行番号に付くので、未 commit の変更や比較基準の違いで
 * 行番号がずれる。行番号が一致し、さらにコメントした行のコードも一致したときだけ位置を返す。
 *
 * @param thread PR の thread
 * @param diffFiles 現在の diff
 * @returns ファイルと行の位置、見つからないときは null
 */
function placeThread(
  thread: PrThread,
  diffFiles: readonly DiffFile[]
): { file: string; index: number } | null {
  if (thread.line === null || thread.isOutdated) return null;

  const target = diffFiles.find((one) => one.path === thread.path);
  if (target === undefined) return null;

  const index = target.lines.findIndex((line) =>
    thread.side === "LEFT"
      ? line.kind === "del" && line.oldNo === thread.line
      : line.kind !== "del" &&
        line.kind !== "hunk" &&
        line.newNo === thread.line
  );
  const line = target.lines[index];
  if (line === undefined) return null;
  if (thread.anchor !== "" && line.text.trim() !== thread.anchor.trim()) {
    return null;
  }

  return { file: target.path, index };
}

// Text は制御文字を受け付けないため、本文を行に分け、タブは空白に置き換えそれ以外は落とす
function plainLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) =>
      line.replace(/\t/g, "  ").replace(/[\u0000-\u001f\u007f]/g, "")
    );
}

// 端末では全角文字が 2 桁を占める
function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) width += (char.codePointAt(0) ?? 0) > 0xff ? 2 : 1;

  return width;
}

/**
 * 表示幅が room 桁に収まるよう末尾を切り詰め、切り詰めたときは … を付ける
 *
 * @param text 切り詰める文字列
 * @param room 使える桁数
 * @returns 収まる長さの文字列
 */
function fitText(text: string, room: number): string {
  if (displayWidth(text) <= room) return text;
  if (room <= 1) return "";

  let fitted = "";
  let used = 0;
  for (const char of text) {
    const w = displayWidth(char);
    if (used + w > room - 1) break;
    fitted += char;
    used += w;
  }

  return `${fitted}…`;
}

const PICKER_TITLES: Record<Picker, string> = {
  worktree: "対象:",
  base: "基準:",
  file: "ファイル:",
  pr: "PR:",
};

/**
 * diff の行を、印・行番号・符号を前に付けた表示用の行にする
 *
 * 折り返しは描画する側で幅に合わせて行う。indent は折り返した続きの行の字下げで、
 * コードの書き始めの位置にそろえる。
 *
 * @param lines diff の行
 * @param marked コメントの付いた行の位置
 * @returns 表示用の行
 */
function rowsOf(
  lines: readonly DiffLine[],
  marked: ReadonlySet<string>
): DiffRow[] {
  return lines.map((line) => {
    const mark = marked.has(whereOf(line)) ? "*" : " ";
    const head =
      line.kind === "hunk"
        ? `${mark} `
        : `${mark}${String(line.newNo ?? line.oldNo ?? "").padStart(
            5
          )} ${signOf(line)} `;

    return {
      text: `${head}${line.text}`.slice(0, MAX_ROW_CHARS),
      kind: line.kind,
      indent: head.length,
    };
  });
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    // 後から開いた pane が前に出るので、起動時に開く他の pane より先に、読み込みを待たずに開く。
    // 起動直後に打ち始めた文字が pane に入らないよう、キーボードは移さない
    void openPane($, undefined, false).catch((error) => {
      $.ui.log(`review-diff: open failed: ${String(error)}`, { to: "debug" });
    });
    const started = await next(e);
    await $.command.register({
      name: COMMAND,
      description:
        "worktree の diff に行コメントを付け、まとめて Claude に送る pane を開く",
      argumentHint: "[worktree の branch 名か path]",
    });
    const list = await refreshWorktrees($);
    if ((await read($, target)) === null) {
      const own = worktreeOf(list, e.cwd);
      if (own !== undefined) await update($, target, () => own.path);
    }

    // GitHub への問い合わせで最初の prompt を待たせないよう、読み込みは待たない
    void Promise.all([refreshDiff($), refreshPr($)]).catch((error) => {
      $.ui.log(`review-diff: startup failed: ${String(error)}`, {
        to: "debug",
      });
    });

    return started;
  });

  on("command.run", { command: COMMAND }, async ($, e) => {
    const list = await refreshWorktrees($);
    const query = e.args.trim();
    if (query !== "") {
      const found = list.find(
        (one) =>
          one.branch === query ||
          one.path === query ||
          one.path.endsWith(`/${query}`)
      );
      if (found === undefined) {
        return { text: `worktree が見つかりません: ${query}` };
      }
      await setTarget($, found.path);
    } else if ((await read($, target)) === null) {
      const own = worktreeOf(list, await $.session.cwd());
      if (own !== undefined) await update($, target, () => own.path);
    }

    if (query === "") await Promise.all([refreshDiff($), refreshPr($)]);
    const opened = await openPane($, e.presentation.columns);

    return {
      text: opened.isPlaced
        ? `Review diff: ${(await read($, target)) ?? "(未選択)"}`
        : `Review diff pane を開けません: ${opened.reason}`,
    };
  }).catch((_$, e) => ({
    text: `Review diff の起動に失敗しました (${e.command})`,
  }));

  on("tool.call", async ($, e, next) => {
    const tool = String(e.tool);
    const command = tool === "Bash" && "command" in e ? String(e.command) : "";
    const isWorktreeCommand = WORKTREE_COMMAND.test(command);
    if (!isWorktreeCommand && tool !== "EnterWorktree") return next(e);

    const before = new Set((await refreshWorktrees($)).map((one) => one.path));
    const result = await next(e);
    const list = await refreshWorktrees($);

    // 新しく増えた worktree があれば、このセッションのレビュー対象をそこへ移す
    const newest = list.filter((one) => !before.has(one.path)).at(-1);
    const current = await read($, target);
    if (newest !== undefined) {
      await setTarget($, newest.path);
      $.ui.toast(`レビュー対象を ${newest.branch} に切り替えました`);
    } else if (tool === "EnterWorktree") {
      const own = worktreeOf(list, await $.session.cwd());
      if (own !== undefined && own.path !== current)
        await setTarget($, own.path);
    } else if (current !== null && !list.some((one) => one.path === current)) {
      const own = worktreeOf(list, await $.session.root());
      if (own !== undefined) await setTarget($, own.path);
    }

    return result;
  }).catch(($, e, next) => next(e));

  on("turn.complete", async ($, e, next) => {
    const completed = await next(e);
    // ユーザーが ! で実行した twig は tool.call を通らないため、ここでも一覧を読み直す
    if (e.agentId === undefined && (await isPaneOpen($))) {
      await refreshWorktrees($);
      await refreshDiff($);
    }

    return completed;
  });

  // Esc は pane を閉じる操作として届くので、一覧を開いているか入力中なら、それだけを閉じて pane を残す
  on("ui.close", async ($, e, next) => {
    if (e.id !== PANE || e.origin.kind !== "person") return next(e);

    if ((await read($, openPicker)) !== null) {
      await update($, openPicker, () => null);
      return { value: undefined };
    }

    const sel = await read($, selection);
    await closeComposer($);
    if (sel === null || !sel.isComposing) return next(e);

    return { value: undefined };
  });

  on("ui.message", { requestId: PANE }, async ($, e) => {
    const data = e.data;
    if (!isViewMessage(data)) return {};

    await flushTyping($);

    // 起点と動かす端を並べ替えずに保存する。並べ替えると上方向へ広げるときに端が入れ替わる
    const caret = { anchor: data.anchor, head: data.head };
    if (data.type === "compose") {
      await openComposer($, caret);
    } else {
      await update($, selection, () => ({ ...caret, isComposing: false }));
    }

    return {};
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    if (e.surface === "mobile") {
      const { Text } = $.ui.resolve(e);

      return (
        <Text>この pane は入力欄が必要なため mobile では使えません。</Text>
      );
    }

    const { Box, Button, Input, Text } = $.ui.resolve(e);
    const currentBase = await read($, base);
    const opened = await read($, openPicker);
    const prInfo = await read($, pr);
    const threads = await read($, prThreads);
    const included = await read($, includedThreads);
    const collapsed = await read($, collapsedComments);

    // 端末の Select はフォーカス中の矢印キーでしか選べないため、行全体を押せる Button にして一覧を開閉する。
    // 一覧は項目の数だけ縦に伸びるので、変更するときだけ開く
    const pickerRow = (name: Picker, value: string, extra?: RenderChildren) => (
      <Button
        key={`pick-${name}`}
        plain
        onPress={() =>
          update($, openPicker, (now) => (now === name ? null : name))
        }
      >
        <Text dimColor>{opened === name ? "▾ " : "▸ "}</Text>
        <Text bold>{PICKER_TITLES[name]}</Text>{" "}
        <Text wrap="truncate-end">{value}</Text>
        {extra}
      </Button>
    );
    const pick = async (action: () => Promise<void>) => {
      await update($, openPicker, () => null);
      await action();
    };
    const baseOptions: { value: DiffBase; label: string }[] = [
      {
        value: "head",
        label: "未 commit の変更",
      },
      {
        value: "branch",
        label: "merge-base からの全体",
      },
    ];
    const list = await read($, worktrees);
    const path = await read($, target);
    const targetWorktree = list.find((one) => one.path === path);
    const allFiles = await read($, files);
    const selectedPath = await read($, file);
    const selected = await read($, selection);
    const limit = await read($, lineLimit);
    const message = await read($, status);
    const mine = (await read($, comments)).filter(
      (one) => one.worktree === path
    );
    const current = allFiles.find((one) => one.path === selectedPath);
    const marked = new Set(
      mine
        .filter((one) => one.file === selectedPath)
        .flatMap((one) => one.marks)
    );
    const width = Math.max(20, e.props.bodyColumns);
    const visible = current?.lines.slice(0, limit) ?? [];
    const rows = rowsOf(visible, marked);
    const range =
      selected === null
        ? null
        : {
            start: Math.min(selected.anchor, selected.head),
            end: Math.max(selected.anchor, selected.head),
          };
    const selectedLines =
      current !== undefined && range !== null
        ? current.lines
            .slice(range.start, range.end + 1)
            .filter((line) => line.kind !== "hunk")
        : [];
    const selectedWhere =
      selectedLines.length > 0 ? rangeWhere(selectedLines) : "";
    const myDrafts = (await read($, drafts)).filter(
      (one) => one.worktree === path
    );
    const draft =
      current === undefined
        ? undefined
        : myDrafts.find((one) =>
            isSameDraft(one, {
              worktree: one.worktree,
              file: current.path,
              where: selectedWhere,
            })
          );

    const commentForm = current !== undefined &&
      range !== null &&
      selected !== null &&
      path !== null && (
        <Box
          key="comment-form"
          flexDirection="column"
          borderStyle="round"
          paddingX={1}
        >
          <Input
            key="comment"
            placeholder="Enter で追加、Esc で下書きを残して閉じる"
            submitLabel="追加"
            value={draft?.body}
            autoFocus
            onInput={(value) => {
              typing = {
                worktree: path,
                file: current.path,
                where: selectedWhere,
                anchor: selected.anchor,
                head: selected.head,
                body: value,
              };
            }}
            onSubmit={(value) => addComment($, current, range, value)}
          />
          <Button
            key="cancel"
            label="閉じる"
            onPress={() => closeComposer($)}
          />
        </Box>
      );

    // Client を持たない surface では、行ごとの Button で 1 行ずつ選ぶ。見出し行は押せない
    const buttonRows = (from: number, to: number) =>
      rows.slice(from, to).map((row, i) =>
        row.kind === "hunk" ? (
          <Text color="suggestion" wrap="wrap">
            {row.text}
          </Text>
        ) : (
          <Button
            key={`line:${from + i}`}
            plain
            onPress={() =>
              openComposer($, { anchor: from + i, head: from + i })
            }
          >
            <Text
              color={
                row.kind === "add"
                  ? "success"
                  : row.kind === "del"
                  ? "error"
                  : undefined
              }
              backgroundColor={
                range !== null &&
                from + i >= range.start &&
                from + i <= range.end
                  ? SELECTED_BACKGROUND
                  : undefined
              }
              wrap="wrap"
            >
              {row.text}
            </Text>
          </Button>
        )
      );
    const hunkRows = rows.flatMap((row, i) => (row.kind === "hunk" ? [i] : []));

    // コメントは範囲の最後の行の直下に出す。diff が変わって行が見つからないものは上部の一覧にだけ出る
    const indexOfWhere = new Map(visible.map((line, i) => [whereOf(line), i]));
    const inlineComments = new Map<number, ReviewComment[]>();
    for (const one of mine) {
      if (one.file !== selectedPath) continue;
      const at = indexOfWhere.get(one.marks.at(-1) ?? "");
      if (at === undefined) continue;
      inlineComments.set(at, [...(inlineComments.get(at) ?? []), one]);
    }
    const inlineThreads = new Map<number, PrThread[]>();
    for (const thread of threads) {
      const placed = placeThread(thread, allFiles);
      if (placed === null || placed.file !== selectedPath) continue;
      if (placed.index >= visible.length) continue;
      inlineThreads.set(placed.index, [
        ...(inlineThreads.get(placed.index) ?? []),
        thread,
      ]);
    }
    const composeAt =
      range !== null && selected?.isComposing && rows.length > 0
        ? Math.min(range.end, rows.length - 1)
        : undefined;

    // 名前を本文と同じ文字で書くと本文中のメンションと見分けにくいので、背景色付きのラベルにする。
    // 自分のコメントと PR のコメントは枠とラベルの色を分ける
    const nameLabel = (name: string, color: string) => (
      <Text bold color="inverseText" backgroundColor={color}>
        {` ${name} `}
      </Text>
    );
    // 見出しの行を押すと開閉する。たたんだときは見出しの行に本文の 1 行目だけを続ける
    const foldMark = (id: string) => (
      <Text dimColor>{collapsed.includes(id) ? "▸ " : "▾ "}</Text>
    );
    const cardFrame = (color: string) =>
      ({
        flexDirection: "column",
        borderStyle: "round",
        borderColor: color,
        paddingX: 1,
      } as const);
    // Button の中の Text は wrap="truncate-end" でも折り返されるので、たたんだときの本文は
    // 枠の内側の幅から見出しの部品の幅を引いた長さに切り詰めて 1 行に収める
    const CARD_INNER = 4;
    const FOLD_MARK = 2;
    const DELETE_BUTTON = 9;
    const summaryRoom = (...used: string[]) =>
      width -
      CARD_INNER -
      FOLD_MARK -
      used.reduce((sum, part) => sum + displayWidth(part), 0);

    const threadCard = (thread: PrThread) => {
      const isCollapsed = collapsed.includes(thread.id);
      const [first, ...replies] = thread.comments;

      return (
        <Box key={`thread-card:${thread.id}`} {...cardFrame(PR_COMMENT_COLOR)}>
          <Button
            key={`fold:${thread.id}`}
            plain
            onPress={() => toggleCollapsed($, thread.id)}
          >
            {foldMark(thread.id)}
            {nameLabel(first?.author ?? "", PR_COMMENT_COLOR)}
            {isCollapsed && (
              <Text dimColor>
                {fitText(
                  ` ${plainLines(first?.body ?? "")[0] ?? ""}${
                    replies.length > 0 ? ` (返信 ${replies.length} 件)` : ""
                  }`,
                  summaryRoom(` ${first?.author ?? ""} `)
                )}
              </Text>
            )}
          </Button>
          {!isCollapsed && [
            ...plainLines(first?.body ?? "").map((line) => <Text>{line}</Text>),
            ...replies.flatMap((comment, i) => [
              <Box key={`reply:${i}`} flexDirection="row">
                {nameLabel(comment.author, PR_COMMENT_COLOR)}
              </Box>,
              ...plainLines(comment.body).map((line) => <Text>{line}</Text>),
            ]),
          ]}
        </Box>
      );
    };

    const commentCard = (one: ReviewComment) => {
      const isCollapsed = collapsed.includes(one.id);

      return (
        <Box key={`inline:${one.id}`} {...cardFrame(OWN_COMMENT_COLOR)}>
          <Box flexDirection="row" gap={1}>
            <Button
              key={`fold:${one.id}`}
              plain
              onPress={() => toggleCollapsed($, one.id)}
            >
              {foldMark(one.id)}
              {nameLabel("自分", OWN_COMMENT_COLOR)}
              <Text dimColor> {one.where}</Text>
              {isCollapsed && (
                <Text dimColor>
                  {fitText(
                    ` ${plainLines(one.body)[0] ?? ""}`,
                    summaryRoom(" 自分 ", ` ${one.where}`) - DELETE_BUTTON
                  )}
                </Text>
              )}
            </Button>
            <Button
              key={`inline-delete:${one.id}`}
              label="削除"
              onPress={() => removeComment($, one.id)}
            />
          </Box>
          {!isCollapsed && <Text>{one.body}</Text>}
        </Box>
      );
    };

    const diffBody = () => {
      const caret =
        selected === null
          ? null
          : { anchor: selected.anchor, head: selected.head };
      const segment = (from: number, to: number) => {
        if (e.surface === "vscode") return buttonRows(from, to);

        const { Client } = $.ui.resolve(e);

        // key を区間の先頭行にすると、区切りが増減しても先頭の区間はドラッグ中の状態を保てる。
        // クリックされた Client はキー入力を握り続け、入力欄へ移した focus に文字が届かない。
        // コメント欄を開いている間は key を変えて作り直し、握っているキー入力を手放させる
        return [
          <Client
            key={
              selected?.isComposing ? `diff-${from}-composing` : `diff-${from}`
            }
            module="./diff-view.tsx"
            width="100%"
            props={{
              rows: rows.slice(from, to),
              offset: from,
              total: rows.length,
              hunks: hunkRows,
              width,
              selection: caret,
            }}
          />,
        ];
      };
      const breaks = [
        ...new Set([
          ...inlineComments.keys(),
          ...inlineThreads.keys(),
          ...(composeAt === undefined ? [] : [composeAt]),
        ]),
      ].sort((a, b) => a - b);

      const parts = [];
      let from = 0;
      for (const at of breaks) {
        parts.push(...segment(from, at + 1));
        parts.push(...(inlineThreads.get(at) ?? []).map(threadCard));
        parts.push(...(inlineComments.get(at) ?? []).map(commentCard));
        if (at === composeAt) parts.push(commentForm);
        from = at + 1;
      }
      if (from < rows.length) parts.push(...segment(from, rows.length));

      return parts;
    };

    const pickerOptions: Record<Picker, () => RenderChildren> = {
      worktree: () =>
        list.map((one) => (
          <Button
            key={`worktree:${one.path}`}
            plain
            onPress={() => pick(() => setTarget($, one.path))}
          >
            <Text bold={one.path === path} wrap="truncate-end">
              {one.path === path ? "● " : "○ "}
              {one.branch}
            </Text>{" "}
            <Text dimColor wrap="truncate-end">
              {one.path}
            </Text>
          </Button>
        )),
      base: () =>
        baseOptions.map((option) => (
          <Button
            key={`base:${option.value}`}
            plain
            onPress={() => pick(() => setBase($, option.value))}
          >
            <Text bold={option.value === currentBase} wrap="truncate-end">
              {option.value === currentBase ? "● " : "○ "}
              {option.label}
            </Text>
          </Button>
        )),
      file: () =>
        allFiles.map((one) => (
          <Button
            key={`file:${one.path}`}
            plain
            onPress={() => pick(() => selectFile($, one.path))}
          >
            <Text bold={one.path === selectedPath} wrap="truncate-end">
              {one.path === selectedPath ? "● " : "○ "}
              {one.path}
            </Text>{" "}
            <Text color="success">+{one.added}</Text>{" "}
            <Text color="error">-{one.removed}</Text>
          </Button>
        )),
      // 一覧から選んでも閉じない。複数の thread を続けて切り替えられるようにする
      pr: () =>
        threads.length === 0
          ? [<Text dimColor>未解決のレビューコメントはありません</Text>]
          : [
              <Button
                key="include-all-threads"
                label={
                  threads.every((thread) => included.includes(thread.id))
                    ? "すべて外す"
                    : "すべて含める"
                }
                onPress={() => toggleAllThreads($)}
              />,
              ...threads.map((thread) => {
                const placed = placeThread(thread, allFiles);
                const first = thread.comments[0];

                return (
                  <Button
                    key={`thread:${thread.id}`}
                    plain
                    onPress={() => toggleThread($, thread.id)}
                  >
                    <Text
                      color={
                        included.includes(thread.id) ? "success" : undefined
                      }
                    >
                      {included.includes(thread.id) ? "[x] " : "[ ] "}
                    </Text>
                    <Text bold>
                      {thread.path}:{threadWhere(thread)}
                    </Text>
                    {placed === null && (
                      <Text dimColor>
                        {thread.isOutdated
                          ? " (PR 上で outdated)"
                          : " (この diff に無い)"}
                      </Text>
                    )}{" "}
                    <Text dimColor wrap="truncate-end">
                      @{first?.author ?? ""}:{" "}
                      {plainLines(first?.body ?? "")[0] ?? ""}
                      {thread.comments.length > 1
                        ? ` (他 ${thread.comments.length - 1} 件)`
                        : ""}
                    </Text>
                  </Button>
                );
              }),
            ],
    };

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Box flexDirection="row" gap={1}>
            {pickerRow("worktree", targetWorktree?.branch ?? "(未選択)")}
            <Button
              key="refresh"
              label="再読込"
              onPress={async () => {
                await refreshWorktrees($);
                await Promise.all([refreshDiff($), refreshPr($)]);
              }}
            />
            {/* 読み込み中やエラーの表示で行が増減して下の要素がずれないよう、同じ行に出す */}
            {message !== null && (
              <Text color="warning" wrap="truncate-end">
                {message}
              </Text>
            )}
          </Box>
          {pickerRow(
            "base",
            baseOptions.find((option) => option.value === currentBase)?.label ??
              ""
          )}
          {pickerRow("file", current?.path ?? "(なし)", [
            ...(current === undefined
              ? []
              : [
                  " ",
                  <Text color="success">+{current.added}</Text>,
                  " ",
                  <Text color="error">-{current.removed}</Text>,
                ]),
            <Text dimColor> ({allFiles.length} 件)</Text>,
          ])}
          {prInfo !== null &&
            pickerRow("pr", `#${prInfo.number} 未解決 ${threads.length} 件`, [
              <Text dimColor> Claude に送る {included.length} 件</Text>,
            ])}
        </Box>

        {/* 一覧をその場に広げると下の要素が押し下げられるので、開いている間は見出しより下を一覧に差し替える */}
        {opened !== null ? (
          <Box
            key="picker"
            flexDirection="column"
            borderStyle="round"
            paddingX={1}
          >
            {pickerOptions[opened]()}
          </Box>
        ) : (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Text bold>コメント {mine.length} 件</Text>
                <Button
                  key="submit"
                  label="Claude に送る"
                  variant="primary"
                  onPress={() => submitComments($)}
                />
              </Box>
              {mine.map((one) => (
                <Box key={`comment-row:${one.id}`} flexDirection="row" gap={1}>
                  <Button
                    key={`delete:${one.id}`}
                    label="削除"
                    onPress={() => removeComment($, one.id)}
                  />
                  <Text wrap="truncate-end">
                    {one.file}:{one.where} {one.body}
                  </Text>
                </Box>
              ))}
            </Box>

            {myDrafts.length > 0 && (
              <Box flexDirection="column">
                <Text bold>下書き {myDrafts.length} 件</Text>
                {myDrafts.map((one) => (
                  <Box
                    key={`draft-row:${one.file}:${one.where}`}
                    flexDirection="row"
                    gap={1}
                  >
                    <Button
                      key={`resume:${one.file}:${one.where}`}
                      label="再開"
                      onPress={() => resumeDraft($, one)}
                    />
                    <Button
                      key={`discard:${one.file}:${one.where}`}
                      label="破棄"
                      onPress={() => removeDraft($, one)}
                    />
                    <Text dimColor wrap="truncate-end">
                      {one.file}:{one.where} {one.body}
                    </Text>
                  </Box>
                ))}
              </Box>
            )}

            {current !== undefined && (
              <Box flexDirection="column">
                <Box flexDirection="row" gap={1}>
                  <Text bold>{current.path}</Text>
                  {selected !== null && !selected.isComposing && (
                    <Button
                      key="compose"
                      label={`${selectedWhere} にコメント`}
                      onPress={() =>
                        openComposer($, {
                          anchor: selected.anchor,
                          head: selected.head,
                        })
                      }
                    />
                  )}
                </Box>
                {e.surface !== "vscode" && (
                  <Text dimColor>
                    ドラッグで範囲を選ぶとコメント欄が開く。クリック後は ↑↓
                    で移動、Shift+↑↓ で範囲を広げ、Enter でコメント
                  </Text>
                )}
                {current.isBinary && <Text dimColor>バイナリファイル</Text>}
                {diffBody()}
                {current.lines.length > limit && (
                  <Button
                    key="more"
                    label={`さらに表示 (残り ${
                      current.lines.length - limit
                    } 行)`}
                    onPress={() => update($, lineLimit, (n) => n + LINE_PAGE)}
                  />
                )}
              </Box>
            )}
          </Box>
        )}
      </Box>
    );
  });
};
