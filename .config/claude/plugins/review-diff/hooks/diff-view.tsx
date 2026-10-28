import type { ClientModule } from "claude-code";

import type {
  DiffRow,
  DiffViewMessage,
  DiffViewProps,
  LineCaret,
} from "../types";
import { SELECTED_BACKGROUND } from "./theme";

type ViewState = LineCaret & { isDragging: boolean };

type ScreenRow = { line: number; text: string; kind: DiffRow["kind"] };

const COLORS = { add: "success", del: "error", hunk: "suggestion" } as const;

// 端末では全角文字が 2 桁を占める
function charWidth(char: string): number {
  return (char.codePointAt(0) ?? 0) > 0xff ? 2 : 1;
}

/**
 * 1 行を幅に収まる画面上の行に分ける。続きの行は indent 桁の字下げから始める
 *
 * @param text 分ける行
 * @param width 1 行の桁数
 * @param indent 続きの行の字下げ
 * @returns 画面上の行
 */
function wrapRow(text: string, width: number, indent: number): string[] {
  const pad = " ".repeat(Math.min(indent, Math.max(0, width - 10)));
  const parts: string[] = [];
  let current = "";
  let used = 0;
  for (const char of text) {
    const w = charWidth(char);
    if (used + w > width && current.trim() !== "") {
      parts.push(current);
      current = pad;
      used = pad.length;
    }
    current += char;
    used += w;
  }
  parts.push(current);

  return parts;
}

/**
 * diff の行をドラッグやキー操作で範囲選択し、選択範囲を hooks module へ送る
 *
 * 行の位置はファイル全体での位置で扱う。diff はコメントを挟む位置で複数の Client に分かれ、
 * 選択の起点が別の Client にあることがあるため。
 * キー操作は区間をまたいで動くが、ドラッグはこの Client の区間に収める。
 * 区間の外の座標は間に挟まるコメントの行数が分からず、diff の行に対応づけられないため。
 * hunk の見出し行はコードの行ではないので、選択の端にせず、範囲に含まれても反転しない。
 * 確定した選択は props.selection として戻ってくるので、手元の state はドラッグ中だけ使う。
 * 長い行は折り返す。端末の自動折り返しでは画面上の行と diff の行の対応が分からず、
 * クリックした位置から行を求められないため、ここで幅に合わせて分けて対応を持つ。
 *
 * @param props 描画する行、その先頭のファイル内での位置 offset、全体の行数 total、
 *              見出し行の位置 hunks、描画の初回に使う幅 width、確定済みの選択
 * @param surface 端末側の描画環境
 * @returns 行の一覧
 */
const DiffView: ClientModule<DiffViewProps, ViewState> = (props, surface) => {
  const { Box, Text } = surface.elements;
  const first = props.offset;
  const last = props.offset + props.rows.length - 1;
  const hunks = new Set(props.hunks);
  const isCode = (n: number) => n >= 0 && n < props.total && !hunks.has(n);
  const clamp = (n: number) => Math.min(Math.max(n, first), last);
  // from から step 方向に、見出し行を飛ばして次のコードの行を探す。無ければ from のまま
  const stepFrom = (from: number, step: number) => {
    for (let n = from + step; n >= 0 && n < props.total; n += step) {
      if (isCode(n)) return n;
    }

    return from;
  };
  const firstCode = () => {
    for (let n = first; n <= last; n += 1) if (isCode(n)) return n;

    return undefined;
  };
  const send = (type: DiffViewMessage["type"], caret: LineCaret) => {
    const message: DiffViewMessage = { type, ...caret };
    surface.post(message);
  };
  // 領域の幅は最初の配置まで 0 なので、それまでは pane の幅で折り返す
  const width = Math.max(
    20,
    surface.columns > 0 ? surface.columns : props.width
  );
  const screen: ScreenRow[] = props.rows.flatMap((row, i) =>
    wrapRow(row.text, width, row.indent).map((text) => ({
      line: first + i,
      text,
      kind: row.kind,
    }))
  );

  surface.onPointer((event) => {
    if (props.rows.length === 0) return;
    const row = screen[Math.min(Math.max(event.y, 0), screen.length - 1)];
    const line = clamp(row?.line ?? first);
    const drag = surface.state;

    if (event.type === "down" && event.button === "left") {
      if (!isCode(line)) return;
      const anchor =
        event.shift && props.selection ? props.selection.anchor : line;
      surface.setState({ anchor, head: line, isDragging: true });
      return;
    }
    if (drag === undefined || !drag.isDragging) return;
    // 見出し行の上では端を動かさず、直前のコードの行に留める
    const head = isCode(line) ? line : drag.head;
    if (event.type === "move" && head !== drag.head) {
      surface.setState({ ...drag, head });
      return;
    }
    if (event.type !== "up") return;

    surface.setState({ ...drag, head, isDragging: false });
    const before = props.selection;
    // 複数行のドラッグか、選択済みの 1 行をもう一度押したときにコメント欄を開く
    const isSameLine =
      before !== null &&
      before.anchor === head &&
      before.head === head &&
      drag.anchor === head;
    const isCompose = !event.shift && (drag.anchor !== head || isSameLine);
    send(isCompose ? "compose" : "select", { anchor: drag.anchor, head });
  });

  surface.onKey((event) => {
    if (props.rows.length === 0) return;
    const start = firstCode();
    const current =
      props.selection ??
      (start === undefined ? undefined : { anchor: start, head: start });
    if (current === undefined) return;

    const isUp = event.key === "up" || event.key === "k" || event.key === "K";
    const isDown =
      event.key === "down" || event.key === "j" || event.key === "J";
    const isExtend =
      event.shift === true || event.key === "K" || event.key === "J";

    if (isUp || isDown) {
      const head = stepFrom(current.head, isUp ? -1 : 1);
      send("select", { anchor: isExtend ? current.anchor : head, head });
    } else if (event.key === "return" || event.key === "c") {
      send("compose", { anchor: current.anchor, head: current.head });
    }
  });

  const shown = surface.state?.isDragging ? surface.state : props.selection;
  const low = shown ? Math.min(shown.anchor, shown.head) : -1;
  const high = shown ? Math.max(shown.anchor, shown.head) : -1;

  return (
    <Box flexDirection="column">
      {screen.map((row) => (
        <Text
          color={row.kind === "ctx" ? undefined : COLORS[row.kind]}
          backgroundColor={
            row.kind !== "hunk" && row.line >= low && row.line <= high
              ? SELECTED_BACKGROUND
              : undefined
          }
          wrap="truncate-end"
        >
          {row.text}
        </Text>
      ))}
    </Box>
  );
};

export default DiffView;
