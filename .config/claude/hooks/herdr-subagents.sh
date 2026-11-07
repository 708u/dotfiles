#!/usr/bin/env bash
# SubagentStart / SubagentStop / SessionStart / SessionEnd フックとして呼ばれ、
# この pane で動いている subagent の数を herdr の sidebar に $subagents として送る。
# 足し引きのカウンタではなく agent_id ごとのファイルで数えるため、Stop の重複や
# 順序の入れ替わりがあっても件数がずれ続けない。
set -uo pipefail

export PATH="/etc/profiles/per-user/708u/bin:/run/current-system/sw/bin:/usr/bin:/bin:$PATH"

[[ -n "${HERDR_PANE_ID:-}" ]] || exit 0
command -v herdr >/dev/null || exit 0

dir="${XDG_STATE_HOME:-$HOME/.local/state}/claude-subagents/${HERDR_PANE_ID//[^A-Za-z0-9_-]/_}"

# 並列に起動した subagent の hook が同時に走ると、古い件数が後から届いて上書きしうる。
# 件数の集計と送信を lockf で直列にする
if [[ "${1:-}" == "--report" ]]; then
  n=$(find "$dir" -type f -name '*.agent' 2>/dev/null | wc -l | tr -d ' ')
  value=""
  ((n > 0)) && value="subagents ${n}"
  # 空の値を送ると herdr はその token を消す
  herdr pane report-metadata "$HERDR_PANE_ID" --source claude-subagents \
    --token "subagents=${value}" </dev/null >/dev/null 2>&1
  exit 0
fi

input="$(cat)"
event="$(jq -r '.hook_event_name // empty' <<<"$input")"
agent_id="$(jq -j '.agent_id // empty' <<<"$input" | tr -c 'A-Za-z0-9_-' '_')"

mkdir -p "$dir"
case "$event" in
  SubagentStart)
    [[ -n "$agent_id" ]] && : >"$dir/$agent_id.agent"
    ;;
  SubagentStop)
    [[ -n "$agent_id" ]] && rm -f "$dir/$agent_id.agent"
    ;;
  SessionStart)
    # 新しい process として起動したときは、前の process が中断などで Stop を
    # 送らずに残したファイルを消す。clear と compact では subagent が動き続けうるため残す
    case "$(jq -r '.source // empty' <<<"$input")" in
      startup | resume) rm -f "$dir"/*.agent ;;
    esac
    ;;
  SessionEnd)
    rm -f "$dir"/*.agent
    ;;
  *)
    exit 0
    ;;
esac

lockf -s -t 5 "$dir/.lock" "$0" --report
