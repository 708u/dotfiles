# AGENTS.md

This file provides guidance to coding agents
when working with code in this repository.

## Commands

```bash
# 設定を macOS に適用 (適用先は LocalHostName で判定する)
make apply

# hostname が未設定のマシンへの初回適用
make apply HOST=708uServer

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
  server.nix        # 708uServer 専用の設定
zsh/                # Zinit 経由で source されるシェル設定
```

### ホストごとの設定

`flake.nix` の `mkDarwin` が共通 module を組み立て、
ホストごとの module を `extraModules` で追加する。

| ホスト | 用途と設定 |
| --- | --- |
| 708uMacBookPro | メインマシン。共通の module のみ |
| 708uServer | Claude Code を常時稼働させる server 用マシン。`server.nix` でスリープを無効にし、それ以外は省電力の設定にする。`batt` で充電上限を固定する |

ホスト固有の設定は `server.nix` のようなホスト専用の module に記述する。
list 型のオプション (`homebrew.brews` など) は共通の module と連結される。

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

### Claude Code の skill

`~/.claude/skills` はディレクトリごとリンクせず、
`symlinks.nix` が skill ごとに配置する。入手元ごとの管理方法:

| 入手元 | 管理方法 |
| --- | --- |
| 自作 | `.config/claude/skills/` に置く。新しい skill は git add してから `make apply` するまで配置されない |
| plugin として配布されているもの | Claude Code の plugin で管理する |
| nix で入れたツールに付属するもの | `externalSkills` にパッケージのソース内のパスを指定し、本体とバージョンを揃える |
| GitHub で公開されている単体の skill | flake input (`flake = false`) で取得し、`externalSkills` に追加する。home-manager に `inputs` を渡す必要がある |

claude.ai からの同期などツールが書き込む skill は
`~/.claude/skills` に直接作成され、リポジトリには入らない。

### zsh 設定の構造

`shell.nix` が `~/.zshrc` を生成。Zinit を初期化後、
`zsh/` 配下の設定ファイルを source する。
`zsh/.local.zsh` はローカル専用 (gitignore)。 読み取り禁止

### alias と abbr の使い分け

- **alias** (`zsh/alias.zsh`):
  既存コマンドの上書き (`ls='lsd'`)、
  グローバルエイリアス (`-g`)、シェル関数
- **abbr** (`zsh/abbr.zsh`):
  コマンドのショートカット。`abbr -S -q` で定義。
  入力時に展開され履歴に実コマンドが残る

新規追加は原則 abbr を使う。
alias は上書き・グローバル・関数定義のみ。

## git 運用の例外

設定・skill・ドキュメントの小変更は、worktree を作らず
main へ直接 commit / push してよい。global の
「branch 作成時は twig を使う」ルールより本節を優先する。
レビューを要する変更や複数ファイルにまたがる機能追加は
twig で branch を切り PR を作成する。

## Nix の注意点

- Determinate Nix 使用のため `nix.enable = false`
- 新規 `.nix` ファイルは `git add` してからビルド
- `programs.git` は `settings` API を使用
  (`extraConfig`, `aliases` は deprecated)
- `programs.zsh` は `initContent` を使用
  (`initExtra`, `initExtraFirst` は deprecated)
- `homebrew.nix` の cleanup は無効。記載のない cask は
  自動削除されないため、手動で `brew uninstall` する

## Claude Code プラグイン (手動セットアップ)

`make apply` では反映されない手動手順がある。

```bash
# gopls 共有 daemon モード
# 複数セッションで gopls を共有しメモリを節約する
claude plugin marketplace add \
  .config/claude/plugins/gopls-remote
claude plugin install gopls-remote@gopls-remote
```

## 708uServer (手動セットアップ)

`batt` の daemon は root で起動する必要があり、
brew bundle の `start_service` では起動できない。

```bash
sudo brew services start batt
batt limit 80
```

## mutagen

- 設定変更後は `mutagen sync reset <session>` で反映
- terminate → 再作成は不要
