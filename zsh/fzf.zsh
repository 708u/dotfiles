# fzf履歴検索
function select-history() {
 BUFFER=$(history -n -r 1 | fzf --no-sort +m --query "$LBUFFER" --prompt="History > ")
 CURSOR=$#BUFFER
}

co() {
  local branches branch
  branches=$(git branch -vv) &&
  branch=$(echo "$branches" | fzf +m) &&
  git checkout $(echo "$branch" | awk '{print $1}' | sed "s/.* //")
}

zle -N select-history
bindkey '^r' select-history

# pad nav display
zstyle ':fzf-tab:*' fzf-pad 100

# show dir tree
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'exa -T -L 2 --color=always $realpath --git-ignore'

# Enable multi select in tab completions using tab and shift tab
zstyle ':fzf-tab:complete:*' fzf-bindings 'space:toggle+down'

# env unset
zstyle ':fzf-tab:complete:(-command-|-parameter-|-brace-parameter-|export|unset|expand):*' \
	fzf-preview 'echo ${(P)word}'
