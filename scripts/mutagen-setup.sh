#!/bin/bash
set -euo pipefail

mutagen daemon start 2>/dev/null || true

sessions=(
  "ghq|$HOME/ghq|home:~/ghq"
  "claude-dir|$HOME/.claude|home:~/.claude"
  "claude-json|$HOME/.claude.json|home:~/.claude.json"
)

for entry in "${sessions[@]}"; do
  IFS='|' read -r name alpha beta <<< "$entry"
  if mutagen sync list 2>/dev/null | grep -q "^Name: ${name}$"; then
    echo "Session '${name}' already exists, skipping."
  else
    echo "Creating session '${name}'..."
    mutagen sync create --name="${name}" "${alpha}" "${beta}"
  fi
done
