{ lib, pkgs, ... }:
{
  imports = [
    ./packages.nix
    ./git.nix
    ./mise.nix
    ./shell.nix
    ./symlinks.nix
    ./yazi.nix
  ];

  home.stateVersion = "24.11";
  programs.home-manager.enable = true;

  # herdr が server の再起動後に Claude Code の会話を再開するには、hook で session ID を送る必要がある。
  # hook script と settings.json の hook は herdr が書き込み、内容が herdr のバージョンに依存するため、
  # 未導入のときに加えて、herdr の更新で古くなったときや hook が欠けたときも入れ直す
  home.activation.herdrClaudeIntegration = lib.hm.dag.entryAfter [ "linkGeneration" ] ''
    if ! ${pkgs.herdr}/bin/herdr integration status | grep -q '^claude: current '; then
      run ${pkgs.herdr}/bin/herdr integration install claude \
        || echo "herdr の Claude Code integration の install に失敗した" >&2
    fi
  '';

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
