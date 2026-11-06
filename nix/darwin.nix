{ username, hostname, ... }:
{
  imports = [
    ./homebrew.nix
    ./macos-defaults.nix
  ];

  nixpkgs.config.allowUnfree = true;

  # Determinate Nix が Nix 自体を管理するため無効化
  nix.enable = false;

  system.stateVersion = 6;
  system.primaryUser = username;

  users.users.${username} = {
    name = username;
    home = "/Users/${username}";
  };

  networking.hostName = hostname;
  networking.localHostName = hostname;

  security.pam.services.sudo_local.touchIdAuth = true;

  # SSH の認証は鍵のみとする。macOS のアップデートで /etc/ssh/sshd_config が
  # 戻されても維持されるよう、nix-darwin が管理する sshd_config.d に書く。
  # macOS の sshd は launchd が全インターフェイスで待ち受けるため、
  # AllowUsers で接続元を Tailscale が割り当てるアドレスの範囲に限る
  services.openssh = {
    enable = true;
    extraConfig = ''
      PasswordAuthentication no
      KbdInteractiveAuthentication no
      AllowUsers ${username}@100.64.0.0/10 ${username}@fd7a:115c:a1e0::/48
    '';
  };

  system.activationScripts.postActivation.text = ''
    # バッテリー: ディスプレイスリープ後にシステムもスリープ
    sudo pmset -b displaysleep 15
    sudo pmset -b sleep 30
    sudo pmset -b standby 1
    sudo pmset -b powernap 1
    sudo pmset -b networkoversleep 0

    # AC: ディスプレイのみスリープし、画面を消している間も処理を続ける
    sudo pmset -c displaysleep 15
    sudo pmset -c sleep 0
    sudo pmset -c standby 1
    sudo pmset -c powernap 0
    sudo pmset -c networkoversleep 0
  '';

}
