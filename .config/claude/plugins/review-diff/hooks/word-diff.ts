import type { DiffLine, TextSpan } from "../types";

// 英数字の並びは 1 語として比べ、日本語や記号は 1 文字ずつ比べる。
// 日本語の文は語の区切りが無く、まとめると 1 文全体が 1 語になって変化の位置が出ないため
const TOKEN = /[A-Za-z0-9_]+|\s+|[\s\S]/gu;
// 片側の変わった範囲がこれより多い行どうしは、細かく入り交じって強調しても読みにくいので強調しない。
// 範囲は Client の props で渡すため、表示する行がすべてこの数の範囲を持っても props の大きさの上限に収まる数にする
const MAX_SPANS = 6;
// 共通部分がこの割合より少ない行どうしは書き換えとみなし、部分の強調をしない
const MIN_COMMON_RATIO = 0.5;
// pane は state が変わるたびに描き直すので、同じ行の組の比較結果を使い回す
const MAX_CACHED = 2_000;
const cache = new Map<string, ReturnType<typeof changedSpans>>();

function cachedSpans(before: string, after: string) {
  const key = `${before}\u0000${after}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const spans = changedSpans(before, after);
  if (cache.size >= MAX_CACHED) cache.clear();
  cache.set(key, spans);

  return spans;
}

type Token = { text: string; start: number };

function tokensOf(text: string): Token[] {
  return [...text.matchAll(TOKEN)].map((match) => ({
    text: match[0],
    start: match.index ?? 0,
  }));
}

/**
 * 2 つの文字列を語の単位で比べ、それぞれで変わった範囲を返す
 *
 * 比べる手間は語の数の積に比例するので、呼び出し側で表示する長さに切り詰めてから渡す。
 *
 * @param before 削除行の文字列
 * @param after 追加行の文字列
 * @returns 変わった範囲。似ていない行どうしや、範囲が多すぎる行どうしは null
 */
function changedSpans(
  before: string,
  after: string,
): { before: TextSpan[]; after: TextSpan[] } | null {
  const a = tokensOf(before);
  const b = tokensOf(after);

  // 最長共通部分列の長さの表。cell(i, j) は a[i:] と b[j:] の共通部分列の長さ
  const columns = b.length + 1;
  const table = new Uint16Array((a.length + 1) * columns);
  const cell = (i: number, j: number) => table[i * columns + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * columns + j] =
        a[i]?.text === b[j]?.text
          ? cell(i + 1, j + 1) + 1
          : Math.max(cell(i + 1, j), cell(i, j + 1));
    }
  }

  const keptA = new Set<number>();
  const keptB = new Set<number>();
  let common = 0;
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i]?.text === b[j]?.text) {
      keptA.add(i);
      keptB.add(j);
      common += a[i]?.text.length ?? 0;
      i += 1;
      j += 1;
    } else if (cell(i + 1, j) >= cell(i, j + 1)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  if (common < Math.max(before.length, after.length) * MIN_COMMON_RATIO) {
    return null;
  }

  const spans = { before: spansOf(a, keptA), after: spansOf(b, keptB) };

  return spans.before.length > MAX_SPANS || spans.after.length > MAX_SPANS
    ? null
    : spans;
}

// 共通部分に含まれない語を、隣り合うものはつなげて範囲にする
function spansOf(tokens: readonly Token[], kept: ReadonlySet<number>) {
  const spans: TextSpan[] = [];
  tokens.forEach((token, i) => {
    if (kept.has(i)) return;
    const end = token.start + token.text.length;
    const last = spans.at(-1);
    if (last !== undefined && last[1] === token.start) last[1] = end;
    else spans.push([token.start, end]);
  });

  return spans;
}

/**
 * 続けて並ぶ削除行と追加行を先頭から 1 行ずつ対にし、各行の変わった範囲を求める
 *
 * @param lines diff の行
 * @param limit 比べる文字数の上限。表示しない部分は比べない
 * @returns 行の位置ごとの、行の文字列の中で変わった範囲
 */
export function lineChanges(
  lines: readonly DiffLine[],
  limit: number,
): Map<number, TextSpan[]> {
  const changes = new Map<number, TextSpan[]>();
  let i = 0;
  while (i < lines.length) {
    if (lines[i]?.kind !== "del") {
      i += 1;
      continue;
    }
    const dels: number[] = [];
    while (lines[i]?.kind === "del") dels.push(i++);
    const adds: number[] = [];
    while (lines[i]?.kind === "add") adds.push(i++);

    for (let k = 0; k < Math.min(dels.length, adds.length); k += 1) {
      const del = dels[k] ?? 0;
      const add = adds[k] ?? 0;
      const spans = cachedSpans(
        lines[del]?.text.slice(0, limit) ?? "",
        lines[add]?.text.slice(0, limit) ?? "",
      );
      if (spans === null) continue;
      changes.set(del, spans.before);
      changes.set(add, spans.after);
    }
  }

  return changes;
}

export type Piece = { text: string; isChanged: boolean };

/**
 * 文字列を、変わった範囲とそれ以外の部分に分ける
 *
 * @param text 分ける文字列
 * @param spans 変わった範囲
 * @returns 順に並べた部分
 */
export function piecesOf(text: string, spans: readonly TextSpan[]): Piece[] {
  const pieces: Piece[] = [];
  let at = 0;
  for (const span of spans) {
    const start = Math.min(Math.max(span[0], at), text.length);
    const end = Math.min(span[1], text.length);
    if (start > at)
      pieces.push({ text: text.slice(at, start), isChanged: false });
    if (end > start)
      pieces.push({ text: text.slice(start, end), isChanged: true });
    at = Math.max(at, end);
  }
  if (at < text.length) pieces.push({ text: text.slice(at), isChanged: false });

  return pieces;
}
