# Load user defined completions
fpath=( $ZSH_CONF_DIR/zsh/completion "${fpath[@]}")

# for local completions
fpath=( $ZSH_CONF_DIR/zsh/completion/.local "${fpath[@]}")

autoload -Uz compinit && compinit
