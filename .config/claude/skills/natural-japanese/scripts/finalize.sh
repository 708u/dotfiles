#!/usr/bin/env bash
# 英語と突き合わせた最終稿を承認済みとして記録する。natural-japanese-gate plugin の hook は、
# 記録されたテキストを使って書き込みや送信を許可するかどうかを判定する。
#
# 使い方:
#   finalize.sh <英語の下書き> <translate.sh の出力> <最終稿>
#   finalize.sh --amend <承認済みの最終稿> <修正後>
#
# 英語の下書きと translate.sh の出力のペアが、translate.sh が記録したものと一致しない限り承認しない。
# これにより、Gemini の翻訳を通っていないテキストが承認されるのを防ぐ。
#
# --amend は、誤字や数値を修正した後に、再翻訳なしで承認済みの最終稿を再度承認する。
# 変更された文字数が AMEND_MAX_CHARS を超える場合は承認しない。
set -uo pipefail

STORE="${NATURAL_JAPANESE_STORE:-$HOME/.cache/natural-japanese}"
AMEND_MAX_CHARS=20

sha() { shasum -a 256 "$1" | cut -d' ' -f1; }

if [ "${1:-}" = "--amend" ] && [ "$#" -eq 3 ]; then
  BASE="$2"
  FINAL="$3"
  if [ ! -f "$STORE/approved/$(sha "$BASE").txt" ]; then
    echo "$BASE は承認済みの最終稿として記録されていません" >&2
    exit 1
  fi
  CHANGED="$(git diff --no-index --no-color --word-diff=porcelain --word-diff-regex=. "$BASE" "$FINAL" |
    sed -n '/^@@/,$p' | grep -E '^[-+]' | jq -Rn '[inputs | length - 1] | add // 0')"
  if [ "$CHANGED" -gt "$AMEND_MAX_CHARS" ]; then
    echo "変わった文字数 ($CHANGED) が多いため --amend では承認できません。英語の下書きから通し直してください" >&2
    exit 1
  fi
elif [ "$#" -eq 3 ]; then
  ENGLISH="$1"
  TRANSLATED="$2"
  FINAL="$3"
  RECORD="$STORE/translations/$(sha "$TRANSLATED")"
  if [ ! -f "$RECORD" ] || [ "$(cat "$RECORD")" != "$(sha "$ENGLISH")" ]; then
    echo "$TRANSLATED は $ENGLISH を translate.sh で翻訳した出力として記録されていません。translate.sh の入力と出力のファイルを指定してください" >&2
    exit 1
  fi
else
  echo "usage: $0 <english> <translated> <final> | --amend <approved-final> <amended>" >&2
  exit 2
fi

mkdir -p "$STORE/approved"
cp "$FINAL" "$STORE/approved/$(sha "$FINAL").txt"
echo "承認済みとして記録しました: $FINAL"
