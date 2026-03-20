# docker
abbr -S -q d='docker'
abbr -S -q -f dc='docker-compose'
abbr -S -q dp='docker ps'
abbr -S -q dcs='docker-compose stop'
abbr -S -q docker-delete-all='docker-compose down --rmi all --volumes'
abbr -S -q docker-stats='docker stats --format "table {{.Container}}\t{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"'

# git
abbr -S -q g='git'
abbr -S -q gs='git status'
abbr -S -q gb='git branch -v'
abbr -S -q push='git push'
abbr -S -q pull='git pull'
abbr -S -q git-revert='git reset --hard && git clean -df'
abbr -S -q git-softreset='git reset --soft HEAD~1'
abbr -S -q hp='git push -u origin HEAD'

# tools
abbr -S -q j='just'
abbr -S -q tf='terraform'
abbr -S -q la='lsd -a'
abbr -S -q ll='lsd -l'
abbr -S -q lla='lsd -la'
abbr -S -q dtree='tree -d -I "vendor|node_modules" -N'
abbr -S -q tailscale='/Applications/Tailscale.app/Contents/MacOS/Tailscale'

# shell
abbr -S -q relogin='exec zsh -l'

# claude
abbr -S -q c='claude'
abbr -S -q cplan='claude --permission-mode plan --effort max'
