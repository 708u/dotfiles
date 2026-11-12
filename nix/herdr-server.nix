{ lib, pkgs, username, ... }:
{
  # ターミナルで herdr を開かなくても、ログイン後は herdr のセッションと plugin が動いているようにする。
  # ログイン直後に GUI のセッションで server を起動しておかないと、リモートの herdr からの接続が
  # 先に SSH のセッションで server を起動し、その下の pane が login keychain を読めなくなる。
  # 別の herdr server がすでに動いていると、launchd が起動した方は socket が使用中のためすぐに終了し、
  # 動いている server には影響しない。plugin は server の環境で起動するため PATH を明示する
  launchd.user.agents.herdr-server.serviceConfig = {
    ProgramArguments = [ "${pkgs.herdr}/bin/herdr" "server" ];
    RunAtLoad = true;
    KeepAlive = true;
    ThrottleInterval = 30;
    ProcessType = "Interactive";
    EnvironmentVariables = {
      LANG = "ja_JP.UTF-8";
      SHELL = "/bin/zsh";
      PATH = lib.concatStringsSep ":" [
        "/etc/profiles/per-user/${username}/bin"
        "/run/current-system/sw/bin"
        "/nix/var/nix/profiles/default/bin"
        "/opt/homebrew/bin"
        "/usr/local/bin"
        "/usr/bin"
        "/bin"
        "/usr/sbin"
        "/sbin"
      ];
    };
    StandardErrorPath = "/Users/${username}/Library/Logs/herdr-server.log";
  };
}
