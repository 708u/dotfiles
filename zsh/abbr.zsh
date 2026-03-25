# docker
abbr -q d='docker'
abbr -q -f dc='docker-compose'
abbr -q dp='docker ps'
abbr -q dcs='docker-compose stop'
abbr -q docker-delete-all='docker-compose down --rmi all --volumes'
abbr -q docker-stats='docker stats --format "table {{.Container}}\t{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"'

# git
abbr -q g='git'
abbr -q gs='git status'
abbr -q gb='git branch -v'
abbr -q push='git push'
abbr -q pull='git pull'
abbr -q git-revert='git reset --hard && git clean -df'
abbr -q git-softreset='git reset --soft HEAD~1'
abbr -q hp='git push -u origin HEAD'

# tools
abbr -q j='just'
abbr -q tf='terraform'
abbr -q la='lsd -a'
abbr -q ll='lsd -l'
abbr -q lla='lsd -la'
abbr -q dtree='tree -d -I "vendor|node_modules" -N'
abbr -q tailscale='/Applications/Tailscale.app/Contents/MacOS/Tailscale'

# shell
abbr -q relogin='exec zsh -l'

# security
abbr -q ulk='security unlock-keychain ~/Library/Keychains/login.keychain-db'

# claude
abbr -q c='claude'
abbr -q -f cc='claude -c'
abbr -q cplan='claude --permission-mode plan --effort max'

# zsh-syntax-highlighting integration
# abbr を valid command と同じ色でハイライトする
(( ${#ABBR_REGULAR_USER_ABBREVIATIONS} )) && {
  ZSH_HIGHLIGHT_HIGHLIGHTERS+=(regexp)
  ZSH_HIGHLIGHT_REGEXP=('^[[:blank:][:space:]]*('${(j:|:)${(Qk)ABBR_REGULAR_USER_ABBREVIATIONS}}')$' fg=green)
}
(( ${#ABBR_GLOBAL_USER_ABBREVIATIONS} )) && {
  ZSH_HIGHLIGHT_REGEXP+=('[[:<:]]('${(j:|:)${(Qk)ABBR_GLOBAL_USER_ABBREVIATIONS}}')$' fg=green)
}
