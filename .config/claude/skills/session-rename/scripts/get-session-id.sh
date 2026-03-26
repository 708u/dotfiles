#!/bin/bash
# Get the current Claude Code session ID by walking the process tree
set -euo pipefail

current_pid=$$
while [ "$current_pid" != "1" ]; do
  if [ -f "$HOME/.claude/sessions/${current_pid}.json" ]; then
    jq -r '.sessionId' "$HOME/.claude/sessions/${current_pid}.json"
    exit 0
  fi
  current_pid=$(ps -o ppid= -p "$current_pid" 2>/dev/null | tr -d ' ')
done

exit 1
