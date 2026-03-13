---
name: catchup-branch
description: >-
  現在のブランチに main の最新を取り込み push する。
  git fetch → main を merge → コンフリクト解消 → push を
  自動実行する。「ブランチ同期」「sync」「main に追従」
  「リモートと合わせたい」「最新にして push したい」で使用。
user_invocable: true
---

# catchup-branch

現在のブランチに main の最新を取り込み、push まで完了させる。

## 処理フロー

各ステップの結果を確認してから次に進むこと。

### 1. 事前確認

```bash
git status
git branch --show-current
```

- 現在のブランチ名を把握する
- detached HEAD の場合は中断してユーザーに報告する
- main ブランチ上にいる場合は pull → push のみ行う

### 2. 未コミット変更の退避

未コミットの変更（staged / unstaged / untracked）が
ある場合、stash で退避する。

```bash
git stash push -u -m "catchup-branch: auto stash"
```

変更がない場合はスキップする。
stash したかどうかを記憶しておく。

### 3. main の最新を取得

```bash
git fetch origin main
```

### 4. main を現在のブランチに merge

```bash
git merge origin/main
```

コンフリクトが発生しなければステップ 6 に進む。

### 5. コンフリクト解消

merge でコンフリクトが発生した場合:

1. `git diff --name-only --diff-filter=U` で
   コンフリクトファイルを一覧する
2. 各ファイルのコンフリクト箇所を Read で確認する
3. ローカル側・リモート側の変更意図を読み取り、
   両方の意図を活かすマージを行う
   - 意図が競合する場合はユーザーに判断を仰ぐ
4. 解消後、`git add` して `git commit` する

### 6. push

```bash
git push origin <current-branch>
```

upstream 未設定の場合:

```bash
git push -u origin <current-branch>
```

### 7. stash の復元

ステップ 2 で stash した場合、復元する。

```bash
git stash pop
```

pop でコンフリクトが発生した場合は、
ステップ 5 と同じ手順で解消する。

### 8. 完了報告

```bash
git status
git log --oneline -3
```

報告内容:
- ブランチ名
- コンフリクトの有無と解消内容（あれば）
- push 先
- stash の復元結果（あれば）
