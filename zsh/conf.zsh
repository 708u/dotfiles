export LANG=ja_JP.UTF-8
export PAGER=less
export EDITOR=code

# メモリ上に保存する履歴のサイズ
HISTSIZE=100000

# 上述のファイルに保存する履歴のサイズ
SAVEHIST=1000000

# 色を使用出来るようにする
autoload -Uz colors && colors

# 日本語ファイル名を表示可能にする
setopt print_eight_bit

# beep を無効にする
setopt no_beep

# フローコントロールを無効にする
setopt no_flow_control

# Ctrl+Dでzshを終了しない
setopt ignore_eof

# ‘#’ 以降をコメントとして扱う
setopt interactive_comments

# ディレクトリ名だけでcdする
setopt auto_cd

#cd時にファイル全表示
function chpwd() { lsd }

# cd したら自動的にpushdする
setopt auto_pushd

# 重複したディレクトリを追加しない
setopt pushd_ignore_dups

# 同時に起動したzshの間でヒストリを共有する
setopt share_history

# 同じコマンドをヒストリに残さない
setopt hist_ignore_all_dups

# スペースから始まるコマンド行はヒストリに残さない
setopt hist_ignore_space

# ヒストリに保存するときに余分なスペースを削除する
setopt hist_reduce_blanks

# 高機能なワイルドカード展開を使用する
setopt extended_glob

export GOPATH="$HOME/go"
export PATH="$PATH:$GOPATH/bin"

# adb tools
export ANDROID_HOME=${HOME}/Library/Android/sdk
if [ -d "${ANDROID_HOME}" ]; then
  export PATH="${ANDROID_HOME}/bin:$PATH"
fi

export ANDROID_TOOL_PATH=${ANDROID_HOME}/platform-tools
if [ -d "${ANDROID_TOOL_PATH}" ]; then
  export PATH="${ANDROID_TOOL_PATH}:$PATH"
fi

export PATH="$PATH:$HOME/bin"
export PATH="$PATH:$HOME/.local/bin"
eval "$(anyenv init -)"

# zoxide
eval "$(zoxide init zsh)"
