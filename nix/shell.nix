{ dotfilesDir, lib, ... }:
{
  programs.zsh = {
    enable = true;

    profileExtra = ''
      source ~/.orbstack/shell/init.zsh 2>/dev/null || :
    '';

    initContent = lib.mkMerge [
      (lib.mkBefore ''
        export PATH="/etc/profiles/per-user/$USER/bin:$PATH"

        # herdr の server が SSH のセッションで起動されたことに気づけるよう、pane が login keychain を読めないときに警告する。
        # p10k の instant prompt を読み込んだ後にコンソールへ出力すると p10k が警告を出すため、instant prompt より前に判定して表示する
        if [[ $HERDR_ENV == 1 ]] && ! /usr/bin/security show-keychain-info "$HOME/Library/Keychains/login.keychain-db" &>/dev/null; then
            print -P "%F{yellow}login keychain を読めないため、gh や envchain が失敗します。herdr の server が SSH のセッションで起動された可能性があります。%f" >&2
            print -P "%F{yellow}復旧: リモート側で herdr machine disable を実行して自動接続を止め、herdr server stop の後に GUI のターミナルで herdr を起動し直してください。%f" >&2
        fi
      '')
      ''
        ZSH_CONF_DIR=${dotfilesDir}

        ### Added by Zinit's installer
        if [[ ! -f $HOME/.local/share/zinit/zinit.git/zinit.zsh ]]; then
            print -P "%F{33} %F{220}Installing %F{33}ZDHARMA-CONTINUUM%F{220} Initiative Plugin Manager (%F{33}zdharma-continuum/zinit%F{220})…%f"
            command mkdir -p "$HOME/.local/share/zinit" && command chmod g-rwX "$HOME/.local/share/zinit"
            command git clone https://github.com/zdharma-continuum/zinit "$HOME/.local/share/zinit/zinit.git" && \
                print -P "%F{33} %F{34}Installation successful.%f%b" || \
                print -P "%F{160} The clone has failed.%f%b"
        fi

        source "$HOME/.local/share/zinit/zinit.git/zinit.zsh"
        autoload -Uz _zinit
        (( ''${+_comps} )) && _comps[zinit]=_zinit

        # Load a few important annexes, without Turbo
        zinit light-mode for \
            zdharma-continuum/zinit-annex-as-monitor \
            zdharma-continuum/zinit-annex-bin-gem-node \
            zdharma-continuum/zinit-annex-patch-dl \
            zdharma-continuum/zinit-annex-rust

        ### End of Zinit's installer chunk

        # Load local config
        if [ -f $ZSH_CONF_DIR/zsh/.local.zsh ]; then
            source $ZSH_CONF_DIR/zsh/.local.zsh
        fi

        # Load zsh configs
        source $ZSH_CONF_DIR/zsh/alias.zsh
        source $ZSH_CONF_DIR/zsh/conf.zsh
        source $ZSH_CONF_DIR/zsh/completion.zsh
        source $ZSH_CONF_DIR/zsh/plugin.zsh
        source $ZSH_CONF_DIR/zsh/abbr.zsh
        source $ZSH_CONF_DIR/zsh/p10k.zsh
        source $ZSH_CONF_DIR/zsh/fzf.zsh
      ''
    ];
  };

  programs.direnv = {
    enable = true;
    nix-direnv.enable = true;
  };

  programs.fzf = {
    enable = true;
    enableZshIntegration = true;
    defaultCommand = "fd --type f";
    defaultOptions = [ "--reverse" ];
  };

  programs.zoxide = {
    enable = true;
  };

  home.sessionVariables = {
    LANG = "ja_JP.UTF-8";
    PAGER = "less";
    EDITOR = "code";
    GOPATH = "$HOME/go";
    PNPM_HOME = "$HOME/Library/pnpm";
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
    # Aikido Device Protection は node 向けにこの export を ~/.zshrc へ追記する設計だが、
    # home-manager 管理の ~/.zshrc は /nix/store への symlink で書き込みを拒否されるため、
    # 未設定のままだと node / npm が Aikido の MITM 証明書を検証できず TLS エラーになる
    NODE_EXTRA_CA_CERTS = "/Library/Application Support/AikidoSecurity/EndpointProtection/run/endpoint-protection-node-combined-ca.pem";
  };

  home.sessionPath = [
    "/opt/homebrew/bin"
    "/opt/homebrew/sbin"
    "$GOPATH/bin"
    "$HOME/bin"
    "$HOME/.local/bin"
    "$PNPM_HOME"
  ];
}
