{ ... }:
{
  homebrew = {
    enable = true;
    onActivation = {
      autoUpdate = true;
      upgrade = true;
      # Homebrew 7.x は `--cleanup` フラグを廃止しており、
      # nix-darwin の cleanup オプションは activation を失敗させる。
    };

    taps = [
      "708u/tap"
      "k1low/tap"
    ];

    brews = [
      "mas"
      "serverless"
      "aws-sam-cli"
      "ghz"
      "k1low/tap/tbls"
      "k1low/tap/tbls-ask"
    ];

    casks = [
      "alfred"
      "alt-tab"
      "android-studio"
      "appcleaner"
      "asana"
      "claude"
      "cmux"
      "chrome-remote-desktop-host"
      "cyberduck"
      "discord"
      "docker-desktop"
      "dropbox"
      "figma"
      "gather"
      "gcloud-cli"
      "ghostty"
      "google-chrome"
      "google-japanese-ime"
      "karabiner-elements"
      "ngrok"
      "notion"
      "obsidian"
      "orbstack"
      "postman"
      "raycast"
      "realvnc-connect-viewer"
      "session-manager-plugin"
      "tableplus"
      "visual-studio-code"
      "zoom"
    ];

    masApps = {
      Numbers = 409203825;
      LINE = 539883307;
      Slack = 803453959;
      Spark = 1176895641;
      Trello = 1278508951;
      Tailscale = 1475387142;
    };
  };
}
