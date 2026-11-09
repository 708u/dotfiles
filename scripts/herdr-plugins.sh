#!/bin/bash
set -euo pipefail

# herdr の plugin は nix の管理外のため、未導入のものだけを install する。
# 導入済みの plugin は更新しない。pin する commit を変えた場合は、
# 該当の machine で herdr plugin uninstall してから再実行する

if ! command -v herdr >/dev/null; then
  echo "herdr が見つからないため plugin の install を省略する" >&2
  exit 0
fi

if ! installed=$(herdr plugin list 2>/dev/null); then
  echo "herdr plugin list に失敗したため plugin の install を省略する" >&2
  exit 0
fi

# install_plugin <plugin id> <owner/repo[/subdir]> <commit> [起動する action]
# 導入直後は常駐プロセスが起動しないため、常駐プロセスを持つ plugin は
# 指定した action で起動する
install_plugin() {
  local id=$1 repo=$2 commit=$3 start_action=${4:-}
  if grep -q "^- ${id} " <<<"$installed"; then
    echo "${id} は導入済み"
    return
  fi
  herdr plugin install "$repo" --ref "$commit" -y
  if [[ -n $start_action ]]; then
    herdr plugin action invoke "$start_action" >/dev/null
  fi
}

install_plugin herdr.auto-title kryptamine/herdr-auto-title \
  d8603171bde954fa2db57bf6013c548daa6f58c1 herdr.auto-title.restart

install_plugin furkankly.zoetrope furkankly/zoetrope/herdr-plugin \
  b1f31dd26bd4e9e513885e39edb78d0850a5d1fe
