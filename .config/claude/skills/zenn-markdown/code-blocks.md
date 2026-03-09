# コードブロック拡張

Zennのコードブロック拡張機能について。

## 基本

言語を指定するとシンタックスハイライトが適用される。

````markdown
```javascript
const greeting = "Hello, Zenn!";
```
````

## ファイル名表示

言語名の後にコロンとファイル名を指定。

````markdown
```js:src/utils/helper.js
export const helper = () => {
  return "helper";
};
```
````

表示例: コードブロック上部に `src/utils/helper.js` が表示される。

### ファイル名のみ

```markdown
```txt:設定ファイル例
key=value
```

```

## diff表示

`diff` の後に言語を指定。

````markdown
```diff js
- const old = "before";
+ const new = "after";
  const unchanged = "same";
```

````

- `-` で始まる行: 削除（赤背景）
- `+` で始まる行: 追加（緑背景）
- 空白で始まる行: 変更なし

### diff + ファイル名

````markdown
```diff ts:src/config.ts
- const API_URL = "http://localhost:3000";
+ const API_URL = process.env.API_URL;
```
````

## 対応言語

一般的なプログラミング言語はすべて対応:

- JavaScript/TypeScript: `js`, `ts`, `jsx`, `tsx`
- Python: `python`, `py`
- Ruby: `ruby`, `rb`
- Go: `go`
- Rust: `rust`
- Shell: `bash`, `sh`, `zsh`
- SQL: `sql`
- YAML/JSON: `yaml`, `json`
- Markdown: `markdown`, `md`

その他多数。言語名は小文字で指定。

## 注意点

- 言語指定がないとハイライトされない
- ファイル名にスペースを含める場合はそのまま記述可能
- diffモードでは行頭の記号（`+`, `-`, 空白）が必須
