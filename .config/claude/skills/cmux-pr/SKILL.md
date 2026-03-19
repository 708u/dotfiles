---
name: cmux-pr
description: >-
  現在のブランチの GitHub PR を cmux のブラウザペインで
  右側に表示する。「PR 見せて」「PR 開いて」「PR 表示」
  「cmux で PR」「横に PR」で使用。
user_invocable: true
---

# cmux-pr

現在のブランチに対応する GitHub PR を cmux の
ブラウザペインに表示する。

## 手順

### 1. PR 番号とリポジトリ情報を取得

会話の文脈から PR 番号が明確な場合はスキップする。

不明な場合のみ以下を実行する:

```bash
gh pr view --json number -q '.number'
gh repo view --json owner,name \
  -q '"\(.owner.login)/\(.name)"'
```

PR が存在しない場合はユーザーに報告して終了する。

### 2. workspace の構成を確認

`cmux tree` はフォーカス中のwindowのツリーを返す。
複数windowが存在する場合、呼び出し元と異なるwindowの
ツリーが返される可能性がある。`--workspace` を指定して
呼び出し元のworkspaceに限定する:

```bash
cmux tree --workspace "$CMUX_WORKSPACE_ID"
```

### 3. ブラウザで PR を開く

surface の総数（種類を問わず）で分岐する。

**surface が 2 つ以上の場合:**
既存の surface に browser tab を追加する。
browser surface があればそれを使い、なければ
いずれかの surface を指定する:

```bash
cmux browser --surface <surface-ref> \
  tab new "https://github.com/{owner}/{repo}/pull/{number}"
```

**surface が 1 つのみの場合:**
右側に新しい pane を作成する:

```bash
cmux new-pane --type browser --direction right \
  --url "https://github.com/{owner}/{repo}/pull/{number}"
```

### 4. 完了報告

開いた PR の URL を表示する。
