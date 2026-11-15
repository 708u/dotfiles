#!/usr/bin/env bash
# 下書きから、英語の語や構文を直訳した表現を検出する。
#
# 使い方: precheck.sh <下書きファイル>
#
# 出力は 2 つに分かれる。
# - 辞書で検出した語: textlint の辞書に登録した語で、どの文脈でも言い換える
# - 文脈で判断する候補: calque-candidates.tsv の表現を含む行。日本語として自然な用法と、
#   英語の意味で使った用法の両方があるため、文脈を読んで判断する
set -uo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <draft>" >&2
  exit 2
fi

INPUT="$1"
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CANDIDATES="$SKILL_DIR/calque-candidates.tsv"
CONFIG="$HOME/.claude/textlint/.textlintrc.json"

# npm の update notifier の表示を出力に含めない
export npm_config_update_notifier=false

echo "## 辞書で検出した語 (すべて言い換える)"
LINT="$(npx --yes \
  -p textlint \
  -p textlint-plugin-html \
  -p textlint-rule-preset-ai-words-ja \
  -p @textlint-ja/textlint-rule-preset-ai-writing \
  textlint -c "$CONFIG" -f unix "$INPUT" 2>&1)"
if [ $? -eq 0 ]; then
  echo "(なし)"
else
  # 行頭のファイルパスと末尾の件数の行は判断に使わないため除く
  grep -F "$INPUT:" <<<"$LINT" | sed "s|^$INPUT:||"
fi

echo
echo "## 文脈で判断する候補"
FOUND=0
while IFS=$'\t' read -r pattern english replacement natural; do
  case "$pattern" in '' | '#'*) continue ;; esac
  MATCHES="$(/usr/bin/grep -nE -- "$pattern" "$INPUT" || true)"
  [ -n "$MATCHES" ] || continue
  FOUND=1
  echo "### $pattern"
  echo "英語: $english / 英語の意味なら: $replacement / 日本語として自然な用法: $natural"
  echo "$MATCHES"
done <"$CANDIDATES"
[ "$FOUND" -eq 1 ] || echo "(なし)"
