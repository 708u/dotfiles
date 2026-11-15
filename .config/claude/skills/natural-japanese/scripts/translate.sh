#!/usr/bin/env bash
# Gemini API で英語のテキストを日本語に翻訳し、結果をファイルに書き込む。
#
# 使い方: translate.sh <英語の入力ファイル> <日本語の出力ファイル> <です・ます|である>
#
# 入力と出力のペアを記録する。このペアは finalize.sh が最終稿を承認するために使用する。
#
# API キーは環境変数 GEMINI_API_KEY から読み込む。設定されておらず NATURALIZE_ENVCHAIN_NAMESPACE が
# 設定されている場合は、その envchain namespace を読み込んで自身を再実行する。
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <english-input> <japanese-output> <です・ます|である>" >&2
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
STYLE="$3"
MODEL="${NATURALIZE_MODEL:-gemini-4-hydrogen}"
STORE="${NATURAL_JAPANESE_STORE:-$HOME/.cache/natural-japanese}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# CLAUDE.md の「自然言語生成」セクションがスタイル規則の原本であるため、ここにはコピーしない
STYLE_GUIDE="$(awk '/^## 自然言語生成/{f=1} /^### textlint による/{f=0} f' "$HOME/.claude/CLAUDE.md")"

# リストはメンテナンスが必要でありモデルの更新に追随できないため、原則のみを示し直訳のリストは含めない
read -r -d '' SYSTEM_INSTRUCTION <<'INSTR' || true
あなたは英語の技術文書を日本語に翻訳する翻訳者です。読み手は日本のソフトウェアエンジニアです。
<principles>
- 英語の語を辞書の訳語に置き換えない。その意味を、日本のソフトウェアエンジニアが日本語で書くときに使う語と言い回しで書く。カタカナ語が一般的な概念はカタカナ語にする
- 英語で比喩として使われている語や句動詞は、日本語の同じ比喩にしない。実際に起きることを表す語にする
- 物が主語の文に、人の動作を表す動詞 (知る、覚える、見る、持つ、話す など) を当てない。have は「ある」「含む」「設定されている」など、実際の関係を表す語にする
- 英語のまま書かれた語 (識別子、コード、ファイル名、コマンド、環境名、ツールや画面の要素の名前) は英語のまま残す
- 原文の中に日本語で書かれた部分 (あいさつ、定型句、敬語など) は、そのまま残す
- 事実、数値、日付、固有名詞、見出しと表の構成、限定や範囲、否定、時制、誰が何をするかを変えない。情報を追加・削除しない
- 翻訳調の表現 (において、および、により、によって など) を使わない
- Markdown や Slack の記法、URL、メンション、コード、改行の位置はそのまま残す
- 英数字と日本語の間には半角スペースを入れる。括弧などの記号は原文と同じ文字 (半角) を使う
- <style_guide> の規則に従う
</principles>
<output_format>翻訳した本文のみ。前置きや説明を付けない</output_format>
INSTR

jq -n -c \
  --arg s "$SYSTEM_INSTRUCTION" \
  --arg g "$STYLE_GUIDE" \
  --arg style "$STYLE" \
  --rawfile d "$INPUT" \
  '{
    systemInstruction: {parts: [{text: ($s + "\n<style_guide>\n" + $g + "\n</style_guide>")}]},
    contents: [{role: "user", parts: [{text: ("<document>\n" + $d + "\n</document>\n\n上の英語の文章を日本語に翻訳してください。文体は「" + $style + "」に揃えてください。")}]}],
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

mkdir -p "$STORE/translations"
shasum -a 256 "$INPUT" | cut -d' ' -f1 >"$STORE/translations/$(shasum -a 256 "$OUTPUT" | cut -d' ' -f1)"

jq -r '.usageMetadata | "tokens: input=\(.promptTokenCount) output=\(.candidatesTokenCount) thoughts=\(.thoughtsTokenCount // 0)"' \
  "$WORK/response.json" >&2

cat "$OUTPUT"
