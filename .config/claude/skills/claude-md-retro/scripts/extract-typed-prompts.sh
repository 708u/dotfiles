#!/usr/bin/env bash
# Claude Code transcript から人間がキーボード入力した発話のみを抽出する。
# tool 結果・hook 注入 prompt・subagent (sdk) 実行・他 session からの
# メッセージは promptSource / isSidechain / 接頭辞で除外する。
# 使い方: extract-typed-prompts.sh <file.jsonl>...
set -euo pipefail

for f in "$@"; do
  echo "### FILE: $f"
  jq -r '
    select(.type=="user"
      and (.toolUseResult == null)
      and .isMeta != true
      and .isSidechain != true
      and .promptSource == "typed")
    | .message.content
    | if type=="string" then .
      else ([.[] | select(type=="object" and .type=="text") | .text]
            | join("\n"))
      end
  ' "$f" 2>/dev/null \
    | grep -v '^[[:space:]]*$' \
    | grep -vE '^(<|Caveat:|Another Claude session)' || true
done
