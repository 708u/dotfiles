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

alias la='exa -a'
alias ll='exa -l'
alias lla='exa -la'

alias dtree='tree -d -I "vendor|node_modules" -N'
alias cdg='cd $(ghq root)/$(ghq list | sort | fzf --preview "bat --style=numbers --color=always --line-range :500 $(ghq root)/{}/README.*")'

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
