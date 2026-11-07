#!/usr/bin/env bash
# SubagentStart / SubagentStop / SessionStart / SessionEnd フックとして呼ばれ、
# この pane で動いている subagent の数を herdr の sidebar に $subagents として送る。
# 足し引きのカウンタではなく agent_id ごとのファイルで数えるため、Stop の重複や
# 順序の入れ替わりがあっても件数がずれ続けない。
#
# 同じ pane の中で実行した claude -p も HERDR_PANE_ID を受け継ぐため、状態は
# session ごとに分け、pane の件数は全 session の合計とする。中断などで SessionEnd が
# 届かなかった session は、記録した claude の process が終了していれば集計前に消す。
set -uo pipefail

# herdr はマシンによって nix と Homebrew のどちらで入れたかが異なるため、両方を探す
export PATH="/etc/profiles/per-user/708u/bin:/run/current-system/sw/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

[[ -n "${HERDR_PANE_ID:-}" ]] || exit 0
command -v herdr >/dev/null || exit 0

pane_dir="${XDG_STATE_HOME:-$HOME/.local/state}/claude-subagents/${HERDR_PANE_ID//[^A-Za-z0-9_-]/_}"

# 並列に起動した subagent の hook が同時に走ると、古い件数が後から届いて上書きしうる。
# 件数の集計と送信を lockf で直列にする
if [[ "${1:-}" == "--report" ]]; then
  for s in "$pane_dir"/*/; do
    [[ -d "$s" ]] || continue
    pid="$(cat "$s/pid" 2>/dev/null)"
    if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
      rm -rf "$s"
    fi
  done
  n=$(find "$pane_dir" -type f -name '*.agent' 2>/dev/null | wc -l | tr -d ' ')
  value=""
  ((n > 0)) && value="subagents ${n}"
  # 空の値を送ると herdr はその token を消す
  herdr pane report-metadata "$HERDR_PANE_ID" --source claude-subagents \
    --token "subagents=${value}" </dev/null >/dev/null 2>&1
  exit 0
fi

# hook は sh -c を挟んで起動されることがあるため、親をたどって claude の process を探す
claude_pid() {
  local p=$PPID comm
  for _ in 1 2 3 4 5; do
    comm="$(ps -o comm= -p "$p" 2>/dev/null)"
    [[ "${comm##*/}" == claude ]] && { echo "$p"; return; }
    p="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')"
    [[ -n "$p" && "$p" != 1 ]] || return
  done
}

input="$(cat)"
event="$(jq -r '.hook_event_name // empty' <<<"$input")"
session_id="$(jq -j '.session_id // empty' <<<"$input" | tr -c 'A-Za-z0-9_-' '_')"
agent_id="$(jq -j '.agent_id // empty' <<<"$input" | tr -c 'A-Za-z0-9_-' '_')"
[[ -n "$session_id" ]] || exit 0

dir="$pane_dir/$session_id"
mkdir -p "$dir"
[[ -f "$dir/pid" ]] || claude_pid >"$dir/pid"

case "$event" in
  SubagentStart)
    [[ -n "$agent_id" ]] && : >"$dir/$agent_id.agent"
    ;;
  SubagentStop)
    [[ -n "$agent_id" ]] && rm -f "$dir/$agent_id.agent"
    ;;
  SessionStart)
    # resume は同じ session_id を新しい process で使うため、前の process の記録を消す
    case "$(jq -r '.source // empty' <<<"$input")" in
      startup | resume)
        rm -f "$dir"/*.agent
        claude_pid >"$dir/pid"
        ;;
    esac
    ;;
  SessionEnd)
    rm -rf "$dir"
    ;;
  *)
    exit 0
    ;;
esac

lockf -s -t 5 "$pane_dir/.lock" "$0" --report
