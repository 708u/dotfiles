# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code)
when working with code in this repository.

## Commands

```bash
# 設定を macOS に適用
make apply

# Nix flake を更新
make update

# ビルドのみ（適用しない）
darwin-rebuild build --flake .
```

## Architecture

nix-darwin + home-manager による macOS 環境の宣言的管理。

```txt
flake.nix           # エントリーポイント (aarch64-darwin)
nix/
  darwin.nix        # nix-darwin: homebrew, macOS defaults
  home.nix          # home-manager: 各モジュールの統合
  packages.nix      # nixpkgs CLI ツール
  homebrew.nix      # brew: GUI アプリ, cask, masApps
  macos-defaults.nix # system.defaults + CustomUserPreferences
  git.nix           # programs.git (settings API)
  mise.nix          # programs.mise (node/python/terraform)
  shell.nix         # programs.zsh, direnv, fzf, zoxide,
                    # sessionVariables, sessionPath
  symlinks.nix      # mkOutOfStoreSymlink で .config/, .claude/
zsh/                # Zinit 経由で source されるシェル設定
```

### パッケージ管理の使い分け

- **nixpkgs** (`packages.nix`): CLI ツール, フォント
- **Homebrew** (`homebrew.nix`): GUI アプリ (cask),
  nixpkgs にないツール (tap 依存)
- **mise** (`mise.nix`): 言語ランタイムのバージョン管理

### specialArgs

`flake.nix` で `dotfilesDir` を
`home-manager.extraSpecialArgs` に渡している。
`shell.nix` と `symlinks.nix` で使用。

### symlink の仕組み

`symlinks.nix` は `mkOutOfStoreSymlink` で
nix store 経由の二段階 symlink を作成する。
リンク先は dotfiles リポジトリ内のファイル。

### zsh 設定の構造

`shell.nix` が `~/.zshrc` を生成。Zinit を初期化後、
`zsh/` 配下の設定ファイルを source する。
`zsh/.local.zsh` はローカル専用 (gitignore)。 読み取り禁止

## Nix の注意点

- Determinate Nix 使用のため `nix.enable = false`
- 新規 `.nix` ファイルは `git add` してからビルド
- `programs.git` は `settings` API を使用
  (`extraConfig`, `aliases` は deprecated)
- `programs.zsh` は `initContent` を使用
  (`initExtra`, `initExtraFirst` は deprecated)
- `homebrew.nix` の `cleanup = "zap"` により
  記載のない cask は自動削除される
