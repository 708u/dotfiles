---
name: it-account-request
description: 情シスへのITツールアカウント追加・変更の承認申請メッセージを生成する。「アカウント申請」「情シスに申請」「ツールのアクセス権申請」「backoffice-it-requestに投稿したい」などのリクエストで使用する。
---

# ITツールアカウント承認申請メッセージ生成

`#backoffice-it-request` チャンネルに投稿する承認申請メッセージを生成する。

## 投稿先

Slack `#backoffice-it-request` チャンネル

## メッセージテンプレート

```txt
所属GL/Function MG：◯◯◯
アクセス権限管理部署のLead：◯◯◯
費用負担部署のLead：◯◯◯
アカウント設定作業部署：◯◯◯（部署のSlackユーザーグループを指定）
利用者：●●●
ツール名：●●●
利用用途もしくは依頼事項：●●●
利用開始タイミング：今日中/今週中/●月●日から
```

## ツール別の部署情報リファレンス

以下は主なツールの管理部署情報。
このリファレンスに載っていないツールをユーザーが指定した場合、
ユーザーにスプレッドシートで確認するよう案内する。

スプレッドシートURL:
<https://docs.google.com/spreadsheets/d/1j3MaAr0iTqp6sN75Qq3iMDmBJzzaj9nhE5RCBTv7e7Y/edit?gid=1155256269#gid=1155256269>

### Corporate Group 管理

| ツール名 | 権限管理 | 費用負担 | 設定作業 |
|---|---|---|---|
| Google Workspace | Corporate Group | Corporate Group | 情シス Team |
| 1Password | Corporate Group | Corporate Group | 情シス Team |
| Asana | Corporate Group | Corporate Group | 情シス Team |
| Slack | Corporate Group | Corporate Group | 情シス Team |
| Zoom | Corporate Group | Corporate Group | 情シス Team |
| Office365 | Corporate Group | Corporate Group | 情シス Team |
| Receptionist | Corporate Group | Corporate Group | 情シス Team |
| Amazon | Corporate Group | Corporate Group | 経理 Team |
| VPN | Corporate Group | 無し | 情シス Team |
| 印刷通販メガプリント | Corporate Group | Corporate Group | 総務/法務 Team |
| D-MAIL | Corporate Group | 無し | 総務/法務 Team |
| MAMORU ONE 保護くん | Corporate Group | 無し | 総務/法務 Team |
| 日経テレコン | Corporate Group | Corporate Group | 要整理 |

### Product Development Division 管理

| ツール名 | 権限管理 | 費用負担 | 設定作業 |
|---|---|---|---|
| Google Analytics | PD Division | 無し | 情シス Team |
| Google Tag Manager | PD Division | 無し | 情シス Team |
| Progate Admin csv | PD Division | 無し | 情シス Team |
| Progate Admin | PD Division | 無し | 情シス Team |
| Progate法人 | PD Division | 無し | 情シス Team |
| Stripe (Progate) | PD Division | PD Division | 経理 Team |
| Stripe (Progate Path) | PD Division | PD Division | 経理 Team |
| Stripe (Dev Playground) | PD Division | PD Division | 経理 Team |
| Stripe (Progate Studio) | PD Division | PD Division | 経理 Team |
| Stripe (Professional) | PD Division | PD Division | 経理 Team |
| Stripe (mosya) | PD Division | PD Division | 経理 Team |
| PayPal | PD Division | PD Division | 経理 Team |
| AXIS | PD Division | 無し | 情シス Team |
| BR Omega | PD Division | 無し | 情シス Team |
| Font Awesome | PD Division | Platform Team | 情シス Team |
| Figma | PD Division | Platform Team | 情シス Team |
| Microsoft Clarity (各種) | PD Division | 無し | 情シス Team |
| Redash | PD Division | 無し | 情シス Team |
| GitHub | PD Division | Platform Team | 島津、古川 |
| Apple Developer | PD Division | Platform Team | 島津、古川 |
| Facebook developer | PD Division | 無し | 島津、古川 |
| Twitter developer | PD Division | 無し | 島津、古川 |
| LaunchDarkly | PD Division | Platform Team | 島津、古川 |
| はてなブログ | PD Division | 無し | 情シス Team |

### Platform Team 管理

| ツール名 | 権限管理 | 費用負担 | 設定作業 |
|---|---|---|---|
| Google Cloud Platform | Platform Team | Platform Team | 島津、古川 |
| AWS | Platform Team | PD Division | 情シス Team |
| New Relic | Platform Team | Platform Team | 島津、古川 |
| Rollbar | Platform Team | Platform Team | 島津、古川 |
| Docker Hub/Docker Team | Platform Team | Platform Team | 島津、古川 |
| SendGrid | Platform Team | Platform Team | 島津、古川 |
| CircleCI | Platform Team | Platform Team | 島津、古川 |
| Bugsnag | Platform Team | Platform Team | 島津、古川 |
| HCP Terraform | Platform Team | Platform Team | 島津、古川 |

### Design Function 管理

| ツール名 | 権限管理 | 費用負担 | 設定作業 |
|---|---|---|---|
| Adobe | Design Function | Platform Team | 情シス Team |

### HR Team 管理

| ツール名 | 権限管理 | 費用負担 | 設定作業 |
|---|---|---|---|
| Notion | HR Team | HR Team | HR Team |
| wantedly | HR Team | 無し | HR Team |
| LinkedIn | HR Team | 無し | HR Team |

### Business Development Group 管理

| ツール名 | 権限管理 | 費用負担 | 設定作業 |
|---|---|---|---|
| Mata Business Suite | BD Group | BD Group、Prospects Group | 情シス Team |
| Google 広告 (Ads) | BD Group | BD Group、Prospects Group | 情シス Team |
| Facebook Ads | BD Group | 無し | 情シス Team |
| Instagram | BD Group | 無し | 要整理 |
| Value Press | BD Group | 無し | 要整理 |
| Blast mail | BD Group | 無し | 要整理 |
| note | BD Group | 無し | 要整理 |

### PR Team 管理

| ツール名 | 権限管理 | 費用負担 | 設定作業 |
|---|---|---|---|
| Twitter | PR Team | Platform Team | PR Team |
| PR TIMES | PR Team | PR Team | 要整理 |

### その他

| ツール名 | 権限管理 | 費用負担 | 設定作業 |
|---|---|---|---|
| King of time | 総務/法務 Team | Corporate Group | 総務/法務 Team |
| CHICAGO PRESS | 要整理 | 無し | 要整理 |
| CHICAGO PRESS(Admin) | 要整理 | 無し | 要整理 |

※ PD Division = Product Development Division
※ BD Group = Business Development Group

## ワークフロー

### ユーザーへのヒアリング

AskUserQuestionを使って以下の情報を収集する:

1. **ツール名**: 何のツールのアカウントが必要か
1. **利用者**: 誰が使うか（自分の場合は名前を確認）
1. **利用用途もしくは依頼事項**: なぜ必要か
1. **利用開始タイミング**: いつから必要か（今日中/今週中/具体的な日付）

### 部署情報の補完

- ツール名がリファレンスにある場合、部署情報を自動で埋める
- リファレンスにない場合、スプレッドシートの確認を案内する
- 所属GL/Function MGと各部署のLeadはユーザーに確認する

### メッセージ生成

収集した情報でテンプレートを埋め、最終的なメッセージを出力する。

## アカウント設定作業部署のSlack mention

`#backoffice-it-request` の過去投稿から特定した実際のmention先。

| 設定作業部署 | Slack mention |
|---|---|
| 情シス Team | `@corp_corporate_情シス_team` |
| 島津、古川 | `@Makoto Shimazu` `@Go Furukawa` |
| 経理 Team | 要確認（過去投稿に実績なし） |
| 総務/法務 Team | 要確認（過去投稿に実績なし） |
| HR Team | 要確認（ユーザーグループ存在するが名前不明） |
| PR Team | 要確認（過去投稿に実績なし） |

ユーザーグループの命名規則: `bd_`, `pd_`, `corp_` で始まる。

## 記入時の注意事項

- 所属GL、各部署のLeadは「組織図・人員配置表・メンバーリスト」を参照
- アカウント設定作業部署にはSlack mentionを指定する
  - 上記テーブルに該当がある場合はそのまま使用
  - 「要確認」の場合はユーザーに確認する
- 外部の個人メールアドレス（`@gmail.com`等）は記載しない
- Figma/FigJamは別途「Figmaのアクセス権周りの整理」ドキュメントを参照
