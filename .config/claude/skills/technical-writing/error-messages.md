# エラーメッセージ

効果的なエラーメッセージの作成ガイドライン。

## 基本原則

### サイレントフェイルの禁止

失敗は避けられないが、失敗を報告しないことは許されない。
サイレントフェイルはユーザーとサポートチームを混乱させる。

### エラーを即座に報告

エラーを検出したら直ちに報告する。
遅延した報告はデバッグを複雑にする。

## 問題の説明

### 原因を特定する

```txt
悪い例: Bad directory.
良い例: Can't save file to '/usr/local/data': directory
        is read-only. Change the directory permissions or
        choose a different save location.
```

曖昧な表現は避け、何が問題かを正確に伝える。

### 無効な入力を明示する

```txt
悪い例: Invalid postal code.
良い例: The postal code must be 5 or 9 digits.
        The specified postal code (4872953) has 7 digits.
```

ユーザーの入力値と期待される値の両方を示す。

### 要件と制約を明示する

| 種類 | 悪い例 | 良い例 |
|------|--------|--------|
| サイズ制限 | File too large | Attachments (14MB) exceed limit (10MB) |
| 権限 | Access denied | Only users in <group> have access |
| タイムアウト | Timeout exceeded | Timeout period (30s) exceeded |

具体的な数値やグループ名を含める。

## 解決策の説明

### 修正方法を示す

```txt
悪い例:
The client app is no longer supported.

良い例:
The client app is no longer supported.
To update, click the Update app button.
```

原因の説明に加え、具体的な修正ステップを提供する。

### 複数の解決策がある場合

```txt
CPU quota exceeded. To resolve this issue:
- Increase your CPU quota allocation, or
- Run the job in a different region
```

選択肢を明確に提示する。

### 例を提供する

```txt
悪い例:
Invalid email address.

良い例:
Email address must include @ and domain name.
Example: robin@example.com
```

正しい形式の具体例を示す。

## 明確に書く

### 簡潔に

| 冗長 | 簡潔 |
|------|------|
| Unable to establish connection to | Can't connect to |
| The SiteID you have entered is invalid | Invalid SiteID |

不要な言葉を削除し、能動態を使用する。
ただし、暗号的になりすぎない（"Unsupported." のみは不可）。

### 二重否定を避ける

```txt
悪い例: You cannot not invoke this flag.
良い例: You must invoke this flag.

悪い例: Can't disable the non-default mode.
良い例: Enable the default mode.
```

肯定形で直接的に表現する。

### ターゲットオーディエンスに合わせる

| オーディエンス | 適切な表現 |
|---------------|-----------|
| MLエンジニア | Exploding gradient problem detected |
| 一般消費者 | Too many shoppers right now |

知識の呪いに注意し、読者の背景知識を考慮する。

### 用語の一貫性

```txt
悪い例:
Can't connect to cluster at 127.0.0.1:56.
Check whether minikube is running.

良い例:
Can't connect to minikube at 127.0.0.1:56.
Check whether minikube is running.
```

同じ概念には同じ用語を使用する。
同義語の使い分けはエラーメッセージでは避ける。

## フォーマット

### 詳細へのリンク

長い説明が必要な場合は関連ドキュメントへリンクする。

### 段階的情報開示

```txt
Error: Invalid configuration.
[Show details] をクリックで詳細表示
```

簡潔な初期メッセージ + 展開可能な詳細。

### エラー位置に近く配置

コーディングエラーは発生箇所の近くに配置する。

### 色の使用に注意

色覚異常への配慮として、色だけでなく
太字、余白、下線などと組み合わせる。

## トーン

### ポジティブに

```txt
悪い例: You didn't enter a name.
良い例: Enter a name.
```

問題点でなく解決方法を示す。

### 過度な謝罪を避ける

"申し訳ありません"、"お手数ですが" は控えめに。
文化的背景により期待値は異なる。

### ユーモアは控える

ユーザーはエラーに不満を抱いている。
ユーモアは逆効果になりやすく、国際的に誤解されるリスクもある。

### ユーザーを責めない

```txt
悪い例: You specified an offline printer.
良い例: The specified printer is offline.
```

責任追及ではなく状況説明に焦点を当てる。

## バックエンドエンジニア向け

### エラーコードの提供

```txt
Error 409: You already own this bucket.
```

数値コードを含めることでエラーカタログから詳細検索が可能になる。

### エラー識別子の含有

```json
{
  "error": "Bucket already exists",
  "issue_reference": "BR0x0071"
}
```

ログ解析用の固定識別子を含める。
テキストが変更されても識別子は一定に保つ。

## チェックリスト

- [ ] 原因が具体的に説明されているか
- [ ] 無効な入力値と期待値の両方が示されているか
- [ ] 修正方法が明記されているか
- [ ] 簡潔だが暗号的でないか
- [ ] 二重否定を使用していないか
- [ ] 用語が一貫しているか
- [ ] ユーザーを責める表現がないか
- [ ] エラーコード/識別子が含まれているか（バックエンド）
