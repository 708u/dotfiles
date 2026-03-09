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

# ANSI colors - Minimal palette
BOLD='\033[1m'
DIM='\033[2m'
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

# 補正値: 82%でコンテキストが切れるため、82%を100%に補正
corrected_used=$(( used * 100 / 82 ))

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

# Usage color - always visible, warn with color
if (( corrected_used < 50 )); then
  USAGE_COLOR=""
elif (( corrected_used < 80 )); then
  USAGE_COLOR="$YELLOW"
else
  USAGE_COLOR="$RED"
fi

# Build output
parts=("$display_repo")
parts+=("${DIM}${model}${RESET}")
parts+=("${total_fmt} / ${ctx_fmt} (${USAGE_COLOR}${corrected_used}%${RESET}) ${DIM}[${used}%]${RESET}")

# Join with " | "
(IFS="|"; printf '%b\n' "${parts[*]}" | sed 's/|/ | /g')
