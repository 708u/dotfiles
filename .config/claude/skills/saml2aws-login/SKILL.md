---
name: saml2aws-login
description: >-
  herdr の右側に terminal pane を開き、saml2aws login -a gsuite を実行して Enter を送り続け、AWS の一時認証情報を取得する。
  「saml2aws login」「AWS に login」「aws の認証切れ」「ExpiredToken」「credentials の更新」で使用。
user_invocable: true
---

# saml2aws-login

herdr の右 pane で `saml2aws login -a gsuite` を実行する。
プロンプトは保存済みの値か既定値で進むため、Enter を送り続ければ login が完了する。

herdr の pane 内 (`HERDR_ENV=1`) で実行する必要がある。

## 手順

### 1. script を実行する

```bash
~/.claude/skills/saml2aws-login/scripts/login.sh
```

引数で account 名と待機秒数を変えられる (`login.sh <account> <timeout>`)。

script は次の処理を行う。

1. `herdr pane split --current --direction right --no-focus` で右に terminal pane を作成する
2. `herdr pane run` で login コマンドを送る
3. 終了の目印が表示されるまで `herdr pane send-keys <pane> enter` を送り続ける
4. 結果に関わらず、終了時に作成した pane を `herdr pane close` で閉じる

### 2. 結果を報告する

出力の `status` に応じて分岐する。

| status | 意味 | 報告内容 |
| --- | --- | --- |
| `already_logged_in` | 最初の実行で成功した。login 済み | login 済みであること |
| `logged_in` | 新しい認証情報を取得した | 有効期限 |
| `failed` | saml2aws が 0 以外で終了した | 出力された画面の末尾 |
| `timeout` | 待機秒数内に終了しなかった | 画面の末尾 |

`failed` と `timeout` のときは、ブラウザ側の操作 (Google の再認証など) を済ませてから再実行するようユーザーに案内する。
