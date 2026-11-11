#!/usr/bin/env bash
# 日本語の文章を Gemini API で自然な日本語へ書き換え、結果をファイルに書き出して差分を表示する。
#
# 使い方: naturalize.sh <入力ファイル> <出力ファイル>
#
# API キーは環境変数 GEMINI_API_KEY から読み込む。未設定で NATURALIZE_ENVCHAIN_NAMESPACE が
# 設定されていれば、その envchain の namespace を読み込んだ状態で自身を実行し直す。
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <input> <output>" >&2
  exit 2
fi

if [ -z "${GEMINI_API_KEY:-}" ]; then
  if [ -n "${NATURALIZE_ENVCHAIN_NAMESPACE:-}" ] && [ -z "${NATURALIZE_REEXEC:-}" ]; then
    NATURALIZE_REEXEC=1 exec envchain "$NATURALIZE_ENVCHAIN_NAMESPACE" "$0" "$@"
  fi
  echo "GEMINI_API_KEY が設定されていません。環境変数で渡すか、キーを登録した envchain の namespace を NATURALIZE_ENVCHAIN_NAMESPACE に設定してください" >&2
  exit 1
fi

INPUT="$1"
OUTPUT="$2"
MODEL="${NATURALIZE_MODEL:-gemini-3.8-flash}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 制約を system instruction に置き、文書の後ろに指示を置くと、原文に無い語の追加と
# 限定を表す語の言い換えが減った。書き換えは推論を要しないため thinkingLevel は low にする
read -r -d '' SYSTEM_INSTRUCTION <<'EOF' || true
あなたは日本語の文章の校正者です。
<constraints>
- 事実、数値、日付、固有名詞、識別子、見出しと表の構成を変えない
- 情報を追加・削除しない。原文に無い修飾語や、時制・方針・確度を表す語を足さない
- 限定や範囲を表す語 (のみ、だけ、以上、未満、すべて、上、分母など) と否定を言い換えない
- 誰が何をするか、依頼か報告か、予定か完了か、断定か推測かを変えない
- 文体 (です・ます / である) と敬語の度合いは原文に合わせる
- Markdown や Slack の記法、URL、メンション、コード、絵文字の記法、改行の位置はそのまま残す
- 直訳調、不自然な語順、硬すぎる表現だけを直し、自然な文はそのまま残す
</constraints>
<output_format>書き換え後の本文のみ。前置きや説明を付けない</output_format>
EOF

jq -n -c \
  --arg s "$SYSTEM_INSTRUCTION" \
  --rawfile d "$INPUT" \
  '{
    systemInstruction: {parts: [{text: $s}]},
    contents: [{role: "user", parts: [{text: ("<document>\n" + $d + "\n</document>\n\n上の文章を、意味を変えずに自然な日本語へ書き換えてください。")}]}],
    generationConfig: {thinkingConfig: {thinkingLevel: "low"}}
  }' >"$WORK/request.json"

HTTP_CODE="$(curl -sS --max-time 120 \
  -o "$WORK/response.json" -w '%{http_code}' \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -d @"$WORK/request.json" \
  "https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent")"

if [ "$HTTP_CODE" != "200" ]; then
  echo "Gemini API が HTTP $HTTP_CODE を返しました: $(jq -r '.error.message // empty' "$WORK/response.json")" >&2
  exit 1
fi

FINISH="$(jq -r '.candidates[0].finishReason // empty' "$WORK/response.json")"
if [ "$FINISH" != "STOP" ]; then
  echo "生成が途中で終わりました: finishReason=$FINISH" >&2
  exit 1
fi

jq -r '[.candidates[0].content.parts[] | select(.thought != true) | .text] | join("")' \
  "$WORK/response.json" >"$OUTPUT"

jq -r '.usageMetadata | "tokens: input=\(.promptTokenCount) output=\(.candidatesTokenCount) thoughts=\(.thoughtsTokenCount // 0)"' \
  "$WORK/response.json" >&2

DIFF="$(git diff --no-index --no-color -U0 "$INPUT" "$OUTPUT" | sed -n '/^@@/,$p' | grep -E '^[-+]' || true)"
echo "${DIFF:-(差分なし)}"
