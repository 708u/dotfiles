# 少し凝った zshrc
# License : MIT
# http://mollifier.mit-license.org/

########################################
# 環境変数
export LANG=ja_JP.UTF-8

export PAGER=less

# zcompletihons 設定
# /usr/local/share/zsh-completions内のシンボリックリンクを以下ディレクトリへコピーした
if [ -e ~/.zsh/completions ]; then
 fpath=(~/.zsh/completions $fpath)
fi

source '/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.zsh.inc'
source '/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/completion.zsh.inc'

# fzf 読み込み
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
export FZF_DEFAULT_OPTS='--reverse'

# anyenv inti
eval "$(anyenv init -)"

# Go settings
export GOENV_ROOT="$HOME/ghq/github.com/syndbg/goenv"
export PATH="$GOENV_ROOT/bin:$PATH"
export PATH="$GOROOT/bin:$PATH"
export PATH="$PATH:$GOPATH/bin"

eval "$(goenv init -)"

# 色を使用出来るようにする
autoload -Uz colors
colors

# emacs 風キーバインドにする
bindkey -e

# ヒストリの設定
HISTFILE=~/.zsh_history
HISTSIZE=1000000
SAVEHIST=1000000

# プロンプト
# 1行表示
# PROMPT=“%~ %# ”
# 2行表示
PROMPT="%F{049}[%D{%m/%d %T} %m]%f %~
> %"


# 単語の区切り文字を指定する
autoload -Uz select-word-style
select-word-style default
# ここで指定した文字は単語区切りとみなされる
# / も区切りと扱うので、^W でディレクトリ１つ分を削除できる
zstyle ':zle:*' word-chars " /=;@:{},|"
zstyle ':zle:*' word-style unspecified

########################################
# 補完
# 補完機能を有効にする
autoload -Uz compinit
compinit

# 補完で小文字でも大文字にマッチさせる
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}'

# ../ の後は今いるディレクトリを補完しない
zstyle ':completion:*' ignore-parents parent pwd ..

# sudo の後ろでコマンド名を補完する
zstyle ':completion:＊:sudo:＊' command-path /usr/local/sbin /usr/local/bin \
                  /usr/sbin /usr/bin /sbin /bin /usr/X11R6/bin

# ps コマンドのプロセス名補完
zstyle ':completion:*:processes' command 'ps x -o pid,s,args'

# 選択中の候補背景を塗りつぶす
zstyle ':completion:*' list-colors ${(s.:.)LS_COLORS}
zstyle ':completion:*' menu select=2

zstyle ':completion:*' list-separator ':'

########################################
# vcs_info
autoload -Uz vcs_info
autoload -Uz add-zsh-hook

zstyle ':vcs_info:*' formats '%F{yellow} Branch: %b%f'
zstyle ':vcs_info:*' actionformats '%F{red}(%s)-[%b|%a]%f'

function _update_vcs_info_msg() {
   LANG=en_US.UTF-8 vcs_info
   RPROMPT="${vcs_info_msg_0_}"
}
add-zsh-hook precmd _update_vcs_info_msg


########################################
# オプション
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
function chpwd() { ls }

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

# ########################################
# キーバインド

# ^R で履歴検索をするときに * でワイルドカードを使用出来るようにする
# bindkey ‘^R’ history-incremental-pattern-search-backward

# fzf履歴検索
function select-history() {
 BUFFER=$(history -n -r 1 | fzf --no-sort +m --query "$LBUFFER" --prompt="History > ")
 CURSOR=$#BUFFER
}
zle -N select-history
bindkey '^r' select-history


# ########################################
# エイリアス

alias ...='../../'
alias ....='../../../'

alias d='docker'
alias dc='docker-compose'
alias dp='docker ps'
alias dcs='docker-compose stop'
alias docker-delete-all='docker-compose down --rmi all --volumes'

alias g='git'
alias gs='git status'
alias gb='git branch -v'
alias push='git push'
alias pull='git pull'
alias git-revert="git reset --hard && git clean -df"
alias git-softreset="git resett --soft HEAD{1}"
alias la='ls -a'
alias ll='ls -l'
alias lla='ls -la'

alias art='php artisan'
alias pu='./vender/bin/phpunit'

alias dtree='tree -d -I "vendor|node_modules" -N'
alias cdg='cd $(ghq root)/$(ghq list | sort | fzf)'
alias gcd='ghq get -look `ghq list |fzf --preview "bat --color=always --style=header,grid --line-range :80 $(ghq root)/{}/README.*"`'

alias rm='rm -i'
alias cp='cp -i'
alias mv='mv -i'

alias mkdir='mkdir -p'

# sudo の後のコマンドでエイリアスを有効にする
alias sudo='sudo '

# グローバルエイリアス
alias -g L='| less'
alias -g G='| grep'
alias grep='grep --color=auto'

# C で標準出力をクリップボードにコピーする
# mollifier delta blog : http://mollifier.hatenablog.com/entry/20100317/p1
if which pbcopy >/dev/null 2>&1 ; then
   # Mac
   alias -g C='| pbcopy'
elif which xsel >/dev/null 2>&1 ; then
   # Linux
   alias -g C='| xsel --input --clipboard'
elif which putclip >/dev/null 2>&1 ; then
   # Cygwin
   alias -g C='| putclip'
fi



########################################
# OS 別の設定
case ${OSTYPE} in
   darwin*)
       #Mac用の設定
       export CLICOLOR=1
       alias ls='ls -G -F'
       ;;
   linux*)
       #Linux用の設定
       alias ls='ls -F --color=auto'
       ;;
esac

# vim:set ft=zsh:
