#!/usr/bin/env bash
# worktree を作成し、herdr の workspace で Claude Code を起動して prompt を送る。
# 結果は status=... の 1 行で出力し、失敗時のみ画面の末尾を続けて出力する。
#
# usage: spawn.sh [--pre-run <command>] [--source <branch>] [--machine <label>] <branch> <prompt-file>
#
# --machine を指定すると、herdr machine に保存したマシンへ SSH で script と prompt を転送し、
# remote の同じパスにある repository でこの script を実行する。
# --remote-base は remote 側の実行で内部的に使う。
set -euo pipefail

pre_run=""
source_branch=""
machine=""
remote_base=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pre-run) pre_run="$2"; shift 2 ;;
    --source) source_branch="$2"; shift 2 ;;
    --machine) machine="$2"; shift 2 ;;
    --remote-base) remote_base="$2"; shift 2 ;;
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

if [[ -n "$machine" ]]; then
  target=$(herdr machine list --json | jq -r --arg m "$machine" \
    '.[] | select(.enabled and (.label == $m or .id == $m)) | .target' | head -1)
  if [[ -z "$target" ]]; then
    echo "status=error reason=machine_not_found machine=$machine"
    exit 1
  fi
  # remote でも ghq により $HOME からの相対パスが同じ位置に clone されている前提とする
  if [[ "$repo_root" != "$HOME"/* ]]; then
    echo "status=error reason=repo_outside_home path=$repo_root"
    exit 1
  fi
  rel="${repo_root#"$HOME"/}"
  base="${source_branch:-$(git symbolic-ref --short refs/remotes/origin/HEAD | sed 's|^origin/||')}"
  summary="machine=$machine"

  # remote の dotfiles が古くても手元と同じ処理になるよう、script 自体も転送する
  bundle=$(mktemp -d)
  cp "$0" "$bundle/spawn.sh"
  cp "$prompt_file" "$bundle/prompt.txt"
  remote_dir=$(tar -C "$bundle" -cf - spawn.sh prompt.txt |
    ssh -o BatchMode=yes "$target" 'd=$(mktemp -d); tar -xf - -C "$d"; echo "$d"')
  rm -rf "$bundle"

  args=(--remote-base "$base")
  [[ -n "$pre_run" ]] && args+=(--pre-run "$pre_run")
  args+=("$branch" "$remote_dir/prompt.txt")
  # remote の shell の設定で cd が一覧などを出力しても status 行に混ざらないよう捨てる
  remote_cmd="cd ~/$(printf %q "$rel") >/dev/null 2>&1 || { echo \"status=error reason=remote_repo_not_found path=~/$rel\"; exit 1; }"
  remote_cmd+="; HERDR_ENV=1 bash $remote_dir/spawn.sh $(printf '%q ' "${args[@]}"); code=\$?; rm -rf $remote_dir; exit \$code"

  # remote の status 行は remote 側の script が出力するため、ここでは失敗を ERR trap に渡さない
  trap - ERR
  set +e
  ssh -o BatchMode=yes "$target" "$remote_cmd" | sed "/^status=/s/\$/ machine=$machine/"
  exit "${PIPESTATUS[0]}"
fi

source_args=()
[[ -n "$source_branch" ]] && source_args=(--source "$source_branch")
if [[ -n "$remote_base" ]]; then
  git fetch -q origin "$remote_base"
fi
worktree=$(twig add "$branch" -q ${source_args[@]+"${source_args[@]}"})
summary="worktree=$worktree"
if [[ -n "$remote_base" ]]; then
  # twig は main worktree の HEAD から branch を作るため、取得した最新の base に合わせる
  git -C "$worktree" reset -q --keep "origin/$remote_base"
fi

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
# 呼び出し元とは独立した並列のタスクとして扱うため、worktree open で repository 配下に登録せず、単独の workspace にする
workspace_json=$(herdr workspace create --cwd "$worktree" --label "$label" --no-focus)
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
  -- --permission-mode auto >/dev/null 2>&1; then
  echo "status=agent_not_ready $summary"
  herdr pane read "$pane" --source recent-unwrapped --lines 20
  exit 1
fi

# prompt は bracketed paste で送るため、terminal の 1 行入力の上限を受けない
herdr agent prompt "$agent" "$(cat "$prompt_file")" >/dev/null
echo "status=started $summary"
