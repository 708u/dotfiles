{ pkgs, username, hostname, ... }:
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
    sudo pmset -a sleep 0
    sudo pmset -a standby 0
    sudo pmset -a networkoversleep 1
  '';

  launchd.daemons.tailscaled = {
    serviceConfig = {
      Label = "com.tailscale.tailscaled";
      ProgramArguments = [
        "${pkgs.tailscale}/bin/tailscaled"
      ];
      RunAtLoad = true;
      KeepAlive = true;
      StandardOutPath = "/var/log/tailscaled.log";
      StandardErrorPath = "/var/log/tailscaled.log";
    };
  };
}
