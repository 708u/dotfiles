---
description: 指示を元にpromptファイルを作成し、worktreeを作成してcmuxで開く
allowed-tools: Write, Bash(twig add:*), Bash(cmux:*), Bash(git submodule:*)
argument-hint: [branch-name] [指示内容...] [with /command...]
---

# cmux-spawn-worktree-task

指示書やセッションの文脈を元に`.twig-claude-prompt-<worktree-name>.sh`を作成し、
`twig add --carry --file`で新しいworktreeに転送、最後にcmuxで新しいworkspaceを作成して実行する。

**並列実行対応**: このコマンドは複数同時に実行可能。ファイル名にworktree名を含むため
各worktreeで一意となり、`--carry --file`で個別に転送できる。

## 引数（すべてオプション）

- ブランチ名は指定がなければ自動推察する
- 指示内容は指定がなければセッションの文脈から推察する
- `with /command` 形式でコマンドを指定すると、prompt内でそのコマンドを呼び出す
  - 例: `/cmux-spawn-worktree-task feat/new with /prepare-pr`
  - 複数指定可: `with /command1 /command2`

## コンテキスト

### twig CLI

twigコマンドの使用方法を把握するため、以下のスキルを必ず実行すること

/twig:twig-guide

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
   - 例: `feat/add-user-auth`, `refactor/config-loader`
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
   - 計画ファイルがある場合、ファイルパスではなく**内容全体**を
     ニュアンスを変えずにそのまま指示に含める
   - 要約・省略・言い換えは禁止。原文のまま全文を転記すること
   - 理由: 新しいworktreeには計画ファイルが存在しないため
4. **編集対象ファイルの特定（必須）**: タスクで編集が必要な
   ファイルを特定する
   - セッションの会話履歴から編集対象ファイルを抽出する
   - 計画内容に記載されているファイルパスを抽出する
   - 特定したファイルは指示内に `@path/to/file` 形式で含める
   - 以下のいずれかに該当すれば確認なしで決定する:
     - git diffに変更ファイルがあり単一の機能領域に収まる
     - 計画ファイルにファイルパスが明記されている
     - セッション会話から編集対象が一意に特定できる
   - 上記いずれにも該当しない場合のみ
     AskUserQuestionで確認する
5. 指示内容を決定する。以下の構成要素を整理する:
   - preRun（オプション）: タスク開始前に実行するシェルコマンド
   - claudeへの指示: 新しいworktreeで実行したいタスクの説明
   - 編集対象ファイル（必須）: `@path/to/file` 形式のファイル参照
   - postRun（オプション）: タスク完了後に実行するシェルコマンド
6. **確認の要否判定**: 以下の条件で確認をスキップできる。
   該当しない場合のみAskUserQuestionで確認する
   - 確認なしで進める条件（いずれか1つ以上を満たす）:
     - 引数で指示内容が明示的に渡されている
     - セッション中にplan modeで計画を策定済み
     - セッション会話から単一の明確なタスクが特定でき、
       かつ編集対象ファイルも特定できている
   - 確認が必要な条件（いずれか1つでも該当すれば確認する）:
     - セッション履歴なし + 引数なし + git statusのみ
       （推察の根拠が弱い）
     - 複数タスクが混在し、どれをworktreeに切り出すか
       意図が分岐する
     - 編集対象ファイルが全く特定できない

### 3. promptファイル内容の準備とプレビュー

指示内容を元に`.twig-claude-prompt-<worktree-name>.sh`ファイルの内容を準備する。
実際のファイル書き込みはステップ4.1で行う。

**ファイル名の形式**:

ファイル名は `.twig-claude-prompt-<worktree-name>.sh` とする。
worktree名を含めることで、複数のcmux-spawn-worktree-taskを並列実行しても
ファイル名が衝突しない。

ファイル形式はシェルスクリプト形式で、コマンドとして実行可能な状態にする。
先頭行には必ずshebangを記述する:

```bash
#!/bin/bash
```

**必須 preRun: Claude Code初期設定**:

Claude Codeが新しいworktreeで起動したとき、trust dialogを
スキップして自動的に作業を開始できるよう、以下のスクリプトを
promptファイルの先頭に必ず含める。
permission modeはclaudeコマンドの`--permission-mode`オプションで
指定するため、settings.jsonの変更は不要:

```bash
# CLAUDECODE環境変数のunset
# 親のClaude Codeプロセスから継承されると、子プロセスが
# 正常に起動しないため必ずunsetする
unset CLAUDECODE

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

- セッション中にplan modeで作成した計画がある場合、
  ニュアンスを変えずに**内容全体**をそのまま指示に含める
- 要約・省略・言い換えは禁止。原文のまま全文を転記すること
- `@path/to/plan.md` のようなファイルパス参照は**使用しない**
- 理由: 新しいworktreeには計画ファイルが存在せず、参照が解決できないため
- 計画内容はそのままテキストとして指示に埋め込む

**編集対象ファイルの参照（必須）**:

新しいworktreeで起動するClaude Codeがセッション開始時点で編集対象ファイルを
読み込んだ状態にするため、以下を必ず実行する:

- 編集対象ファイルは必ず `@path/to/file` 形式で指示に含める
- これにより、新しいセッションは開始時点で編集対象ファイルをコンテキストに持つ
- ファイルパスはクォートしない（`'`, `"`, `` ` `` は禁止）
- 正しい例: `@path/to/file.ts`
- 間違い例: `"@path/to/file.ts"`, `'@path/to/file.ts'`, `` `@path/to/file.ts` ``
- 注意: 計画ファイルやセッション固有のファイルは参照せず、内容を直接含める

**必要なスキルのロード**:

タスク実行に必要なスキルが存在する場合、指示内に必ずスキル呼び出しを含める:

- 形式: `/skill-name` または `/plugin:skill-name`
- 新しいworktreeで起動するClaude Codeが適切なコンテキストを持つために必要
- 例: git worktree操作が必要な場合は `/twig:twig-guide` を指示に含める

**with指定コマンドの呼び出し**:

引数で`with /command`形式でコマンドが指定された場合、指示内にそのコマンド呼び出しを
含める。コマンドの性質に応じて適切な箇所に配置する:

- `/prepare-pr`, `/commit-push-update-pr` → 完了時の手順に含める
- `/review`, `/investigate` → メインタスクとして最初に実行するよう指示

**claudeコマンドの記述ルール**:

- `claude` の後に `\` で改行してから引数を記述する
- 理由: 可読性向上のため
- `--permission-mode acceptEdits` を必ず指定する
- 理由: settings.jsonを変更せずにCLIオプションで
  permission modeを制御するため

```bash
#!/bin/bash

# 例1: preRun/postRunあり
npm install
claude \
  --permission-mode acceptEdits \
"この機能を実装してください..."
make build

# 例2: claudeのみ
claude \
  --permission-mode acceptEdits \
"バグを修正してください..."

# 例3: 複数行の指示
pnpm install
claude \
  --permission-mode acceptEdits \
"以下の要件を満たすAPIエンドポイントを実装してください:
- GET /users でユーザー一覧を取得
- POST /users で新規ユーザーを作成
- エラーハンドリングを適切に行う"
pnpm run test

# 例4: ファイルパスを含む指示
claude \
  --permission-mode acceptEdits \
@path/to/target.ts を修正してください

# 例5: 計画内容を直接含める（plan modeで設計した場合）
claude \
  --permission-mode acceptEdits \
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
1. /simplify を呼び出してコードを整理
2. /commit-push-update-pr を呼び出してPRを作成・更新
3. .twig-claude-prompt-<worktree-name>.sh を
   .completed-twig-claude-prompt.sh にリネーム"
```

**並列実行の判定（必須）**:

promptの指示内容を確定した後、1つの問題を複数の独立した
作業に分割できるか判定する。以下のいずれかに該当すれば
Agent Team（TeamCreate + Task）による並列実行を指示に含める。

判定基準:

- 互いに依存しない独立したサブタスクが2つ以上ある
  - 例: テスト作成とドキュメント作成
  - 例: フロントとバックエンドの独立した変更
- 同一作業でも編集対象ファイルが分割可能
  - 例: 複数ファイルへの同種修正をファイル単位で分担
  - 例: 各モジュールへの型定義追加

該当する場合、claudeへの指示に以下を含める:

1. TeamCreateでチームを作成する
2. Taskで各サブタスクをチームメイトに委譲する
3. 全チームメイトの完了を待ち、整合性を確認する
4. 整合性確認後にcommitする
5. 依存関係がある場合はaddBlockedByで管理する

該当しない場合は、例1〜5の形式でpromptを作成する。

```bash
# 例6: Agent Teamで並列実行する場合
claude \
  --permission-mode acceptEdits \
"以下のタスクをAgent Teamで並列実行してください。

## 概要
ユーザー管理機能を実装する。

## 並列実行の指示
TeamCreateでチームを作成し、以下のサブタスクを
それぞれTaskでチームメイトに委譲してください。

### サブタスク1: APIエンドポイントの実装
@src/api/users.ts を新規作成し、
GET /users と POST /users を実装する。

### サブタスク2: コンポーネントの実装
@src/components/UserList.tsx を新規作成し、
ユーザー一覧表示コンポーネントを実装する。

## 完了条件
- 全チームメイトの完了を待ち整合性を確認する
- 依存関係がある場合はaddBlockedByで管理
- 整合性確認後にcommitする

完了したら:
1. /simplify を呼び出してコードを整理
2. /commit-push-update-pr でPRを作成・更新
3. .twig-claude-prompt-<worktree-name>.sh を
   .completed-twig-claude-prompt.sh にリネーム"
```

**完了時の手順**:

claudeへの指示の最後に、以下の完了手順を必ず含める:

1. 作業完了後、`/simplify` を呼び出してコードを整理する
2. 必要に応じて `/commit-push-update-pr` を呼び出す
3. `.twig-claude-prompt-<worktree-name>.sh` を
   `.completed-twig-claude-prompt.sh` にリネームする

```bash
# 例: 完了時の手順を含む指示
claude \
  --permission-mode acceptEdits \
"機能を実装してください。完了したら:
1. /simplify を呼び出してコードを整理
2. /commit-push-update-pr を呼び出してPRを作成・更新
3. .twig-claude-prompt-<worktree-name>.sh を
   .completed-twig-claude-prompt.sh にリネーム"
```

**PRの向き先**:

ユーザーが明示的にsource branchを指定してworktreeを作成する場合のみ適用:

- PRの向き先は指定された派生元ブランチにする
- 指示内にbase branchを明記すること
- 例: 「`feat/base`から派生」と指定された場合、PRは`feat/base`に向けて作成する
- source指定がない場合（デフォルト）はmainに向けてPRを作成する

**重要**: 以下のコマンドをpreRun/postRunに含める場合は、
必ずAskUserQuestionで確認すること:

- `rm`, `mv`, `chmod`, `chown`
- `git reset --hard`, `git clean -f`
- その他破壊的な操作

### 4. promptファイル作成・worktree作成・cmuxで開く

#### 4.1 promptファイルの作成

Writeツールを使用して、現在のworktreeにpromptファイルを作成する:

```txt
Write to: .twig-claude-prompt-<worktree-name>.sh
```

ファイル名にworktree名を含めることで、複数のcmux-spawn-worktree-taskを並列実行しても
ファイル名が衝突しない。

#### 4.2 worktree作成（carryでファイル転送）

Bashで `twig add` を実行してworktreeを作成する。`--carry --file` オプションで
作成したpromptファイルのみを新しいworktreeに転送する:

```bash
twig add <branch-name> --carry --file ".twig-claude-prompt-<worktree-name>.sh" -q
```

このコマンドにより:

- 新しいworktreeが作成される
- promptファイルのみが新しいworktreeに移動（carryされる）
- ソースworktreeからpromptファイルは削除される
- `-q` オプションで作成されたworktreeのパスが出力される

#### 4.3 cmuxで新しいworkspaceを作成

`twig add -q` の出力からworktreeパスを取得し、
`cmux new-workspace` でそのディレクトリに移動して
promptスクリプトを実行する新しいworkspaceを作成する。
`cmux new-workspace` は `OK <workspace-id>` 形式で
新しいworkspace IDを返すため、これを取得して
`cmux rename-workspace --workspace <id>` に渡す。

`--workspace` を省略すると `CMUX_WORKSPACE_ID`
（呼び出し元のworkspace）がリネームされるため、
必ず明示的に指定すること。

以下の3ステップを順番に実行する。
変数への代入は禁止。各コマンドのstdoutに出力される
IDを読み取り、次のコマンドの引数に直接指定すること。

1. `cmux new-workspace --command "..."` を実行する。
   `--command` にはworktreeへのcdとpromptスクリプトの
   実行を指定する。stdoutに `OK <workspace-id>` が
   出力されるので、workspace-idを控える。
2. `cmux rename-workspace` を実行する。
   `--workspace` に手順1で得たworkspace-idを指定し、
   workspace名を設定する。
3. `cmux new-split right` を実行する。
   `--workspace` に手順1で得たworkspace-idを指定する。
   stdoutに `OK <surface-id>` が出力されるので、
   続けて `cmux send` を実行する。
   `--workspace` と `--surface` にそれぞれのIDを指定し、
   worktreeへのcdと`gra`の実行を送信する。

**workspace名の命名規則**:

- ブランチ名の `/` を `-` に置換した名前を使用する
- prefixは不要。作業内容が一目で分かる名前にする
- 例: `feat/add-user-auth` → `feat-add-user-auth`
- 例: `fix/null-pointer` → `fix-null-pointer`
- 例: `refactor/config-loader` → `refactor-config-loader`

このコマンドにより:

- cmuxに新しいworkspaceが作成される
- 左pane: worktreeでpromptスクリプトが実行され、
  Claude Codeが自動的に起動する
- 右pane: 同じworktreeディレクトリで`gra`が実行される
- workspace名から作業内容を一目で識別できる

## 例

```bash
# 自動推察でブランチ名と指示を決定
/cmux-spawn-worktree-task

# ブランチ名を指定
/cmux-spawn-worktree-task feat/new-feature

# ブランチ名と指示内容を指定
/cmux-spawn-worktree-task feat/new-feature "ユーザー認証機能を実装してください"
```

$ARGUMENTS
