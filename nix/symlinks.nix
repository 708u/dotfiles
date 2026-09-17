{ config, dotfilesDir, ... }:
let
  mkSymlink = path:
    config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/${path}";
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
  };

  home.file = {
    ".claude/CLAUDE.md" = {
      source = mkSymlink ".config/claude/CLAUDE.md";
    };
    # NOTE: .claude/settings.json は symlink 管理しない。Claude Code が
    # 一時ファイルの rename で書くため symlink がファイルごと消え、
    # 次の activation が clobber 検知で中断する。dotfiles 側の
    # .config/claude/settings.json は追跡用のコピーとして残す
    ".claude/statusline.sh" = {
      source = mkSymlink ".config/claude/statusline.sh";
    };
    ".claude/agents" = {
      source = mkSymlink ".config/claude/agents";
    };
    ".claude/commands" = {
      source = mkSymlink ".config/claude/commands";
    };
    ".claude/skills" = {
      source = mkSymlink ".config/claude/skills";
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
};
}
