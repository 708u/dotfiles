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

    # サウンド
    NSGlobalDomain."com.apple.sound.beep.feedback" = 0;

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
      # Spotlight 無効化 (Raycast で代替)
      "com.apple.Spotlight" = {
        "SuppressSearchFeature" = true;
      };
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
      "com.apple.symbolichotkeys" = {
        AppleSymbolicHotKeys = {
          # Dock 表示/非表示 (Cmd+Option+D) を無効化
          "52" = {
            enabled = false;
            value = {
              parameters = [ 100 2 8650752 ];
              type = "standard";
            };
          };
          # Spotlight 検索表示 (Cmd+Space) を無効化
          "64" = {
            enabled = false;
            value = {
              parameters = [ 32 49 1048576 ];
              type = "standard";
            };
          };
          # Finder 検索ウィンドウ (Cmd+Option+Space) を無効化
          "65" = {
            enabled = false;
            value = {
              parameters = [ 32 49 1572864 ];
              type = "standard";
            };
          };
        };
      };
    };
  };}
