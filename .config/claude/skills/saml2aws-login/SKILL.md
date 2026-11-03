---
name: saml2aws-login
description: >-
  cmux の右側に terminal pane を開き、saml2aws login -a gsuite を
  実行して Enter を送り続け、AWS の一時認証情報を取得する。
  「saml2aws login」「AWS に login」「aws の認証切れ」
  「ExpiredToken」「credentials の更新」で使用。
user_invocable: true
---

# saml2aws-login

cmux の右 pane で `saml2aws login -a gsuite` を実行する。
プロンプトは保存済みの値か既定値で進むため、Enter を送り続ければ
login が完了する。

## 手順

### 1. script を実行する

```bash
~/.claude/skills/saml2aws-login/scripts/login.sh
```

引数で account 名と待機秒数を変えられる
(`login.sh <account> <timeout>`)。

script は次を行う。

1. `cmux new-pane --direction right` で右に terminal pane を作る
2. `cmux send` で login コマンドを送る
3. 終了の目印が表示されるまで `cmux send-key enter` を送り続ける

### 2. 結果を報告する

出力の `status` で分岐する。

| status | 意味 | 報告内容 |
| --- | --- | --- |
| `already_logged_in` | 最初の実行で成功した。login 済み | login 済みであること |
| `logged_in` | 新しい認証情報を取得した | 有効期限 |
| `failed` | saml2aws が 0 以外で終了した | 出力された画面の末尾 |
| `timeout` | 待機秒数内に終了しなかった | 画面の末尾と pane の surface |

`failed` と `timeout` のときは pane を閉じず、ユーザーに
ブラウザ側の操作 (Google の再認証など) が必要か確認を求める。
