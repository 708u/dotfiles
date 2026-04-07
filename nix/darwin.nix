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

  system.activationScripts.postActivation.text = ''
    # バッテリー: macOS 標準 (スリープ有効)
    sudo pmset -b sleep 1
    sudo pmset -b standby 1
    sudo pmset -b powernap 1
    sudo pmset -b networkoversleep 0

    # AC: サーバー運用 (スリープ無効, ネットワーク維持)
    sudo pmset -c sleep 0
    sudo pmset -c standby 0
    sudo pmset -c powernap 1
    sudo pmset -c networkoversleep 1
  '';

}
