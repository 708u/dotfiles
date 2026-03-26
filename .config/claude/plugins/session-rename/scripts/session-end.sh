#!/bin/bash
# SessionEnd hook: read session name from /tmp and append to transcript
set -euo pipefail

input=$(cat)
session_id=$(echo "$input" | jq -r '.session_id')
transcript_path=$(echo "$input" | jq -r '.transcript_path')

name_file="/tmp/claude-session-env-${session_id}"

[ -f "$name_file" ] || exit 0

title=$(cat "$name_file")
[ -n "$title" ] || exit 0

echo "{\"type\":\"custom-title\",\"customTitle\":\"${title}\",\"sessionId\":\"${session_id}\"}" >> "$transcript_path"
echo "{\"type\":\"agent-name\",\"agentName\":\"${title}\",\"sessionId\":\"${session_id}\"}" >> "$transcript_path"

rm -f "$name_file"
