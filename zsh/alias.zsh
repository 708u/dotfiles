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
alias hpush="git push -u origin HEAD"
alias docker-stats="docker stats --format "table {{.Container}}\t{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}""

alias ls='lsd'
alias la='lsd -a'
alias ll='lsd -l'
alias lla='lsd -la'
alias j='just'
alias tf='terraform'

alias relogin='exec zsh -l'

alias dtree='tree -d -I "vendor|node_modules" -N'
cdg() {
  local _cdg_selected
  _cdg_selected=$(ghq list | sort | fzf --preview "bat --style=numbers --color=always --line-range :500 $(ghq root)/{}/README.*") && cd "$(ghq root)/$_cdg_selected"
}

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

alias c="claude"
alias tailscale="/Applications/Tailscale.app/Contents/MacOS/Tailscale"

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
