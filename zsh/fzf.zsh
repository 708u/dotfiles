# Setup fzf
# ---------
if [[ ! "$PATH" == */usr/local/opt/fzf/bin* ]]; then
  export PATH="${PATH:+${PATH}:}/usr/local/opt/fzf/bin"
fi

export FZF_DEFAULT_OPTS='--reverse'
export FZF_DEFAULT_COMMAND='fd --type f'

# Auto-completion
# ---------------
[[ $- == *i* ]] && source "/usr/local/opt/fzf/shell/completion.zsh" 2> /dev/null

# Key bindings
# ------------
source "/usr/local/opt/fzf/shell/key-bindings.zsh"

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
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'exa -T -L 2 --color=always $realpath --long --git-ignore'

# env unset
zstyle ':fzf-tab:complete:(-command-|-parameter-|-brace-parameter-|export|unset|expand):*' \
	fzf-preview 'echo ${(P)word}'
