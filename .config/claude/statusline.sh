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
MAGENTA='\033[35m'
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
# effort は reasoning 非対応モデルでは absent になる
effort=$(echo "$input" | jq -r '.effort.level // empty')
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

# Lines changed
lines_added=$(echo "$input" | jq -r '.cost.total_lines_added // 0')
lines_removed=$(echo "$input" | jq -r '.cost.total_lines_removed // 0')

# Duration
DURATION_MS=$(echo "$input" | jq -r '.cost.total_duration_ms // 0')
MINS=$((DURATION_MS / 60000))
SECS=$(((DURATION_MS % 60000) / 1000))

# Rate limits
IFS=$'\t' read -r five_h five_h_reset seven_d seven_d_reset < <(echo "$input" | jq -r '
  [.rate_limits.five_hour, .rate_limits.seven_day]
  | map(.used_percentage // "-", .resets_at // "-") | @tsv')
[[ "$five_h" == "-" ]] && five_h=""
[[ "$five_h_reset" == "-" ]] && five_h_reset=""
[[ "$seven_d" == "-" ]] && seven_d=""
[[ "$seven_d_reset" == "-" ]] && seven_d_reset=""
# spend_limit は extra usage の状態があるときだけ入力に含まれる
spend=$(echo "$input" | jq -r '.rate_limits.spend_limit // empty
  | [.used_percentage // "", .used_usd // "", .limit_usd // ""] | @tsv')

# Prompt cache
IFS=$'\t' read -r cache_warm cache_expires < <(echo "$input" | jq -r '
  [.prompt_cache.warm // "-", .prompt_cache.expires_at // "-"] | @tsv')

# Worktree
worktree_name=$(echo "$input" | jq -r '.worktree.name // empty')

# Line 1: repo, context bar, worktree
line1=("$display_repo")
line1+=("${BAR} ${used}% (${total_fmt} / ${ctx_fmt})")
if [[ -n "$worktree_name" ]]; then
  line1+=("${ORANGE}${worktree_name}${RESET}")
fi

# Line 2: model, duration, lines changed, rate limits
model_lower=$(echo "$model" | tr '[:upper:]' '[:lower:]')
case "$model_lower" in
  *opus*) model_color="$MAGENTA" ;;
  *sonnet*) model_color="$CYAN" ;;
  *haiku*) model_color="$GREEN" ;;
  *fable*) model_color="$RED" ;;
  *) model_color="$DIM" ;;
esac
model_chip="${model_color}${model}${RESET}"
if [[ -n "$effort" ]]; then
  case "$effort" in
    low) effort_color="$DIM" ;;
    medium) effort_color="$GREEN" ;;
    high) effort_color="$YELLOW" ;;
    xhigh | max) effort_color="$RED" ;;
    *) effort_color="$DIM" ;;
  esac
  model_chip="${model_chip} ${effort_color}${effort}${RESET}"
fi
line2=("$model_chip")
line2+=("${DIM}dur${RESET} ${MINS}m ${SECS}s")
if (( lines_added > 0 || lines_removed > 0 )); then
  line2+=("${GREEN}+${lines_added}${RESET} ${RED}-${lines_removed}${RESET}")
fi
# statusline の入力に model 別の週間枠が含まれないため、/usage の出力を
# バックグラウンドで取得して cache する。statusline 自体は cache を読むだけにする
usage_cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/claude-statusline"
usage_cache="${usage_cache_dir}/limits.tsv"
usage_ttl=120
refresh_usage_cache() {
  local lock="${usage_cache_dir}/refresh.lock"
  mkdir -p "$usage_cache_dir"
  # 異常終了で残った lock は取得の所要時間を十分超えたら破棄する
  if [[ -d "$lock" ]] && (($(date +%s) - $(date -r "$lock" +%s) > 60)); then
    rmdir "$lock" 2>/dev/null
  fi
  mkdir "$lock" 2>/dev/null || return
  (
    out=$(cd "$usage_cache_dir" && timeout 30 claude -p "/usage" \
      --setting-sources "" --strict-mcp-config --no-session-persistence 2>/dev/null)
    # NOTE: /usage の表示文言に依存する。文言が変わると該当項目が - になる
    # 例: "Current week (Fable): 74% used · resets Oct 31 at 12pm (Asia/Tokyo)"
    # read の IFS では空 field が詰められるため、欠損は - で埋める
    parse_row() {
      local row pct reset_text epoch
      row=$(grep -F "$1: " <<<"$out" | head -n 1)
      pct=$(sed -nE 's/.*: ([0-9]+)% used.*/\1/p' <<<"$row")
      reset_text=$(sed -nE 's/.* resets ([^(]*[^ (]).*/\1/p' <<<"$row")
      epoch=$(date -d "${reset_text/ at / }" +%s 2>/dev/null)
      printf '%s\t%s' "${pct:--}" "${epoch:--}"
    }
    rows="$(parse_row "Current session")	$(parse_row "Current week (all models)")	$(parse_row "Current week (Fable)")"
    if [[ "$rows" =~ [0-9] ]]; then
      printf '%s\n' "$rows" >"${usage_cache}.tmp" &&
        mv "${usage_cache}.tmp" "$usage_cache"
    fi
    rmdir "$lock"
  ) </dev/null >/dev/null 2>&1 &
  disown
}
if [[ ! -f "$usage_cache" ]] || (($(date +%s) - $(date -r "$usage_cache" +%s) > usage_ttl)); then
  refresh_usage_cache
fi
if [[ -f "$usage_cache" ]]; then
  IFS=$'\t' read -r c_five_h c_five_h_reset c_seven_d c_seven_d_reset fable fable_reset <"$usage_cache"
  for v in c_five_h c_five_h_reset c_seven_d c_seven_d_reset fable fable_reset; do
    [[ "${!v}" == "-" ]] && printf -v "$v" ''
  done
  # 入力の rate_limits を優先し、無いときだけ cache で補う
  if [[ -z "$five_h" ]]; then
    five_h="$c_five_h"
    five_h_reset="$c_five_h_reset"
  fi
  if [[ -z "$seven_d" ]]; then
    seven_d="$c_seven_d"
    seven_d_reset="$c_seven_d_reset"
  fi
fi

# rate_limits は最初の API 応答まで absent になるため、値が無くても枠は表示する
format_pct() {
  if [[ -n "$1" ]]; then
    local pct color
    pct=$(printf "%.0f" "$1")
    if ((pct < 50)); then
      color='\033[92m'
    elif ((pct < 80)); then
      color='\033[93m'
    else
      color='\033[91m'
    fi
    printf "%s%d%%%s" "${BOLD}${color}" "$pct" "$RESET"
  else
    printf -- "-"
  fi
}
# 当日中の reset は時刻のみ、それ以外は日付を付ける
format_reset() {
  [[ -z "$1" ]] && return
  # /usage の文言は秒以下を切り捨てて 11:59 と 12:00 が混在するため 5 分単位に丸める
  local epoch=$((($1 + 150) / 300 * 300))
  local fmt='%m/%d %H:%M'
  [[ "$(date -d "@$epoch" +%F 2>/dev/null)" == "$(date +%F)" ]] && fmt='%H:%M'
  printf " ${DIM}(%s)${RESET}" "$(date -d "@$epoch" "+$fmt" 2>/dev/null)"
}

# Line 2 (続き): rate limits
line2+=("${DIM}5h${RESET} $(format_pct "$five_h")$(format_reset "$five_h_reset")")
line2+=("${DIM}7d${RESET} $(format_pct "$seven_d")$(format_reset "$seven_d_reset")")
line2+=("${DIM}fable${RESET} $(format_pct "$fable")$(format_reset "$fable_reset")")
if [[ -n "$spend" ]]; then
  IFS=$'\t' read -r spend_pct spend_used spend_limit <<<"$spend"
  spend_chip="${DIM}extra${RESET} $(format_pct "$spend_pct")"
  if [[ -n "$spend_used" && -n "$spend_limit" ]]; then
    spend_chip+=" ${DIM}($(printf '$%.2f / $%.0f' "$spend_used" "$spend_limit"))${RESET}"
  fi
  line2+=("$spend_chip")
fi

# statusline は event 駆動でしか再描画されないため、残り時間ではなく失効時刻を出す
if [[ "$cache_warm" == "true" && "$cache_expires" != "-" ]]; then
  cache_left=$((cache_expires - $(date +%s)))
  if ((cache_left <= 0)); then
    cache_chip="${RED}cold${RESET}"
  else
    cache_color=""
    ((cache_left < 600)) && cache_color="$YELLOW"
    cache_chip="${cache_color}$(date -d "@$cache_expires" +%H:%M 2>/dev/null)${RESET}"
  fi
  line1+=("${DIM}cache${RESET} ${cache_chip}")
elif [[ "$cache_warm" == "false" ]]; then
  line1+=("${DIM}cache${RESET} ${RED}cold${RESET}")
fi

# Output
(IFS="|"; printf '%b\n' "${line1[*]}" | sed 's/|/ | /g')
(IFS="|"; printf '%b\n' "${line2[*]}" | sed 's/|/ | /g')
