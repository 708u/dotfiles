#!/usr/bin/env bash
# 現在のディレクトリか ghq で管理している repository を選んで、新しい workspace を作る。
# 作成先は表示中の machine (この script を実行している herdr server) を既定とし、
# tab で herdr machine に保存した machine へ順に切り替える。
#
# 既存の workspace への移動は workspace picker と goto に任せ、ここでは常に新しく作る。
# 別の machine に作ったときは client の表示を移せないため、作成したことを通知する。
#
# usage: open-workspace.sh
#        open-workspace.sh list <state-file>   fzf の候補を出力する
#        open-workspace.sh next <state-file>   作成先を次の machine に進める
#        open-workspace.sh prompt <state-file> fzf の prompt を出力する
#
# state-file には作成先の machine の label を 1 行で保存する。空は表示中の machine を表す。
set -uo pipefail

herdr_bin=${HERDR_BIN_PATH:-herdr}
tab=$'\t'

# 指定した machine に向けて herdr の API を呼ぶ。空のときは表示中の machine に向ける。
herdr_at() {
  local machine=$1
  shift
  if [[ -n $machine ]]; then
    "$herdr_bin" --machine "$machine" "$@"
  else
    "$herdr_bin" "$@"
  fi
}

machines() {
  "$herdr_bin" machine list --json | jq -r '.[] | select(.enabled) | .label'
}

# repository の絶対パスと ghq list の名前を tab 区切りで出力する。
# ghq root 配下に置いた linked worktree も ghq list に出るため、.git がディレクトリのものだけを出す。
# remote でも実行するため、展開は実行する側の shell に任せる。
# shellcheck disable=SC2016
repos_script='root=$(ghq root) && ghq list | while IFS= read -r r; do if [ -d "$root/$r/.git" ]; then printf "%s\t%s\n" "$root/$r" "$r"; fi; done'

repos() {
  local machine=$1 target out
  if [[ -z $machine ]]; then
    sh -c "$repos_script"
    return
  fi
  target=$("$herdr_bin" machine list --json | jq -r --arg m "$machine" '.[] | select(.label == $m) | .target' | head -1)
  [[ -n $target ]] || return 1
  # remote の shell の設定によって端末の制御文字が出力に混ざるため、先頭で改行して
  # 制御文字を別の行に分け、パスで始まる行だけを残す。
  out=$(ssh -o BatchMode=yes -o ConnectTimeout=5 "$target" "printf '\n'; $repos_script" 2>/dev/null) || return 1
  grep '^/' <<<"$out" || true
}

# 現在のディレクトリが属する repository の ghq list の名前を出力する。
# linked worktree や subdirectory でも元の repository の名前にする。
cwd_repo() {
  local common root dir
  common=$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || return 0
  root=$(ghq root)
  dir=${common%/.git}
  case "$dir" in ("$root"/*) printf '%s\n' "${dir#"$root"/}" ;; esac
}

# 種別、パス、表示の 3 列を tab 区切りで出力する。fzf には表示の列だけを見せる。
# 表示中の machine では現在のディレクトリを先頭に置く。
# 別の machine では、現在のディレクトリと同じ repository を先頭に置き、enter だけで選べるようにする。
list() {
  local machine=$1 all pin="" path name
  if [[ -z $machine ]]; then
    printf 'cwd\t%s\t+ %s\n' "$cwd" "$cwd"
  else
    pin=$(cwd_repo)
  fi
  if ! all=$(repos "$machine"); then
    printf 'error\t\t! %s に接続できない\n' "$machine"
    return
  fi
  [[ -n $all ]] || return 0
  while IFS="$tab" read -r path name; do
    [[ -n $pin && $name == "$pin" ]] && printf 'repo\t%s\t  %s\n' "$path" "$name"
  done <<<"$all"
  while IFS="$tab" read -r path name; do
    [[ -n $pin && $name == "$pin" ]] || printf 'repo\t%s\t  %s\n' "$path" "$name"
  done <<<"$all"
}

next() {
  local state=$1 current found="" m
  local candidates=("")
  current=$(cat "$state")
  # 表示中の machine を表す空の値を先頭に置き、末尾の次は先頭に戻す。
  while IFS= read -r m; do
    candidates+=("$m")
  done < <(machines)
  for m in "${candidates[@]}"; do
    if [[ -n $found ]]; then
      printf '%s\n' "$m" >"$state"
      return
    fi
    [[ $m == "$current" ]] && found=1
  done
  : >"$state"
}

# 表示中の machine には herdr machine の label が無く、Local と呼ぶと server で実行したときに
# 手元のマシンと紛らわしいため、hostname で示す。
prompt() {
  local machine
  machine=$(cat "$1")
  printf '%s workspace> ' "${machine:-$(hostname -s)}"
}

cwd=${HERDR_ACTIVE_PANE_CWD:-$PWD}

case "${1:-}" in
  list) list "$(cat "$2")"; exit ;;
  next) next "$2"; exit ;;
  prompt) prompt "$2"; exit ;;
esac

state=$(mktemp)
trap 'rm -f "$state"' EXIT
self=$(cd "$(dirname "$0")" && pwd)/$(basename "$0")

while :; do
  # 接続できない行を選んだときは、選んでいた machine の候補を出し直す。
  machine=$(cat "$state")
  out=$(list "$machine" | fzf --prompt "$(prompt "$state")" --delimiter '\t' --with-nth 3 --tiebreak index \
    --bind "tab:execute-silent('$self' next '$state')+reload('$self' list '$state')+transform-prompt('$self' prompt '$state')" \
    --header 'enter: 新しく作る / tab: 作成先の machine を切り替える') || exit 0
  machine=$(cat "$state")
  kind=$(cut -f1 <<<"$out")
  dir=$(cut -f2 <<<"$out")
  [[ $kind == error ]] || break
done
# 以降は exec で終わり EXIT の trap が実行されないため、ここで消す。
rm -f "$state"
[[ -n $dir ]] || exit 0
label=$(basename "$dir")

if [[ -z $machine ]]; then
  exec "$herdr_bin" workspace create --cwd "$dir" --label "$label" --focus
fi
herdr_at "$machine" workspace create --cwd "$dir" --label "$label" --focus >/dev/null || exit 1
exec "$herdr_bin" notification show "$machine に $label を作成した" --body 'goto で移動できる'
