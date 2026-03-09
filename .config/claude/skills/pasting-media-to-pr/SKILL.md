---
name: pasting-media-to-pr
description: GitHub PRにメディア（画像・動画・GIF）をペーストする。スクリーンショットやデモGIFをPRに追加したい場合に使用。
argument-hint: [pr-url] [file-path-or-url]
disable-model-invocation: true
allowed-tools: Bash, mcp__claude-in-chrome__tabs_context_mcp, mcp__claude-in-chrome__tabs_create_mcp, mcp__claude-in-chrome__navigate, mcp__claude-in-chrome__read_page, mcp__claude-in-chrome__computer, mcp__claude-in-chrome__gif_creator
---

# GitHub PR にメディアをペースト

Chrome MCPを使用して、GitHub PRのdescriptionにメディア（画像・動画・GIF）をペーストする。

## 対応形式

- **画像ファイル** (PNG, JPG, JPEG, WebP): クリップボードにコピーしてペースト（GitHubが自動アップロード）
- **GIFファイル**: クリップボードにコピーしてペースト（GitHubが自動アップロード）
- **動画ファイル** (MP4, MOV, WebM): ファイルをドラッグ&ドロップまたは手動アップロード

## 前提条件

- Chrome MCPが利用可能であること
- GitHubにログイン済みであること

## 引数

```
$ARGUMENTS
```

## クリップボードへのコピー方法

### 画面全体をクリップボードにキャプチャ

Chrome MCPの`screenshot`で取得した画像URLは内部用のため外部からアクセス不可。
macOSの`screencapture`を使用すること。

```bash
screencapture -c
```

### 特定の画像ファイルをクリップボードにコピー

```bash
osascript -e 'set the clipboard to (read (POSIX file "/path/to/image.png") as «class PNGf»)'
```

### GIFファイルをクリップボードにコピー

```bash
osascript -e 'set the clipboard to (read (POSIX file "/path/to/animation.gif") as GIF picture)'
```

## GIF撮影

撮影されるメディアのサイズは概ねChromeのウィンドウ幅になる。

Chrome MCPの`gif_creator`を使用:

```txt
# 録画開始
mcp__claude-in-chrome__gif_creator action=start_recording tabId=<tab_id>

# 操作を実行（ユーザーの指示に従う）

# 録画停止
mcp__claude-in-chrome__gif_creator action=stop_recording tabId=<tab_id>

# GIFをエクスポート（~/Downloadsに保存される）
mcp__claude-in-chrome__gif_creator action=export download=true tabId=<tab_id>
```

エクスポート後、GIFをクリップボードにコピーしてからペーストする。

## 手順

### GitHub PRを開く

```txt
mcp__claude-in-chrome__tabs_context_mcp createIfEmpty=true  # タブ情報を取得
mcp__claude-in-chrome__navigate url="<PR_URL>" tabId=<tab_id>  # PRのURLに移動
```

### 編集モードに入る

座標ではなくrefを使用してクリックすること。
refはDOM更新で変わるため、必ず「取得→即クリック」をセットで実行する。

```txt
# 1. read_pageでインタラクティブ要素を取得し、"Edit comment"のrefを特定
mcp__claude-in-chrome__read_page tabId=<tab_id> filter="interactive"
# → menuitem "Edit comment" [ref_XXX] を探す

# 2. 取得したrefを即座に使用してクリック
mcp__claude-in-chrome__computer action=left_click ref=ref_XXX tabId=<tab_id>
```

### 挿入箇所の判断

PR descriptionの構造を読み取り、以下の優先順位で挿入箇所を決定する:

| 優先度 | 検索キーワード | 説明 |
|--------|---------------|------|
| 1 | `## Test plan` | テスト計画セクションの直後 |
| 2 | `## QA` | QAセクションの直後 |
| 3 | `## Screenshots` | スクリーンショットセクションの直後 |
| 4 | `## Demo` | デモセクションの直後 |
| 5 | 末尾 | 上記がない場合は末尾に追加 |

### 挿入箇所へカーソルを移動

テキストエリア内で挿入したい箇所を検索し、カーソルを移動する。

```txt
# cmd+F で検索ダイアログを開く
mcp__claude-in-chrome__computer action=key text="cmd+f" tabId=<tab_id>

# 検索キーワードを入力（例: "## Test plan"）
mcp__claude-in-chrome__computer action=type text="## Test plan" tabId=<tab_id>

# Enterで検索実行、Escで検索ダイアログを閉じる
mcp__claude-in-chrome__computer action=key text="Enter Escape" tabId=<tab_id>

# 行末に移動して改行
mcp__claude-in-chrome__computer action=key text="cmd+Right Enter Enter" tabId=<tab_id>
```

### メディアをペースト

```txt
# クリップボードの内容をペースト
mcp__claude-in-chrome__computer action=key text="cmd+v" tabId=<tab_id>
```

### 保存

"Update comment"ボタンもrefで探すこと。
ボタンが画面外にある場合は、スクロールしてからread_pageを再実行する。

```txt
# 1. テキストエリアの末尾までスクロール（ボタンを表示させる）
mcp__claude-in-chrome__computer action=scroll coordinate=[600, 500] scroll_direction="down" scroll_amount=10 tabId=<tab_id>

# 2. read_pageで"Update comment"ボタンのrefを取得
mcp__claude-in-chrome__read_page tabId=<tab_id> filter="interactive"
# → button "Update comment" [ref_YYY] を探す
# ボタン名が表示されない場合は button [ref_YYY] type="submit" として表示されることがある

# 3. refを使ってクリック
mcp__claude-in-chrome__computer action=left_click ref=ref_YYY tabId=<tab_id>
```

## 注意事項

- **refは常に変わる**: ページリロードやDOM更新でrefが変わるため、read_pageで取得後すぐに使用すること
- `pbcopy` はテキスト専用のためメディアファイルには使用不可
- `osascript` または `screencapture -c` を使用する
- GitHubがメディアを自動でアップロードし、適切なタグに変換する

## 関連ツール

- `screencapture -c`: 画面全体をクリップボードにキャプチャ
- `screencapture -c -R x,y,w,h`: 指定領域をクリップボードにキャプチャ
- `osascript`: AppleScriptでメディアファイルをクリップボードにコピー
