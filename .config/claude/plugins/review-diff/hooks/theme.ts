// 反転表示だと選択範囲の背景が白く目立つため、暗い青を塗る
export const SELECTED_BACKGROUND = "#264f78";

// 緑と赤は diff の追加行と削除行の色なので、コメントの種類の見分けには使わない
export const OWN_COMMENT_COLOR = "claude";
export const PR_COMMENT_COLOR = "suggestion";

// 文字色で塗ると行全体が赤と緑になり読みにくいので、背景で塗る。
// 対になる削除行と追加行で変わった部分は、より濃い背景で塗る。
// theme の diff 用の色は ansi の theme では端末の緑と赤になり、背景にすると文字が読めないため、
// theme の明暗ごとに背景向けの色を決める
export const DIFF_COLORS = {
  dark: {
    line: { add: "#30593d", del: "#5e2f38" },
    change: { add: "#46955c", del: "#a8424f" },
  },
  light: {
    line: { add: "#e6ffec", del: "#ffebe9" },
    change: { add: "#abf2bc", del: "#ffc1c0" },
  },
} as const;
