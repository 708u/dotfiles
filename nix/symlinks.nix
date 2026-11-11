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
    "herdr/open-workspace.sh" = {
      source = mkSymlink ".config/herdr/open-workspace.sh";
    };
    # ~/.config/yazi/plugins には home-manager が plugin を配置するため、
    # ~/.config/yazi をディレクトリごとリンクせず、設定ファイルと自作の plugin ごとに symlink にする
    "yazi/keymap.toml" = {
      source = mkSymlink ".config/yazi/keymap.toml";
    };
    "yazi/yazi.toml" = {
      source = mkSymlink ".config/yazi/yazi.toml";
    };
    "yazi/plugins/send-to-agent.yazi" = {
      source = mkSymlink ".config/yazi/plugins/send-to-agent.yazi";
    };
    "glow/ayu-mirage.json" = {
      source = mkSymlink ".config/glow/ayu-mirage.json";
    };
    # 手動で付けた名前の記録 (manual-names.json) も同じディレクトリに書き込まれるため、
    # ディレクトリではなく config.env だけを symlink にする
    "herdr-auto-title/config.env" = {
      source = mkSymlink ".config/herdr-auto-title/config.env";
    };
  };

  home.file = {
    # Claude Code は AGENTS.md を project の指示としてのみ読み込むため、
    # user 単位の指示は CLAUDE.md の名前で配置する
    ".claude/CLAUDE.md" = {
      source = mkSymlink ".config/claude/AGENTS.md";
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
