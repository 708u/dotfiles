---
name: zenn-markdown
description: |
  Zenn記事のmarkdown編集を支援します。Zenn固有の記法（メッセージ、
  アコーディオン、コードブロック拡張、埋め込み等）を適切に使用します。
  新規記事作成、既存markdownのZenn形式変換に使用します。
---

# Zenn Markdown ガイド

Zenn記事を執筆する際のmarkdown記法リファレンスです。

## クイックリファレンス

### コンテナ記法

```markdown
:::message
補足情報や注意点（黄色背景）
:::

:::message alert
警告や重要な注意（赤背景）
:::

:::details タイトル
折りたたみコンテンツ
:::
```

詳細は [containers.md](./containers.md) を参照。

### コードブロック

````markdown
```js:filename.js
// ファイル名表示付きコード
```

```diff js
- const old = "before";
+ const new = "after";
```
````

詳細は [code-blocks.md](./code-blocks.md) を参照。

### 画像

```markdown
![alt](https://example.com/image.png)
![alt](https://example.com/image.png =250x)
```

画像直後に `*キャプション*` でキャプション表示。

### リンクカード

```markdown
https://example.com

@[card](https://example.com)
```

URL単独行でカード表示。アンダースコア含むURLは `@[card]()` を使用。

### 埋め込み

| サービス     | 記法                    |
| ------------ | ----------------------- |
| YouTube      | `@[youtube](動画ID)`    |
| GitHub Gist  | `@[gist](ユーザー/ID)`  |
| CodePen      | `@[codepen](URL)`       |
| Figma        | `@[figma](URL)`         |
| SpeakerDeck  | `@[speakerdeck](ID)`    |

詳細は [media.md](./media.md) を参照。

### 数式

```markdown
$$
e^{i\pi} + 1 = 0
$$

インライン: $a^2 + b^2 = c^2$
```

### mermaid

````markdown
```mermaid
graph TD
    A --> B
```
````

制限: 2000文字以内、Chain数10以下

詳細は [math-diagrams.md](./math-diagrams.md) を参照。

### 脚注

```markdown
テキスト[^1]

[^1]: 脚注の内容
```

## 変換チェックリスト

標準markdownからZennへ変換する際の確認項目:

- [ ] 補足説明を `:::message` に変換
- [ ] 警告を `:::message alert` に変換
- [ ] 長いコンテンツを `:::details` で折りたたみ
- [ ] コードブロックにファイル名を追加
- [ ] 単独URLをリンクカードに
- [ ] 外部サービスを埋め込み記法に変換
- [ ] 数式をKaTeX記法に変換
- [ ] フローチャートをmermaidに変換

詳細は [conversion.md](./conversion.md) を参照。

## 注意事項

- HTMLタグは基本的に使用不可（`<br>`のみ可）
- 画像altテキストは適切に設定する
- mermaidには文字数・Chain数制限あり
- アンダースコア含むURLはリンクカードで正しく認識されない場合あり
