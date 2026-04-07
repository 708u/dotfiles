# dotfiles

nix-darwin + home-manager で管理する macOS 環境構築。

## Bootstrap

```bash
# 1. Nix をインストール
curl --proto '=https' --tlsv1.2 -sSf -L \
  https://install.determinate.systems/nix | sh -s -- install

# 2. リポジトリをクローン
mkdir -p ~/ghq/github.com/708u
git clone https://github.com/708u/dotfiles.git \
  ~/ghq/github.com/708u/dotfiles
cd ~/ghq/github.com/708u/dotfiles

# 3. homebrewをインストール
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 4. 初回セットアップ
make bootstrap
```

## 日常操作

```bash
# 設定の反映
make apply

# flake の更新
make update
```

## ローカル設定

`zsh/.local.zsh` にローカル環境固有の設定を追加できる。
`zsh/completion/.local` にローカル専用の補完を追加できる。
