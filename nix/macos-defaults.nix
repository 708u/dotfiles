{ ... }:
{
  system.defaults = {
    # ダークテーマ
    NSGlobalDomain.AppleInterfaceStyle = "Dark";

    # ウィンドウ
    NSGlobalDomain.AppleShowScrollBars = "WhenScrolling";

    # キーボード
    NSGlobalDomain.InitialKeyRepeat = 15;
    NSGlobalDomain.KeyRepeat = 1;
    NSGlobalDomain."com.apple.keyboard.fnState" = true;

    # トラックパッド
    NSGlobalDomain."com.apple.trackpad.enableSecondaryClick" =
      true;
    NSGlobalDomain."com.apple.trackpad.scaling" = 3.0;
    NSGlobalDomain."com.apple.mouse.tapBehavior" = 1;
    trackpad.TrackpadCornerSecondaryClick = 2;
    trackpad.Clicking = true;

    # すべての拡張子を表示
    NSGlobalDomain.AppleShowAllExtensions = true;

    # Dock
    dock.autohide = true;
    dock.autohide-delay = 0.0;
    dock.tilesize = 55;
    dock.largesize = 128;
    dock.orientation = "right";
    dock.wvous-br-corner = 14;

    # Finder
    finder.AppleShowAllFiles = true;
    finder.ShowStatusBar = true;
    finder.ShowPathbar = true;
    finder.AppleShowAllExtensions = true;
    finder.FXPreferredViewStyle = "Nlsv";

    # スクリーンショット
    screencapture.location = "~/Documents/screenshots";

    # メニューバー時計
    menuExtraClock.Show24Hour = true;
    menuExtraClock.ShowSeconds = true;
    menuExtraClock.ShowDate = 0;

    # ウィンドウマネージャ
    WindowManager.EnableTiledWindowMargins = false;
    WindowManager.HideDesktop = true;

    # nix-darwin に専用オプションがない設定
    CustomUserPreferences = {
      "com.apple.finder" = {
        FinderSounds = false;
      };
      "com.apple.trackpad" = {
        scaling = 24;
      };
      "com.apple.AppleMultitouchTrackpad" = {
        TrackpadRightClick = false;
      };
      NSGlobalDomain = {
        AppleAccentColor = 1;
        AppleHighlightColor =
          "1.000000 0.874510 0.701961 Orange";
        AppleMiniaturizeOnDoubleClick = false;
        "com.apple.trackpad.trackpadCornerClickBehavior" = 1;
      };
    };
  };

  system.activationScripts.postActivation.text = ''
    osascript -e 'tell application "System Events" to tell appearance preferences to set dark mode to true' || true
  '';
}
