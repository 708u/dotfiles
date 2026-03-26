#!/usr/bin/env bash

# Read input from stdin
input=$(cat)

# Get current directory info
current_dir=$(echo "$input" | jq -r '.workspace.current_dir // "."')

# Get git info
git_branch=$(git -C "$current_dir" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
remote_url=$(git -C "$current_dir" remote get-url origin 2>/dev/null || echo "")

# Build repo display (owner/repo:branch or dir:branch)
if [[ -n "$remote_url" ]]; then
  repo=$(echo "$remote_url" | sed -E 's#^(https?://[^/]+/|git@[^:]+:)##; s#\.git$##')
else
  dir_name=$(basename "$current_dir")
  parent_name=$(basename "$(dirname "$current_dir")")
  if [[ "$parent_name" != "/" && "$parent_name" != "." ]]; then
    repo="${parent_name}/${dir_name}"
  else
    repo="$dir_name"
  fi
fi

# ANSI colors
BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
GREEN='\033[32m'
ORANGE='\033[38;5;215m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

if [[ -n "$git_branch" ]]; then
  display_repo="${BOLD}${repo}${RESET} ${DIM}on${RESET} ${ORANGE}${git_branch}${RESET}"
else
  display_repo="${BOLD}${repo}${RESET}"
fi

# Get model and token info
model=$(echo "$input" | jq -r '.model.display_name // "Claude"')
context_size=$(echo "$input" | jq -r '.context_window.context_window_size // 200000')

# current_usageから実際のコンテキスト使用量を計算
total_tokens=$(echo "$input" | jq -r '
  .context_window.current_usage |
  ((.input_tokens // 0) + (.output_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0))
')
used=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | xargs printf "%.0f")

# Format token counts (K/M)
format_tokens() {
  local count=$1
  if (( count >= 1000000 )); then
    printf "%.1fM" "$(echo "scale=1; $count / 1000000" | bc | tr -d ' ')"
  elif (( count >= 1000 )); then
    printf "%.1fK" "$(echo "scale=1; $count / 1000" | bc | tr -d ' ')"
  else
    printf "%d" "$count"
  fi
}

total_fmt=$(format_tokens "$total_tokens")
ctx_fmt=$(format_tokens "$context_size")

# Progress bar color (bright variants for filled blocks)
if (( used < 50 )); then
  BAR_COLOR='\033[92m'
elif (( used < 80 )); then
  BAR_COLOR='\033[93m'
else
  BAR_COLOR='\033[91m'
fi

# Build progress bar
BRIGHT_GREEN='\033[92m'
BAR_WIDTH=10
FILLED=$((used * BAR_WIDTH / 100))
EMPTY=$((BAR_WIDTH - FILLED))
BAR=""
[ "$FILLED" -gt 0 ] && printf -v FILL "%${FILLED}s" && BAR="${BAR_COLOR}${FILL// /█}"
[ "$EMPTY" -gt 0 ] && printf -v PAD "%${EMPTY}s" && BAR="${BAR}${DIM}${BAR_COLOR}${PAD// /░}"
BAR="${BAR}${RESET}"

# Duration
DURATION_MS=$(echo "$input" | jq -r '.cost.total_duration_ms // 0')
MINS=$((DURATION_MS / 60000))
SECS=$(((DURATION_MS % 60000) / 1000))

# Rate limits
five_h=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
seven_d=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')

# Worktree
worktree_name=$(echo "$input" | jq -r '.worktree.name // empty')

# Line 1: repo, context bar, worktree
line1=("$display_repo")
line1+=("${BAR} ${used}% (${total_fmt} / ${ctx_fmt})")
if [[ -n "$worktree_name" ]]; then
  line1+=("${ORANGE}${worktree_name}${RESET}")
fi

# Line 2: model, cost, duration, rate limits
line2=("${DIM}${model}${RESET}")
line2+=("${DIM}dur${RESET} ${MINS}m ${SECS}s")
if [[ -n "$five_h" ]]; then
  five_h_int=$(printf "%.0f" "$five_h")
  seven_d_int=$(printf "%.0f" "$seven_d")
  line2+=("${DIM}limit 5h${RESET} ${five_h_int}% ${DIM}7d${RESET} ${seven_d_int}%")
fi

# Output
(IFS="|"; printf '%b\n' "${line1[*]}" | sed 's/|/ | /g')
(IFS="|"; printf '%b\n' "${line2[*]}" | sed 's/|/ | /g')
