#!/bin/bash
set -euo pipefail

brew upgrade

# MAS のアプリの更新には root が必要で、Tailscale を更新する間は remote の接続が切れる。
# 接続が切れても Tailscale の再接続まで進むよう、残りは root の 1 プロセスで行う
sudo "$(dirname "$0")/upgrade-mas-apps.sh"
