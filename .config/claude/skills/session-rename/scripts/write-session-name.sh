#!/bin/bash
# Write session name to temp file for SessionEnd hook
# Usage: write-session-name.sh <session_id> <name>
set -euo pipefail

session_id="${1:?session_id required}"
name="${2:?name required}"

mkdir -p .claude/tmp
echo "$name" > ".claude/tmp/session-env-${session_id}"
cat ".claude/tmp/session-env-${session_id}"
