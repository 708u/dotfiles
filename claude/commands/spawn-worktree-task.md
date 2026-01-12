---
description: 指示を元に.twig-claude-prompt.shを作成し、worktreeを作成してタスクを開始
allowed-tools: Write, Task(twig-operator:*), Bash
argument-hint: [branch-name] [指示内容...]
---

# spawn-worktree-task

指示書やセッションの文脈を元に`.twig-claude-prompt.sh`を作成し、新しいworktreeを作成して
そのファイルをcarryし、最後にVS Codeで開く。

## 引数（すべてオプション）

- ブランチ名は指定がなければ自動推察する
- 指示内容は指定がなければセッションの文脈から推察する

## コンテキスト

### 現在のgit status

!`git status --short`

### 変更内容

!`git diff --stat`

## タスク

### 1. ブランチ名の決定

引数でブランチ名が指定されていない場合は、以下の手順で決定する。

1. 現在のセッションの作業内容（会話履歴）を確認する
2. git statusの変更ファイルから作業内容を推察する
3. Conventional Commits形式のprefixを使用してブランチ名を決定する
   - 形式は `<prefix>/<kebab-case-name>`
   - 例として `feat/add-user-auth`, `fix/null-pointer`, `refactor/config-loader`
4. 以下の条件を満たす場合は確認なしでブランチ名を決定する
   - セッション内で1つのタスクのみ議論している
   - 変更ファイルが1つの機能領域に集中している
   - 目的が明確（機能追加/バグ修正/リファクタリング等）
5. 以下の場合のみAskUserQuestionで確認する
   - セッション内で複数の異なるタスクに言及している
   - 変更ファイルが複数の機能領域にまたがり目的が不明確
   - git statusのみで作業内容が推察できない（セッション履歴なし）

### 2. 指示内容の決定

引数で指示内容が指定されていない場合は、以下の手順で決定する。

1. 現在のセッションの作業内容（会話履歴）を確認する
2. git statusの変更ファイルから作業内容を推察する
3. **計画ファイルの確認**: セッション中にplan modeで設計した内容があるか確認する
   - 計画ファイルがある場合、ファイルパスではなく**内容全体**を指示に含める
   - 理由: 新しいworktreeには計画ファイルが存在しないため
4. 指示内容を決定し、AskUserQuestionで確認する
   - preRun（オプション）: タスク開始前に実行するシェルコマンド
   - claudeへの指示: 新しいworktreeで実行したいタスクの説明
   - postRun（オプション）: タスク完了後に実行するシェルコマンド

### 3. .twig-claude-prompt.shファイルの作成

指示内容を元に`.twig-claude-prompt.sh`ファイルを作成する。

ファイル形式はシェルスクリプト形式で、コマンドとして実行可能な状態にする。
先頭行には必ずshebangを記述する:

```bash
#!/bin/bash
```

**必須preRun: Claude Code初期設定**:

Claude Codeが新しいworktreeで起動したとき、各種確認ダイアログをスキップして
自動的に作業を開始できるよう、以下のスクリプトを`.twig-claude-prompt.sh`の
先頭に必ず含める:

```bash
# settings.jsonの初期化（ファイル編集の自動許可）
CLAUDE_SETTING_FILE=".claude/settings.json"
if [ ! -s "$CLAUDE_SETTING_FILE" ] || ! jq empty "$CLAUDE_SETTING_FILE" 2>/dev/null; then
  echo '{}' > "$CLAUDE_SETTING_FILE"
fi
jq '. //= {} | .permissions //= {} | .permissions.defaultMode = "acceptEdits"' \
  "$CLAUDE_SETTING_FILE" > tmp.json && mv tmp.json "$CLAUDE_SETTING_FILE"

# ~/.claude.jsonへのtrust設定追加（trust dialog/onboardingのスキップ）
# 既存設定を保持しつつ、trust関連フラグのみ更新
WORKTREE_PATH="$(pwd)"
jq --arg path "$WORKTREE_PATH" '
  .projects //= {} |
  .projects[$path] = ((.projects[$path] // {}) + {
    "hasTrustDialogAccepted": true,
    "hasTrustDialogHooksAccepted": true,
    "projectOnboardingSeenCount": 1,
    "hasClaudeMdExternalIncludesApproved": true,
    "hasClaudeMdExternalIncludesWarningShown": true,
    "hasCompletedProjectOnboarding": true
  })
' ~/.claude.json > ~/.claude.json.tmp && mv ~/.claude.json.tmp ~/.claude.json
```

**計画内容の取り扱い**:

- セッション中にplan modeで作成した計画がある場合、その**内容全体**を指示に含める
- `@path/to/plan.md` のようなファイルパス参照は**使用しない**
- 理由: 新しいworktreeには計画ファイルが存在せず、参照が解決できないため
- 計画内容はそのままテキストとして指示に埋め込む

**ファイルパス参照のルール**:

- 既存のソースコードファイルを参照する場合は `@path/to/file` 形式で記述する
- ファイルパスは絶対にクォートしない（`'`, `"`, `` ` `` は禁止）
- 正しい例: `@path/to/file.ts`
- 間違い例: `"@path/to/file.ts"`, `'@path/to/file.ts'`, `` `@path/to/file.ts` ``
- 注意: 計画ファイルやセッション固有のファイルは参照せず、内容を直接含める

**claudeコマンドの記述ルール**:

- `claude` の後に `\` で改行してから引数を記述する
- 理由: 可読性向上のため

```bash
#!/bin/bash

# 例1: preRun/postRunあり
npm install
claude \
"この機能を実装してください..."
make build

# 例2: claudeのみ
claude \
"バグを修正してください..."

# 例3: 複数行の指示
pnpm install
claude \
"以下の要件を満たすAPIエンドポイントを実装してください:
- GET /users でユーザー一覧を取得
- POST /users で新規ユーザーを作成
- エラーハンドリングを適切に行う"
pnpm run test

# 例4: ファイルパスを含む指示
claude \
@path/to/target.ts を修正してください

# 例5: 計画内容を直接含める（plan modeで設計した場合）
claude \
"以下の計画に従って実装してください:

## 実装計画

### 1. データモデルの作成
- User型をsrc/types/user.tsに定義
- フィールド: id, name, email, createdAt

### 2. APIエンドポイントの実装
- GET /api/users - ユーザー一覧取得
- POST /api/users - 新規作成

### 3. テストの追加
- 各エンドポイントのユニットテスト

完了したら:
1. /commit-push-update-pr を呼び出してPRを作成・更新
2. .claude/settings.json から defaultMode 設定を削除
3. .twig-claude-prompt.sh を .twig-claude-prompt-completed.sh にリネーム"
```

**完了時の手順**:

claudeへの指示の最後に、以下の完了手順を必ず含める:

1. 作業完了後、必要に応じて `/commit-push-update-pr` を呼び出す
2. `.claude/settings.json` の `defaultMode` 設定を元に戻す
3. `.twig-claude-prompt.sh` を `.twig-claude-prompt-completed.sh` にリネームする

```bash
# 例: 完了時の手順を含む指示
claude \
"機能を実装してください。完了したら:
1. /commit-push-update-pr を呼び出してPRを作成・更新
2. .claude/settings.json から defaultMode 設定を削除
3. .twig-claude-prompt.sh を .twig-claude-prompt-completed.sh にリネーム"
```

**重要**: 以下のコマンドをpreRun/postRunに含める場合は、
必ずAskUserQuestionで確認すること:

- `rm`, `mv`, `chmod`, `chown`
- `git reset --hard`, `git clean -f`
- その他破壊的な操作

### 4. worktree作成・carry・VS Codeで開く

#### 4.1 @agent-twig-operatorでworktree作成・carry

**必須**: worktree操作は直接コマンドではなく、必ず`@agent-twig-operator`を呼び出す。

**重要: twig agentの責務範囲**:

twig agentはtwig toolを用いたgit worktreeとbranch操作のみを責務とする。
エージェントへの指示は以下の操作に限定すること:

- worktreeの作成・削除・一覧表示
- branchの作成・切り替え
- ファイルのcarry（変更の持ち越し）

タスクの内容説明、実装指示、VS Codeで開く等の操作はtwig agentに渡さない。
それらは`.twig-claude-prompt.sh`ファイルに記述してcarryで持ち越すか、別途実行する。

エージェントに対して以下を依頼する:

1. ブランチ名を指定してworktreeを作成
2. `.twig-claude-prompt.sh`をcarry対象に含める

#### 4.2 VS Codeで開く

twig agentの処理完了後、main agentが作成されたworktreeをVS Codeで開く:

```bash
code <worktree-path>
```

## 例

```bash
# 自動推察でブランチ名と指示を決定
/spawn-worktree-task

# ブランチ名を指定
/spawn-worktree-task feat/new-feature

# ブランチ名と指示内容を指定
/spawn-worktree-task feat/new-feature "ユーザー認証機能を実装してください"
```

$ARGUMENTS
