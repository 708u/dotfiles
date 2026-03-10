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
}
