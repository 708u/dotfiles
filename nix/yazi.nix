{ pkgs, ... }:
let
  # glow にはコードブロックの chroma formatter を指定する手段がなく、テーマの色を 256 色に丸めて出力する。
  # 指定した色のまま表示するため、renderer に true color の formatter を渡すよう patch する
  glow = pkgs.glow.overrideAttrs (old: {
    postPatch = (old.postPatch or "") + ''
      substituteInPlace main.go ui/pager.go \
        --replace-fail 'glamour.WithWordWrap(' 'glamour.WithChromaFormatter("terminal16m"), glamour.WithWordWrap('
    '';
  });
in
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
    extraPackages = [ glow ];
  };
}
