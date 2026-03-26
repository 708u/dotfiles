#!/bin/bash
# Write session name to /tmp for SessionEnd hook
# Usage: write-session-name.sh <session_id> <name>
set -euo pipefail

session_id="${1:?session_id required}"
name="${2:?name required}"

echo "$name" > "/tmp/claude-session-env-${session_id}"
cat "/tmp/claude-session-env-${session_id}"
