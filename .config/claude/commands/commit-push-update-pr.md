---
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git log:*), Bash(gh pr view:*)
description: git commit & push & PR description更新
---

## コンテキスト

### 現在のgit status

!`git status --short`

### ステージ済みの変更

!`git diff --staged`

### 未ステージの変更

!`git diff`

### 最近のコミット

!`git log --oneline -5`

### 現在のブランチのPR情報

git commandで取得

## タスク

上記のコンテキストを基に、以下を順番に実行してください。

### コミット

1. 変更内容を分析し、適切なファイルをステージング
2. Conventional Commits形式（feat:, fix:, refactor:, docs:, test:, chore:）でコミットメッセージを作成
3. コミット実行

### プッシュ

1. `git push -u origin <branch>` を試行

### PR description更新

PRが存在しない場合は @mcp__github__create_pull_request で新規作成。

1. github mcpの @mcp__github__get_pull_request でPR情報を取得
2. 現在のPR descriptionの内容を確認し、既存の文脈を把握
3. @mcp__github__update_pull_request でdescriptionを更新
   - @.github/pull_request_template.md のフォーマットに従う
   - 今回のコミット内容を追記しつつ、既存の記述との整合性を保つ
   - 全体として一貫したPR descriptionになるよう調整

$ARGUMENTS
