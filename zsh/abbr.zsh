# docker
abbr -f -q d='docker'
abbr -f -q dc='docker-compose' &>/dev/null
abbr -f -q dp='docker ps'
abbr -f -q dcs='docker-compose stop'
abbr -f -q docker-delete-all='docker-compose down --rmi all --volumes'
abbr -f -q docker-stats='docker stats --format "table {{.Container}}\t{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"'

# git
abbr -f -q g='git'
abbr -f -q gs='git status'
abbr -f -q gb='git branch -v'
abbr -f -q push='git push'
abbr -f -q pull='git pull'
abbr -f -q git-revert='git reset --hard && git clean -df'
abbr -f -q git-softreset='git reset --soft HEAD~1'
abbr -f -q hp='git push -u origin HEAD'

# tools
abbr -f -q j='just'
abbr -f -q tf='terraform'
abbr -f -q la='lsd -a'
abbr -f -q ll='lsd -l'
abbr -f -q lla='lsd -la'
abbr -f -q dtree='tree -d -I "vendor|node_modules" -N'
abbr -f -q tailscale='/Applications/Tailscale.app/Contents/MacOS/Tailscale'

# shell
abbr -f -q relogin='exec zsh -l'

# security
abbr -f -q ulk='security unlock-keychain ~/Library/Keychains/login.keychain-db'

# claude
abbr -f -q c='claude'
abbr -f -q cc='claude -c' &>/dev/null
abbr -f -q cr='claude --resume'
abbr -f -q cpl='claude --permission-mode plan'

# zsh-syntax-highlighting integration
# abbr を valid command と同じ色でハイライトする
(( ${#ABBR_REGULAR_USER_ABBREVIATIONS} )) && {
  ZSH_HIGHLIGHT_HIGHLIGHTERS+=(regexp)
  ZSH_HIGHLIGHT_REGEXP=('^[[:blank:][:space:]]*('${(j:|:)${(Qk)ABBR_REGULAR_USER_ABBREVIATIONS}}')$' fg=green)
}
(( ${#ABBR_GLOBAL_USER_ABBREVIATIONS} )) && {
  ZSH_HIGHLIGHT_REGEXP+=('[[:<:]]('${(j:|:)${(Qk)ABBR_GLOBAL_USER_ABBREVIATIONS}}')$' fg=green)
}
