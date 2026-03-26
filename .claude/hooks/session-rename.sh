#!/bin/bash
# SessionEnd hook: rename session from .claude/tmp/session-env-<session_id>
#
# Claude writes session name to $CWD/.claude/tmp/session-env-<session_id>
# This hook reads it, appends custom-title/agent-name to the jsonl,
# and removes the temp file.

set -euo pipefail

input=$(cat)
session_id=$(echo "$input" | jq -r '.session_id')
transcript_path=$(echo "$input" | jq -r '.transcript_path')
cwd=$(echo "$input" | jq -r '.cwd')

name_file="${cwd}/.claude/tmp/session-env-${session_id}"

[ -f "$name_file" ] || exit 0

title=$(cat "$name_file")
[ -n "$title" ] || exit 0

echo "{\"type\":\"custom-title\",\"customTitle\":\"${title}\",\"sessionId\":\"${session_id}\"}" >> "$transcript_path"
echo "{\"type\":\"agent-name\",\"agentName\":\"${title}\",\"sessionId\":\"${session_id}\"}" >> "$transcript_path"

rm -f "$name_file"
