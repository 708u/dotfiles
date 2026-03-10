{ ... }:
{
  homebrew = {
    enable = true;
    onActivation = {
      autoUpdate = true;
      upgrade = true;
      cleanup = "zap";
    };

    taps = [
      "708u/tap"
      "qmk/qmk"
      "k1low/tap"
      "stripe/stripe-cli"
    ];

    brews = [
      "ansible"
      "docutils"
      "gobject-introspection"
      "libpng"
      "mas"
      "qmk/qmk/qmk"
      "qmmp"
      "serverless"
      "stripe/stripe-cli/stripe"
      "k1low/tap/tbls"
      "k1low/tap/tbls-ask"
    ];

    casks = [
      "alfred"
      "alt-tab"
      "android-studio"
      "appcleaner"
      "asana"
      "bettertouchtool"
      "cmux"
      "cyberduck"
      "discord"
      "docker-desktop"
      "dropbox"
      "elgato-wave-link"
      "figma"
      "gcloud-cli"
      "ghostty"
      "google-chrome"
      "google-japanese-ime"
      "goreleaser"
      "iterm2"
      "karabiner-elements"
      "ngrok"
      "notion"
      "obsidian"
      "orbstack"
      "postman"
      "raycast"
      "tableplus"
      "twig"
      "vagrant"
      "visual-studio-code"
      "vnc-viewer"
      "warp"
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
