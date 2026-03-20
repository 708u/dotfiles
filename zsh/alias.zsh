alias ...='../../'
alias ....='../../../'

alias ls='lsd'
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

# twig
twig-switch() {
  local _target=$(twig list -q | fzf)
  [ -n "$_target" ] && cd "$_target"
}

twig-cd() {
  local wt_path=$(twig add -q "$@")
  local ws_file=$(find "$wt_path" -maxdepth 1 -name "*.code-workspace" 2>/dev/null | head -1)
  if [ -n "$ws_file" ]; then
    code "$ws_file"
  else
    code "$wt_path"
  fi
}

twig-c() {
  local wt_path=$(twig add -q "$1")
  shift
  if [ $# -gt 0 ]; then
    echo "$*" > "$wt_path/.twig-claude-prompt"
  else
    touch "$wt_path/.twig-claude-prompt"
  fi
  local ws_file=$(find "$wt_path" -maxdepth 1 -name "*.code-workspace" 2>/dev/null | head -1)
  if [ -n "$ws_file" ]; then
    code "$ws_file"
  else
    code "$wt_path"
  fi
}

cdg() {
  local _cdg_selected
  _cdg_selected=$(ghq list | sort | fzf --preview "bat --style=numbers --color=always --line-range :500 $(ghq root)/{}/README.*") && cd "$(ghq root)/$_cdg_selected"
}
