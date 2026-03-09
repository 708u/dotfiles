# アクセシビリティ

障害のある人を含む全員がドキュメントを読んで理解できるようにする。

## 代替テキスト（Alt Text）

### 基本原則

代替テキストはスクリーンリーダー利用者と視覚障害者をサポートする。

| ルール | 説明 |
|--------|------|
| 簡潔性 | 1-2文で要点をまとめる |
| 文脈依存 | 周囲のテキストに基づき関連情報のみ記述 |
| 冗語排除 | "Image of", "Photo of"は不要 |
| 書式 | 最初の単語は大文字、最後にピリオド |

### 適切な例

```txt
悪い例（簡潔すぎ）: Waffles
悪い例（冗長すぎ）: A plate with a stack of 5 waffles topped with
                    17 strawberries and maple syrup...
良い例: A stack of waffles on a plate with strawberries.
```

### 重複の回避

ページ内のテキストと同じ情報を繰り返す場合は空の属性を使用:

```html
<img src="logo.png" alt="">
```

### 複雑な画像への対応

グラフやフローチャートは二層構造で説明:

1. 短いalt text（概要）
2. 本文での詳細説明

```txt
alt="Sales trend chart showing growth from Q1 to Q4."
本文: The chart shows quarterly sales increasing from
$1M in Q1 to $4M in Q4, with the steepest growth in Q3.
```

### 避けるべき表現

- 全大文字表記（読解を妨げる）
- 不要な人口統計情報
- 同じ画像への不一貫な説明

## インクルーシブな言語

### 障害に関する表現

| 避ける | 使う |
|--------|------|
| normal, healthy | nondisabled, sighted, hearing person |
| victim of, suffering from | experiencing, living with |
| wheelchair-bound | uses a wheelchair |
| the disabled | people with disabilities |

### 人称優先 vs 同一性優先

| アプローチ | 例 | 使用するコミュニティ |
|-----------|-----|---------------------|
| 人称優先 | person with a cognitive impairment | 一般的に推奨 |
| 同一性優先 | Deaf person, neurodivergent person | 特定のコミュニティ |

コミュニティについて書く前に、そのコミュニティの選好を調査する。

## アクセシブルなビジュアル

### 視覚的手がかりだけに依存しない

単一の視覚要素のみに頼らない:

- 色のみ
- パターンのみ
- 形状のみ
- 方向性の言葉のみ

### 複合アプローチ

```txt
悪い例:
赤 = 非推奨、緑 = 推奨（色覚異常者に対応できない）

良い例:
赤 + "非推奨" ラベル + X記号
緑 + "推奨" ラベル + チェック記号
```

### 図表の改善

```txt
悪い例:
同じ形状の矩形を色だけで区別

良い例:
異なる形状（台形、円、三角形）+ ラベル
```

## アクセシビリティ編集

### 見出しの構造

- 見出しタグを適切に使用（h1, h2, h3）
- ページタイトルはh1を使用
- 階層をスキップしない（h1 -> h3は避ける）

```txt
悪い例:
<h1>Guide</h1>
<h3>Installation</h3>  <!-- h2をスキップ -->

良い例:
<h1>Guide</h1>
<h2>Installation</h2>
<h3>Prerequisites</h3>
```

### リンクテキスト

```txt
悪い例:
For more information, click here.
Learn more.

良い例:
Learn how to format tables.
See the authentication guide.
```

リンク先の内容を明確に示す。

### 言語の明確化

- 不慣れな専門用語やスラングを避ける
- 能動態と短い文を使用
- 技術用語は初出時に定義

### テスト方法

アクセシビリティを確認する方法:

| 方法 | 確認内容 |
|------|----------|
| ズームレベル変更 | 200%でも読めるか |
| キーボード操作 | マウスなしで操作可能か |
| スクリーンリーダー | ChromeVox, VoiceOverで読み上げ確認 |

## チェックリスト

- [ ] すべての画像に適切なalt textがあるか
- [ ] 色だけで情報を伝えていないか
- [ ] 見出し階層が正しいか
- [ ] リンクテキストが情報的か
- [ ] インクルーシブな言語を使用しているか
- [ ] キーボードのみで操作できるか
