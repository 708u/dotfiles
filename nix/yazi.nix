{ pkgs, ... }:
{
  programs.yazi = {
    enable = true;
    enableZshIntegration = false;
    # yazi は plugin API の破壊的変更が多いため、plugin も本体と同じ nixpkgs から入れて互換性を保つ
    plugins = {
      piper = pkgs.yaziPlugins.piper;
      toggle-pane = pkgs.yaziPlugins.toggle-pane;
    };
    # プレビューでしか使わないため、PATH 全体ではなく yazi の wrapper の PATH にだけ入れる
    extraPackages = [ pkgs.glow ];
  };
}
