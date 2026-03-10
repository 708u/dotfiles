{ ... }:
{
  programs.git = {
    enable = true;

    ignores = [
      # VSCode
      ".vscode/*"
      "!.vscode/settings.json"
      "!.vscode/tasks.json"
      "!.vscode/launch.json"
      "!.vscode/extensions.json"
      "!.vscode/*.code-snippets"

      # Local History for Visual Studio Code
      ".history/"

      # Built Visual Studio Code Extensions
      "*.vsix"
      ".DS_Store"

      # twig
      "settings.local.toml"
      # Claude Code prompt file
      ".completed-twig-claude-prompt.sh"

      # Claude Code
      "**/.claude/settings.local.json"
      "**/CLAUDE.local.md"
    ];

    settings = {
      user = {
        name = "708u";
        email = "708.u.biz@gmail.com";
      };
      core = {
        editor = "vim";
        ignorecase = false;
      };
      fetch.prune = true;
      color.ui = true;
      merge.tool = "vimdiff";
      alias = {
        ps = "push";
        pl = "pull";
        s = "status";
        st = "stash";
        stp = "stash pop";
        aa = "add .";
        gr = "log --graph --date=short --decorate=short --pretty=format:'%Cgreen%h %Creset%cd %Cblue%cn %Cred%d %Creset%s'";
        gone = "!f() { git fetch --all --prune; git branch -vv | awk '/: gone]/{gsub(/^[\\* +]+/,\"\"); print $1}' | xargs git branch -D; }; f";
        mg = "merge";
        cm = "commit";
        co = "checkout";
        b = "branch -v";
      };
    };
  };
}
