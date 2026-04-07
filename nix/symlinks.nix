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
    ".claude/settings.json" = {
      source = mkSymlink ".config/claude/settings.json";
    };
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
    ".mutagen.yml" = {
      source = mkSymlink ".config/mutagen.yml";
    };
    ".ssh/config" = {
      source = mkSymlink ".config/ssh/config";
    };
  };
}
