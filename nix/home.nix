{ pkgs, ... }:
{
  imports = [
    ./packages.nix
    ./git.nix
    ./mise.nix
    ./shell.nix
  ];

  home.stateVersion = "24.11";
  programs.home-manager.enable = true;
}
