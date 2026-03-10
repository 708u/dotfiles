{ pkgs, ... }:
{
  imports = [
    ./packages.nix
    ./git.nix
    ./mise.nix
    ./shell.nix
    ./symlinks.nix
  ];

  home.stateVersion = "24.11";
  programs.home-manager.enable = true;

  launchd.agents.mutagen = {
    enable = true;
    config = {
      Label = "io.mutagen.daemon";
      ProgramArguments = [
        "${pkgs.mutagen}/bin/mutagen"
        "daemon"
        "run"
      ];
      RunAtLoad = true;
      KeepAlive = true;
    };
  };
}
