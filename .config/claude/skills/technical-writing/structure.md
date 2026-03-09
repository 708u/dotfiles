# 構造化

## リストと表

### リストの種類

| 種類 | 用途 | 例 |
|------|------|-----|
| 箇条書き | 順序が重要でない項目 | 機能一覧、要件 |
| 番号付き | 順序が重要な手順 | インストール手順、ワークフロー |
| 埋め込み | 文中のリスト | 非推奨 |

### 並列構造の維持

すべてのリスト項目で以下を統一:

- 文法構造
- 論理的カテゴリ
- 大文字/小文字
- 句読点

```txt
悪い例（並列でない）:
- Download the package
- The configuration should be updated
- Running the tests

良い例（並列）:
- Download the package
- Update the configuration
- Run the tests
```

最初の項目が読者の期待を設定する。

### 番号付きリストのベストプラクティス

各項目を命令形の動詞で開始:

```txt
1. Download the package from the release page.
2. Extract the archive to your installation directory.
3. Configure the environment variables.
4. Run the installation script.
5. Verify the installation.
```

### 表のガイドライン

| 要素 | ガイドライン |
|------|-------------|
| 列ヘッダー | 明確で意味のある名前 |
| セル内容 | 簡潔に（2文以内） |
| 列内 | データ形式を統一 |
| カテゴリ | 並列性を維持 |

### 導入文の必要性

リストと表には文脈を提供する導入文を付ける。
"following"を含め、コロンで終える:

```txt
The following steps describe the installation process:

The following table summarizes the configuration options:
```

## 段落

### 冒頭文の重要性

忙しい読者は主に冒頭文に注目する。
段落の最初の文が最も重要。

```txt
効果的な冒頭: The garp() function returns the delta between
the mean and median of a dataset.

残りの段落で why と how を説明。
```

### 単一トピックの原則

各段落は1つの独立した論理ユニットを表す。
中心トピックから逸脱する文は削除または移動する。

### 適切な長さ

| 長さ | 評価 |
|------|------|
| 1-2文 | 短すぎる可能性、流れが途切れる |
| 3-5文 | 理想的 |
| 6-7文 | 許容範囲 |
| 8文以上 | 分割を検討 |

長い段落は読者を威圧し、短すぎる段落の連続は流れを断ち切る。

### 3つの質問に答える

質の高い段落は以下に答える:

1. **What**: 何を伝えているか
2. **Why**: なぜその情報が重要か
3. **How**: 読者はどう適用・検証するか

```txt
例:
[What] The garp() function returns the delta between the mean
and median.
[Why] Statisticians use this value to determine the influence
of outliers on a dataset.
[How] Call garp() to determine whether to use the mean or
median for your calculation.
```

## ドキュメント構成

### スコープの明示

ドキュメントの範囲を定義し、何をカバーしないかを明確に記載:

```txt
This document describes the design of Project Frambus.
This document does not describe the design of the related
Project Froobus.
```

### 対象読者の特定

以下の情報を含める:

- 対象者の職種（エンジニア、プログラムマネージャーなど）
- 前提知識や経験
- 必要な事前学習資料

```txt
This document is intended for software engineers who have
experience with Python and basic understanding of REST APIs.

Before reading this document, complete the following prerequisites:
- Introduction to our API framework
- Authentication setup guide
```

### 冒頭での要点要約

読者はすべてを読まないため、最初の段落で本質的な質問に答える。
ページ1は最大限の注意で執筆・修正が必要。

### 比較対照戦略

新概念を既知の技術と比較して説明:

```txt
The new version includes several improvements over version 1.x.
Graphics rendering is significantly improved, with frame rates
doubling under typical workloads.
```

### 読者ニーズに基づいた組織化

以下の質問に答えてアウトラインを作成:

1. 対象者は誰か
2. 読む目的は何か
3. 事前知識は何か
4. 読後に何ができるべきか

## 句読点

### コンマ

- 自然な一時停止地点に挿入
- 埋め込みリスト内の項目を分離
- 条件と結果を区切る
- オックスフォードコンマを推奨

```txt
Our company uses C++, Python, Java, and JavaScript.
                                   ^ オックスフォードコンマ
```

### セミコロン

関連性の高い独立した完全文を統合:

```txt
Rerun Frambus after updating your configuration file;
don't rerun Frambus after updating existing source code.
```

セミコロンの前後の文は順序を逆にしても文法的に成立する必要がある。

### コロン

リストやテーブルの導入に使用:

```txt
Consider the following important programming languages:
```

### 括弧

重要でない補足事項や脱線を含める。
括弧が完全文を含む場合、ピリオドは括弧内に置く。

## 大規模ドキュメントの組織化

### 単一 vs 複数ドキュメント

| 形式 | 適したケース |
|------|-------------|
| 短編（単一ページ） | 入門者向けガイド、クイックスタート |
| 長編（複数セクション） | チュートリアル、ベストプラクティス |
| 複数ドキュメント | リファレンス、大規模プロジェクト |

読者タイプに応じて形式を選択する。

### アウトライン作成

ドキュメントを書き始める前にアウトラインを作成:

- タスク実行前に背景説明を記載
- 各ステップは1つの概念か特定タスクに限定
- 読者に必要な情報を段階的に導入

### 導入文のポイント

導入部では以下を明記:

- カバー範囲（何を説明するか）
- 前提知識（読者が知っているべきこと）
- 除外内容（何を説明しないか）

```txt
例:
このガイドでは、APIの認証方法を説明します。
RESTの基本概念を理解していることを前提とします。
レート制限とエラーハンドリングは別のガイドで説明します。
```

### ナビゲーション強化

#### 見出しの工夫

技術用語より実行内容を優先:

```txt
悪い例: OAuth2 Implementation
良い例: Set up user authentication
```

各見出しには簡潔な説明文を付ける。

#### 構造要素

- 目次メニュー
- 関連リソースへのリンク
- 「次のステップ」セクション
- パンくずリスト

### 段階的情報開示

複数の段落でなく、以下で内容を分割:

- 表
- 図
- リスト
- 折りたたみセクション

単純例から複雑な手法へ段階的に進行させる:

```txt
1. 基本的な使い方（Hello World）
2. 一般的なユースケース
3. 高度な設定
4. トラブルシューティング
```

この手法が学習効果を高める。
