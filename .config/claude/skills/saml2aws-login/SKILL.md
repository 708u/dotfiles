---
name: saml2aws-login
description: >-
  saml2aws login -a gsuite を Browser provider で実行し、AWS の一時認証情報を取得する。herdr の右 pane で実行して Enter を送り続け、Google の認証が必要なときは Ghostty の新しいウィンドウに切り替える。
  「saml2aws login」「AWS に login」「aws の認証切れ」「ExpiredToken」「credentials の更新」で使用。
---

# saml2aws-login

Google アカウントに passkey を登録していると、GoogleApps provider の login は 2 段階認証の未設定を理由に失敗する。
そのため Browser provider を使い、Chrome 上で Google の認証を行う。

Browser provider は Google の login 状態を `~/.aws/saml2aws/storageState.json` に保存し、次回の起動時に読み込む。
login 状態が有効なうちは Google の認証画面が省略され、role 選択に進む。

## herdr の pane 内 (`HERDR_ENV=1`) の場合

script は次の順に login を試す。

1. herdr の右 pane で実行し、role 選択などのプロンプトに Enter を送り続ける。Google の login 状態が有効なら、ユーザーの操作なしで完了する
2. 一定時間内に login 状態が保存されないときは、Google の認証を待っていると判断して pane を閉じる。herdr の pane から起動した Chrome は macOS の Bluetooth の利用許可を得られず、スマートフォンの passkey を使えないため、Ghostty の新しいウィンドウを開いて実行し直す

### 1. script を実行する

```bash
~/.claude/skills/saml2aws-login/scripts/login.sh [account] [timeout] [force]
```

- account の既定値は `gsuite`、timeout (秒) の既定値は 300
- 3 番目の引数に `force` を渡すと、認証情報が有効でも `--force` で取り直す

Ghostty のウィンドウに切り替わる可能性があるため、script を実行するときに、Ghostty のウィンドウが開いたら Chrome の認証と role 選択を行うようユーザーに伝えておく。
script は login が終わるまで待ち、pane と Ghostty のウィンドウは終了時に自動で閉じる。

### 2. 結果を報告する

| status | 意味 | 報告内容 |
| --- | --- | --- |
| `already_logged_in` | 認証情報が有効だった | login 済みであること |
| `logged_in` | 新しい認証情報を取得した | 有効期限 |
| `driver_missing` | Playwright の driver を取得できなかった | 下記の driver の導入手順 |
| `failed` | saml2aws が 0 以外で終了した | 出力の末尾 |
| `timeout` | 待機秒数内に終了しなかった | 画面の末尾。Ghostty に切り替えた後なら、Ghostty のウィンドウで操作が残っていないか確認するよう案内する |

出力に `status=ghostty_opened` が含まれるときは、Ghostty のウィンドウでユーザーが認証したことを報告に添える。

## herdr の外の場合

script は `status=not_herdr` で終了する。
ユーザーが自分の terminal で次を実行するよう案内する。

```bash
SAML2AWS_IDP_PROVIDER=Browser \
SAML2AWS_BROWSER_TYPE=chrome \
SAML2AWS_BROWSER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
saml2aws login -a gsuite --skip-prompt
```

## Playwright の driver の導入

saml2aws が依存する playwright-go は、廃止された CDN から driver を取得するため、`--download-browser-driver` は失敗する。
npm の playwright-core と手元の node で driver を配置する。
version は driver の取得に失敗したときのエラーの URL に含まれる値に合わせる。

```bash
v=1.47.2
d=~/Library/Caches/ms-playwright-go/$v
mkdir -p "$d"
curl -sfL "https://registry.npmjs.org/playwright-core/-/playwright-core-$v.tgz" | tar xz -C "$d"
ln -sf "$(command -v node)" "$d/node"
"$d/node" "$d/package/cli.js" --version
```

browser には手元の Chrome を使うため、Playwright の browser のダウンロードは不要。
