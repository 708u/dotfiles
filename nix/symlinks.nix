{ config, lib, pkgs, dotfilesDir, ... }:
let
  mkSymlink = path:
    config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/${path}";

  # flake の評価では git で追跡しているファイルだけが見えるため、
  # 新しい skill は git add してから apply するまで配置されない
  ownSkills = lib.filterAttrs (_: type: type == "directory")
    (builtins.readDir ../.config/claude/skills);

  # 本体を nix で入れているツールの skill は、本体と同じソースから配置して
  # バージョンを揃える
  externalSkills = {
    herdr = "${pkgs.herdr.src}/skills/herdr";
  };

  # 外部の skill や、ツールが書き込む skill (claude.ai からの同期など) を
  # リポジトリの外に置くため、~/.claude/skills はディレクトリごとリンクせず
  # skill ごとにリンクする
  skillFiles =
    lib.mapAttrs' (name: _:
      lib.nameValuePair ".claude/skills/${name}" {
        source = mkSymlink ".config/claude/skills/${name}";
      }) ownSkills
    // lib.mapAttrs' (name: src:
      lib.nameValuePair ".claude/skills/${name}" { source = src; }) externalSkills;
in
{
  xdg.configFile = {
    "karabiner" = {
      source = mkSymlink ".config/karabiner";
    };
    "ghostty" = {
      source = mkSymlink ".config/ghostty";
    };
    "gh/config.yml" = {
      source = mkSymlink ".config/gh/config.yml";
    };
    "zellij/config.kdl" = {
      source = mkSymlink ".config/zellij/config.kdl";
    };
    # ~/.config/herdr には socket や log も置かれるため、ディレクトリではなく
    # config.toml だけを symlink にする
    "herdr/config.toml" = {
      source = mkSymlink ".config/herdr/config.toml";
    };
  };

  home.file = {
    ".claude/CLAUDE.md" = {
      source = mkSymlink ".config/claude/CLAUDE.md";
    };
    # NOTE: .claude/settings.json は symlink 管理しない。Claude Code が
    # 一時ファイルの rename で書くため symlink がファイルごと消え、
    # 次の activation が clobber 検知で中断する
    ".claude/statusline.sh" = {
      source = mkSymlink ".config/claude/statusline.sh";
    };
    ".claude/agents" = {
      source = mkSymlink ".config/claude/agents";
    };
    ".claude/commands" = {
      source = mkSymlink ".config/claude/commands";
    };
    ".claude/output-styles" = {
      source = mkSymlink ".config/claude/output-styles";
    };
    ".claude/hooks" = {
      source = mkSymlink ".config/claude/hooks";
    };
    ".claude/textlint" = {
      source = mkSymlink ".config/claude/textlint";
    };
    ".mutagen.yml" = {
      source = mkSymlink ".config/mutagen.yml";
    };
  } // skillFiles;
}
