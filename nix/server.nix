{ lib, pkgs, username, ... }:
{
  # ターミナルで herdr を開かなくても、ログイン後は herdr のセッションと plugin が動いているようにする。
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

  # このマシンは手元のマシンから remote で操作するため、シェルが OSC 11 を出して既定の背景色を変え、
  # 手元のマシンの端末と見分けられるようにする。既定色へ戻すプログラムもあるため precmd で出し直す。
  # ssh で直接つないだ端末では色が切断後も window に残るため、シェルの終了時に OSC 111 で既定色へ戻す
  home-manager.users.${username}.programs.zsh.initContent = ''
    _server_background() { printf '\e]11;#1e3034\e\\' }
    _server_background_reset() { printf '\e]111\e\\' }
    autoload -Uz add-zsh-hook
    add-zsh-hook precmd _server_background
    add-zsh-hook zshexit _server_background_reset
  '';

  # 更新のためにアプリを終了するパッケージがあり、remote 接続に使う Tailscale も終了したまま戻らないことがある。
  # このマシンは常に remote で操作するため、apply では既存のパッケージを更新せず、未導入のものの追加だけを行う。
  # NOTE: 更新は Makefile の UPGRADE_PACKAGES=1 で行い、Tailscale の再接続まで確認する
  homebrew.onActivation.upgrade = lib.mkForce false;

  # 充電上限の制御は root の daemon が必要で、brew bundle の start_service では
  # 起動できないため、初回のみ手動で sudo brew services start batt && batt limit 80
  homebrew.brews = [ "batt" ];

  # Claude Code を常時稼働させるため、電源や蓋の状態に関係なくスリープさせない。
  # スリープ以外は消費電力を抑える側に寄せる
  system.activationScripts.postActivation.text = ''
    sudo pmset -a sleep 0
    sudo pmset -a disablesleep 1
    sudo pmset -a displaysleep 30
    sudo pmset -a powernap 0
    sudo pmset -a lowpowermode 1
  '';
}
