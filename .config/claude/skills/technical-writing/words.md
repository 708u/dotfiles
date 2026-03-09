# 単語の選択

## 用語の定義と一貫性

### 新しい用語の導入

新しい用語や不慣れな用語を認識したとき:

1. 既存の説明にリンクする
2. 文書内で定義する
3. 用語が多い場合は用語集にまとめる

### 一貫した用語使用

変数名を途中で変更するとコードがコンパイルされないように、
文書内で用語を変更すると読者の理解が妨げられる。

```txt
悪い例: "Protocol Buffers"と"protobufs"を混在させる
良い例: 最初に長い名前と短い名前を紹介し、以降は一方を使用
```

## 略語の適切な使用

### 初出時のルール

完全な用語を綴り、括弧内に略語を入れる。両方を太字にする:

```txt
**Telekinetic Tactile Network** (**TTN**)
```

### 使用ガイドライン

| 状況 | 対応 |
|------|------|
| 数回のみの使用 | 略語定義不要、毎回フルネーム |
| 頻繁に出現 | 初出時に定義 |
| 大幅に短くならない | 略語使用を避ける |

### 略語を定義すべきでないケース

- 文書内で2-3回しか出現しない
- 短縮効果が小さい（例: "UI" vs "User Interface"は許容）
- 読者にとって自明な略語（例: HTML, API）

## 代名詞の明確化

### 曖昧な代名詞

"it", "they", "this", "that"などの代名詞は混乱を招く。

```txt
曖昧: Python is interpreted. This makes it slower.
      → "This"が何を指すか不明確

明確: Python is interpreted. This interpretation process makes it slower.
```

### 推奨事項

1. 代名詞を使用する前に名詞を導入
2. 代名詞を名詞の5語以内に配置
3. 不明確な場合は名詞を繰り返す
4. 代名詞の後に名詞を配置して明確化

### 例

```txt
悪い例:
Be careful when using Frambus with Carambola because it doesn't work well.
→ "it"がFrambusかCarambolaか不明

良い例:
Be careful when using Frambus with Carambola because Frambus doesn't work well.
```

## 品詞の基礎

### 技術文書で重要な品詞

| 品詞 | 説明 | 例 |
|------|------|-----|
| 名詞 | 人、場所、概念、物 | Sam, server, algorithm |
| 代名詞 | 名詞の代わり | it, they, this |
| 動詞 | 動作を表す | runs, processes, returns |
| 形容詞 | 名詞を修飾 | fast server, null pointer |
| 副詞 | 動詞・形容詞を修飾 | runs quickly, very fast |
| 前置詞 | 位置関係を示す | on, within, after |
| 接続詞 | 句を繋ぐ | and, but, or |

### 単語の文脈依存性

多くの英単語は文脈により品詞が変わる:

```txt
"code" - 名詞: The code runs. / 動詞: We code daily.
"process" - 名詞: The process failed. / 動詞: Process the data.
```
