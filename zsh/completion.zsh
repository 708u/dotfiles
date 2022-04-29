# Load user defined completions
fpath=( $ZSH_CONF_DIR/zsh/completion "${fpath[@]}")

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

autoload -Uz compinit && compinit
