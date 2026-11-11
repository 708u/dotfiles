{ pkgs, ... }:
{
  programs.yazi = {
    enable = true;
    enableZshIntegration = false;
    # yazi は plugin API の破壊的変更が多いため、plugin も本体と同じ nixpkgs から入れて互換性を保つ
    plugins = {
      toggle-pane = pkgs.yaziPlugins.toggle-pane;
    };
  };
}
