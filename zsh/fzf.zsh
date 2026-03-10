export FZF_DEFAULT_OPTS='--reverse'
export FZF_DEFAULT_COMMAND='fd --type f'

# fzf shell integration (completion + key bindings)
if command -v fzf >/dev/null 2>&1; then
  eval "$(fzf --zsh 2>/dev/null)" || {
    local fzf_share="$(fzf-share 2>/dev/null)"
    [[ -f "$fzf_share/completion.zsh" ]] && source "$fzf_share/completion.zsh"
    [[ -f "$fzf_share/key-bindings.zsh" ]] && source "$fzf_share/key-bindings.zsh"
  }
fi

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
