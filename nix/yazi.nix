{ pkgs, ... }:
let
  # glow にはコードブロックの chroma formatter を指定する手段がなく、テーマの色を 256 色に丸めて出力する。
  # 指定した色のまま表示するため、renderer に true color の formatter を渡すよう patch する
  # TUI でファイルを開くと、端末の幅を受け取った際の再描画が空の本文で行われ、画面が空になる。
  # 上流の未リリースの修正と同様に、開いた時点で本文を読み込んでおく
  glow = pkgs.glow.overrideAttrs (old: {
    postPatch = (old.postPatch or "") + ''
      substituteInPlace main.go ui/pager.go \
        --replace-fail 'glamour.WithWordWrap(' 'glamour.WithChromaFormatter("terminal16m"), glamour.WithWordWrap('
      substituteInPlace ui/ui.go \
        --replace-fail 'Modtime:   info.ModTime(),' 'Modtime: info.ModTime(), Body: func() string { b, _ := os.ReadFile(path); return string(utils.RemoveFrontmatter(b)) }(),'
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
