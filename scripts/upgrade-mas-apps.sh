#!/bin/bash
set -uo pipefail

# remote の接続が切れて端末が閉じても、Tailscale を接続し直すまで続ける
trap '' HUP

PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
user=${SUDO_USER:?sudo で実行する}
uid=$(id -u "$user")

# アプリの起動と終了はログイン中のユーザーの GUI セッションで行う必要がある
as_user() { launchctl asuser "$uid" sudo -u "$user" "$@"; }

connected() { [ "$(scutil --nc status Tailscale 2>/dev/null | head -n 1)" = Connected ]; }

wait_connected() {
  for _ in $(seq 60); do
    connected && return 0
    sleep 1
  done
  return 1
}

# 接続済みなら何もしない。
# 更新で network extension が入れ替わると、VPN の管理側が終了済みの extension を起動中とみなし、
# 接続中の状態から進まないことがある。いったん停止すると Tailscale が接続し直す
ensure_connected() {
  pgrep -xq Tailscale || as_user open -g -a Tailscale
  wait_connected && return 0
  scutil --nc stop Tailscale
  wait_connected && return 0
  scutil --nc start Tailscale
  wait_connected && return 0
  echo "Tailscale に接続できていない: $(scutil --nc status Tailscale | head -n 1)" >&2
  return 1
}

# 更新前に切断していたなら、更新後も接続しない
was_connected=false
connected && was_connected=true

status=0
outdated=$(mas outdated | grep -E '^ *[0-9]+ ' || true)
if [ -n "$outdated" ]; then
  # 起動中のアプリを更新すると App Store が終了の確認を画面に出して待つため、先に終了しておく
  if printf '%s\n' "$outdated" | grep -q ' Tailscale '; then
    as_user osascript -e 'quit app "Tailscale"'
  fi
  mas upgrade || status=$?
fi

if $was_connected; then
  ensure_connected || status=1
fi
exit "$status"
