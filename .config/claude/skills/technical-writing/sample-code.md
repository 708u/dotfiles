# サンプルコード

良いサンプルコードは5つの特性を持つ:
正確性、簡潔性、理解しやすさ、再利用可能性、段階化。

## 正確性（Correct）

### 基本要件

サンプルコードは以下を満たす必要がある:

- エラーなくビルドできる
- 意図した機能を実行する
- 本番環境に近い品質
- 言語固有の慣例に従う

### セキュリティ

サンプルコードにセキュリティ脆弱性を含めない:

```txt
悪い例:
password = "admin123"  # ハードコードされた認証情報

良い例:
password = os.environ.get("DB_PASSWORD")  # 環境変数から取得
```

危険なパターンを避ける:

- ハードコードされた認証情報
- 入力値の未検証
- SQLインジェクションの脆弱性
- 任意コード実行の可能性

### テスト

- スニペット（断片的なコード）より完全なサンプルプログラムをテスト
- 単体テストをサンプルプログラムとして再利用しない
- 実際に実行して動作を確認

## 簡潔性（Concise）

### 不要な要素の削除

学習に必要な部分のみを含める:

```txt
悪い例:
import os
import sys
import logging
import json  # 使用しないインポート
from datetime import datetime

良い例:
from datetime import datetime  # 必要なインポートのみ
```

### 簡潔さと正確さのバランス

簡潔さのために悪い実装を使用してはいけない:

```txt
悪い例（簡潔だが危険）:
user_input を直接実行  # 任意コード実行の脆弱性

良い例（やや長いが安全）:
try:
    value = int(user_input)
except ValueError:
    handle_error()
```

## 理解しやすさ（Understandable）

### 命名規則

説明的な変数・メソッド・クラス名を使用:

```python
# 悪い例
x = g(r=5, d=28, o=48)

# 良い例
level = Level(rank=5, dimension=28, opacity=48)
```

パラメータ名を含めることで初心者が学びやすくなる。

### コードの構造

- プログラミングの技巧を避ける
- ネストを最小化
- 各関数は1つの責務

```python
# 悪い例（深いネスト）
if condition1:
    if condition2:
        if condition3:
            do_something()

# 良い例（早期リターン）
if not condition1:
    return
if not condition2:
    return
if not condition3:
    return
do_something()
```

### ハイライト機能の活用

重要な行をハイライト（プラットフォームがサポートしている場合）。

## コメント

### 基本原則

- 簡潔だが明確に
- 非自明な部分に焦点
- 経験者には「何」より「なぜ」を説明

### 避けるべきコメント

```python
# 悪い例（自明）
# ストリームを開く
stream = open_stream()

# ファイルを閉じる
file.close()
```

### 有用なコメント

```python
# 良い例（なぜを説明）
# mode="z"はzlib圧縮を有効にする（帯域幅制限のある環境向け）
stream = open_stream(mode="z")

# 接続プールの再利用のため、明示的にcloseしない
# connection.close()
```

### 実装上の妥協点

```python
# TODO: 本番環境では接続プールを使用すること
# この例では簡略化のため直接接続を使用
connection = create_direct_connection()
```

## 再利用可能性（Reusable）

### セットアップ手順

依存関係とセットアップを明記:

```txt
## 前提条件

- Python 3.9以上
- pip install requests pandas

## 環境変数

export API_KEY="your-api-key"
```

### 拡張可能な設計

- マジックナンバーを避け、定数を使用
- 設定値は外部化
- カスタマイズポイントを明示

### 副作用の最小化

- 外部状態を変更しない
- 冪等性を考慮
- クリーンアップ手順を提供

## 段階化（Sequenced）

### 複雑性の段階

| レベル | 説明 | 例 |
|--------|------|-----|
| 初級 | 最小限の機能 | Hello World |
| 中級 | 典型的なユースケース | CRUD操作 |
| 上級 | 複雑な使用例 | エラーハンドリング、最適化 |

### 段階的アプローチの利点

- 初心者は基礎から始められる
- 経験者は必要なレベルから参照可能
- 学習曲線が緩やかになる

### 例: API呼び出し

```python
# レベル1: 基本的な呼び出し
response = api.get("/users")

# レベル2: パラメータ付き
response = api.get("/users", params={"limit": 10})

# レベル3: エラーハンドリング付き
try:
    response = api.get("/users", params={"limit": 10})
    response.raise_for_status()
except RequestError as e:
    logger.error(f"API call failed: {e}")
    raise
```
