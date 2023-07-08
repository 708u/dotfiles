autoload -Uz compinit && compinit
autoload -U +X bashcompinit && bashcompinit

# Load user defined completions
fpath=( $ZSH_CONF_DIR/zsh/completion "${fpath[@]}")

# if following error 'Ignore insecure directories and continue [y] or abort compinit [n]?' returned, exec it
# `chmod -R go-w /usr/local/share`
if type brew &>/dev/null; then
  fpath=($(brew --prefix)/share/zsh-completions "${fpath[@]}")
fi

# terraform completion
complete -o nospace -C /opt/homebrew/Cellar/tfenv/2.2.3/versions/1.2.2/terraform terraform

# for local completions
fpath=( $ZSH_CONF_DIR/zsh/completion/.local "${fpath[@]}")

## 補完で小文字でも大文字にマッチさせる
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}'

# ps コマンドのプロセス名補完
zstyle ':completion:*:processes' command 'ps x -o pid,s,args'

# ../ の後は今いるディレクトリを補完しない
zstyle ':completion:*' ignore-parents parent pwd ..

# sudo の後ろでコマンド名を補完する
zstyle ':completion:＊:sudo:＊' command-path /usr/local/sbin /usr/local/bin \
                  /usr/sbin /usr/bin /sbin /bin /usr/X11R6/bin

# complement make targets
zstyle ':completion:*:*:make:*' tag-order 'targets'
