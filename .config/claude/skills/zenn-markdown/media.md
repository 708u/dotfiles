# メディア記法

画像、リンクカード、外部サービス埋め込みについて。

## 画像

### 基本

```markdown
![altテキスト](https://example.com/image.png)
```

### 幅指定

URLの後に `=幅x` を追加。高さは自動調整。

```markdown
![altテキスト](https://example.com/image.png =250x)
![altテキスト](https://example.com/image.png =500x)
```

### キャプション

画像直後の行にイタリックでテキストを配置。

```markdown
![スクリーンショット](https://example.com/screenshot.png)
*図1: ダッシュボードの概要画面*
```

### Gyazo画像

Gyazo URLをそのまま貼り付けて画像表示可能。

## リンクカード

### 自動カード化

URLを単独行に記述するとカード形式で表示。

```markdown
本文テキスト。

https://example.com/article

続きのテキスト。
```

### 明示的なカード記法

アンダースコアを含むURLなど、自動認識されない場合に使用。

```markdown
@[card](https://example.com/path_with_underscore)
```

## 外部サービス埋め込み

### YouTube

```markdown
@[youtube](dQw4w9WgXcQ)
```

動画IDのみを指定（URLではなく）。

### GitHub Gist

```markdown
@[gist](ユーザー名/gist_id)
```

### GitHub リポジトリ

```markdown
@[github](ユーザー名/リポジトリ名)
```

### CodePen

```markdown
@[codepen](https://codepen.io/user/pen/xxxxx)
```

### Figma

```markdown
@[figma](https://www.figma.com/file/xxxxx)
```

### SpeakerDeck

```markdown
@[speakerdeck](slide_id)
```

### SlideShare

```markdown
@[slideshare](key)
```

### Docswell

```markdown
@[docswell](URL)
```

### その他

| サービス | 記法 |
|----------|------|
| Twitter/X | `@[tweet](tweet_url)` |
| JSFiddle | `@[jsfiddle](url)` |
| CodeSandbox | `@[codesandbox](id)` |
| StackBlitz | `@[stackblitz](id)` |

## 注意事項

- 埋め込みURLは正確に記述する
- 一部サービスは仕様変更で動作しなくなる可能性あり
- プライベートコンテンツは埋め込み不可
- リンクカードの自動認識はURL形式に依存するため、
  認識されない場合は `@[card]()` を使用
