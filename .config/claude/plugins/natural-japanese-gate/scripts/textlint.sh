#!/usr/bin/env bash
# PostToolUse フックとして呼ばれ、Write/Edit で書き込まれた markdown と
# HTML に textlint をかけ、指摘があれば Claude にフィードバックする。
# HTML を対象に含めるのは、Artifact が publish 前にローカルの .html を
# 経由するため。
set -uo pipefail

# フック実行環境は PATH が最小化されうるため、依存コマンドの場所を補う。
export PATH="/Users/708u/go/bin:/etc/profiles/per-user/708u/bin:/run/current-system/sw/bin:/usr/bin:/bin:$PATH"

# npm の update notifier が reason に混ざるのを防ぐ。
export npm_config_update_notifier=false

INPUT="$(cat)"
FILE_PATH="$(jq -r '.tool_input.file_path // empty' <<<"$INPUT" 2>/dev/null)"

case "$FILE_PATH" in
  *.md | *.html) : ;;
  *) exit 0 ;;
esac

CONFIG="$HOME/.claude/textlint/.textlintrc.json"
[ -f "$CONFIG" ] || exit 0
[ -f "$FILE_PATH" ] || exit 0

PACKAGES=(
  -p textlint
  -p textlint-plugin-html
  -p textlint-rule-preset-ai-words-ja
  -p @textlint-ja/textlint-rule-preset-ai-writing
)

OUTPUT="$(npx --yes "${PACKAGES[@]}" textlint -c "$CONFIG" "$FILE_PATH" 2>&1)"
STATUS=$?

[ "$STATUS" -eq 0 ] && exit 0

jq -n --arg reason "$OUTPUT" '{decision: "block", reason: $reason}'
exit 0
