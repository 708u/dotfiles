#!/usr/bin/env bash
# worktree を作成し、herdr の workspace で Claude Code を起動して prompt を送る。
# 結果は status=... の 1 行で出力し、失敗時のみ画面の末尾を続けて出力する。
#
# usage: spawn.sh [--pre-run <command>] [--source <branch>] <branch> <prompt-file>
set -euo pipefail

pre_run=""
source_args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pre-run) pre_run="$2"; shift 2 ;;
    --source) source_args=(--source "$2"); shift 2 ;;
    *) break ;;
  esac
done

if [[ $# -ne 2 ]]; then
  echo "status=error reason=usage"
  exit 1
fi
branch="$1"
prompt_file="$2"

if [[ ! -s "$prompt_file" ]]; then
  echo "status=error reason=prompt_file_not_found path=$prompt_file"
  exit 1
fi

# set -e で途中の command が失敗しても、呼び出し側が status 行で分岐できるようにする
summary=""
trap 'echo "status=error ${summary:+$summary }command=$BASH_COMMAND"' ERR

repo_root=$(git rev-parse --show-toplevel)
worktree=$(twig add "$branch" -q ${source_args[@]+"${source_args[@]}"})
summary="worktree=$worktree"

# trust dialog が表示されると Claude Code が prompt を受け付けないため、事前に承認済みにする
jq --arg path "$worktree" '
  .projects //= {} |
  .projects[$path] = ((.projects[$path] // {}) + {
    "hasTrustDialogAccepted": true,
    "hasTrustDialogHooksAccepted": true,
    "hasClaudeMdExternalIncludesApproved": true,
    "hasClaudeMdExternalIncludesWarningShown": true
  })
' ~/.claude.json >~/.claude.json.tmp && mv ~/.claude.json.tmp ~/.claude.json

if [[ "${HERDR_ENV:-}" != 1 ]]; then
  echo "status=no_herdr worktree=$worktree"
  exit 0
fi

label="${branch//\//-}"
workspace_json=$(herdr worktree open --cwd "$repo_root" --path "$worktree" --label "$label" --no-focus)
workspace=$(jq -r '.result.workspace.workspace_id' <<<"$workspace_json")
pane=$(jq -r '.result.root_pane.pane_id' <<<"$workspace_json")
summary="worktree=$worktree workspace=$workspace pane=$pane"

if [[ -n "$pre_run" ]]; then
  # 入力した command 行も画面に残るため、目印は数字が続く形で照合する
  herdr pane run "$pane" "$pre_run; echo \"PRERUN_EXIT=\$?\"" >/dev/null
  matched=$(herdr pane wait-output "$pane" --regex 'PRERUN_EXIT=[0-9]+' --timeout 600000 |
    jq -r '.result.matched_line')
  code=$(grep -oE 'PRERUN_EXIT=[0-9]+' <<<"$matched" | tail -1)
  if [[ "${code#PRERUN_EXIT=}" != 0 ]]; then
    echo "status=pre_run_failed ${code} $summary"
    herdr pane read "$pane" --source recent-unwrapped --lines 20
    exit 1
  fi
fi

# agent 名は [a-z][a-z0-9_-]{0,31} に一致し、起動中の agent の中で一意である必要がある
base=$(tr '[:upper:]' '[:lower:]' <<<"$label" | tr -c 'a-z0-9_\n-' '-' | cut -c1-29)
[[ "$base" =~ ^[a-z] ]] || base="a$base"
agent="$base"
n=2
while herdr agent get "$agent" >/dev/null 2>&1; do
  agent="$base-$n"
  n=$((n + 1))
done
summary="$summary agent=$agent"

if ! herdr agent start "$agent" --kind claude --pane "$pane" --timeout 60000 \
  -- --permission-mode acceptEdits >/dev/null 2>&1; then
  echo "status=agent_not_ready $summary"
  herdr pane read "$pane" --source recent-unwrapped --lines 20
  exit 1
fi

# prompt は bracketed paste で送るため、terminal の 1 行入力の上限を受けない
herdr agent prompt "$agent" "$(cat "$prompt_file")" >/dev/null
echo "status=started $summary"
