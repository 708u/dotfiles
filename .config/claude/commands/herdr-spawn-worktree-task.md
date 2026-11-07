---
description: 指示を元にpromptを作成し、worktreeを作成してherdrのworkspaceでClaude Codeを起動する
allowed-tools: Bash(twig add:*), Bash(herdr:*), Bash(jq:*), Bash(git submodule:*)
argument-hint: [branch-name] [指示内容...] [with /command...]
---

# herdr-spawn-worktree-task

指示書やセッションの文脈を元にpromptを作成し、`twig add`で新しいworktreeを作成する。herdrでそのworktreeのworkspaceを作成してClaude Codeを起動し、promptを送信する。

このコマンドは複数同時に実行できる。worktree、workspace、agentの名前はいずれもブランチ名に基づいて決定するため、並列に実行しても衝突しない。

## 引数（すべてオプション）

- ブランチ名は指定がなければ自動推察する
- 指示内容は指定がなければセッションの文脈から推察する
- `with /command` 形式でコマンドを指定すると、prompt内でそのコマンドを呼び出す
  - 例: `/herdr-spawn-worktree-task feat/new with /prepare-pr`
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
   - 目的が明確である（機能追加/バグ修正/リファクタリング等）
5. 以下の場合のみAskUserQuestionで確認する
   - セッション内で複数の異なるタスクに言及している
   - 変更ファイルが複数の機能領域にまたがり、目的が不明確である
   - git statusのみで作業内容が推察できない（セッション履歴なし）

### 2. 指示内容の決定

引数で指示内容が指定されていない場合は、以下の手順で決定する。

1. 現在のセッションの作業内容（会話履歴）を確認する
2. git statusの変更ファイルから作業内容を推察する
3. セッション中にplan modeで設計した計画ファイルがあるか確認する
   - 計画ファイルがある場合、ファイルパスではなく**内容全体**をニュアンスを変えずにそのまま指示に含める
   - 要約・省略・言い換えは禁止。原文のまま全文を転記すること
   - 理由: 新しいworktreeには計画ファイルが存在しないため
4. タスクで編集が必要なファイルを必ず特定する
   - セッションの会話履歴から編集対象ファイルを抽出する
   - 計画内容に記載されているファイルパスを抽出する
   - 特定したファイルは指示内に `@path/to/file` 形式で含める
   - 以下のいずれかに該当すれば確認なしで決定する:
     - git diffに変更ファイルがあり、単一の機能領域に収まる
     - 計画ファイルにファイルパスが明記されている
     - セッションの会話から編集対象を一意に特定できる
   - 上記のいずれにも該当しない場合のみAskUserQuestionで確認する
5. 指示内容を決定する。以下の構成要素を整理する:
   - preRun（オプション）: Claude Codeの起動前にworktreeで実行するシェルコマンド
   - claudeへの指示: 新しいworktreeで実行したいタスクの説明
   - 編集対象ファイル（必須）: `@path/to/file` 形式のファイル参照
6. ユーザーへの確認が必要かを判定する。以下の条件で確認をスキップでき、該当しない場合のみAskUserQuestionで確認する
   - 確認なしで進める条件（いずれか1つ以上を満たす）:
     - 引数で指示内容が明示的に渡されている
     - セッション中にplan modeで計画を策定済みである
     - セッションの会話から単一の明確なタスクが特定でき、かつ編集対象ファイルも特定できている
   - 確認が必要な条件（いずれか1つでも該当すれば確認する）:
     - セッション履歴なし + 引数なし + git statusのみ（推察の根拠が弱い）
     - 複数タスクが混在し、どれをworktreeに切り出すか意図が分岐する
     - 編集対象ファイルが全く特定できない

### 3. promptの作成

指示内容を元に、新しいworktreeのClaude Codeへ送るpromptを作成する。promptはファイルに書き出さず、ステップ4で `herdr agent prompt` に直接渡す。

**計画内容の取り扱い**:

- セッション中にplan modeで作成した計画がある場合、ニュアンスを変えずに**内容全体**をそのまま指示に含める
- 要約・省略・言い換えは禁止。原文のまま全文を転記すること
- `@path/to/plan.md` のようなファイルパス参照は**使用しない**
- 理由: 新しいworktreeには計画ファイルが存在せず、参照を解決できないため
- 計画内容はそのままテキストとして指示に埋め込む

**編集対象ファイルの参照（必須）**:

新しいworktreeで起動するClaude Codeがセッション開始時点で編集対象ファイルを読み込んだ状態にするため、次の規則に従う。

- 編集対象ファイルは必ず `@path/to/file` 形式で指示に含める
- これにより、新しいセッションは開始時点で編集対象ファイルをコンテキストに含んだ状態になる
- ファイルパスはクォートしない（`'`, `"`, `` ` `` は禁止）
- 正しい例: `@path/to/file.ts`
- 間違い例: `"@path/to/file.ts"`, `'@path/to/file.ts'`, `` `@path/to/file.ts` ``
- 注意: 計画ファイルやセッション固有のファイルは参照せず、内容を直接含める

**必要なスキルのロード**:

タスク実行に必要なスキルが存在する場合、指示内に必ずスキル呼び出しを含める。新しいworktreeで起動するClaude Codeは、呼び出し元のセッションで読み込んだスキルを引き継がない。

- 形式: `/skill-name` または `/plugin:skill-name`
- 例: git worktree操作が必要な場合は `/twig:twig-guide` を指示に含める

**with指定コマンドの呼び出し**:

引数で`with /command`形式でコマンドが指定された場合、指示内にそのコマンドの呼び出しを含める。配置する箇所はコマンドの種類に応じて次のように決定する。

- `/prepare-pr`, `/commit-push-update-pr` → 完了時の手順に含める
- `/review`, `/investigate` → メインタスクとして最初に実行するよう指示

**完了時の手順**:

promptの最後に、次の完了手順を必ず含める。

1. 作業完了後、`/simplify` を呼び出してコードを整理する
2. PRを作成・更新する場合は `/commit-push-update-pr` を呼び出す

タスク完了後に実行したいシェルコマンド（ビルドやテストなど）がある場合は、完了時の手順に含める。

```txt
例: 完了時の手順を含むprompt

@src/api/users.ts に GET /users と POST /users を実装してください。

完了したら:
1. /simplify を呼び出してコードを整理
2. pnpm run test を実行し、失敗があれば修正
3. /commit-push-update-pr を呼び出してPRを作成・更新
```

```txt
例: 計画内容を直接含めるprompt（plan modeで設計した場合）

以下の計画に従って実装してください:

## 実装計画

### 1. データモデルの作成
- User型を @src/types/user.ts に定義
- フィールド: id, name, email, createdAt

### 2. APIエンドポイントの実装
- GET /api/users - ユーザー一覧取得
- POST /api/users - 新規作成

### 3. テストの追加
- 各エンドポイントのユニットテスト

完了したら:
1. /simplify を呼び出してコードを整理
2. /commit-push-update-pr を呼び出してPRを作成・更新
```

**並列実行の判定（必須）**:

promptの指示内容を確定した後、1つの問題を複数の独立した作業に分割できるか判定する。以下のいずれかに該当すればAgent Team（TeamCreate + Task）による並列実行を指示に含める。

判定基準:

- 互いに依存しない独立したサブタスクが2つ以上ある
  - 例: テスト作成とドキュメント作成
  - 例: フロントエンドとバックエンドの独立した変更
- 同一作業でも編集対象ファイルを分割できる
  - 例: 複数ファイルへの同種修正をファイル単位で分担
  - 例: 各モジュールへの型定義追加

該当する場合は、claudeへの指示に次の内容を含める。

1. TeamCreateでチームを作成する
2. Taskで各サブタスクをチームメイトに委譲する
3. 全チームメイトの完了を待ち、整合性を確認する
4. 整合性の確認後にcommitする
5. 依存関係がある場合はaddBlockedByで管理する

```txt
例: Agent Teamで並列実行するprompt

以下のタスクをAgent Teamで並列実行してください。

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
```

**PRの向き先**:

ユーザーが明示的にsource branchを指定してworktreeを作成する場合のみ適用:

- PRの向き先は指定された派生元ブランチにする
- 指示内にbase branchを明記すること
- 例: 「`feat/base`から派生」と指定された場合、PRは`feat/base`に向けて作成する
- source指定がない場合（デフォルト）はmainに向けてPRを作成する

preRunや完了時の手順に以下のコマンドを含める場合は、必ずAskUserQuestionで確認すること。

- `rm`, `mv`, `chmod`, `chown`
- `git reset --hard`, `git clean -f`
- その他破壊的な操作

### 4. worktreeの作成とClaude Codeの起動

herdrのpane内（`HERDR_ENV=1`）で実行していない場合は、worktreeを作成した後にパスとpromptをユーザーに報告して終了する。

herdrのコマンドはJSONを返す。以下のステップを順番に実行し、各コマンドの出力から読み取った値を次のコマンドの引数に直接指定すること。変数への代入は禁止。

#### 4.1 worktreeの作成

```bash
twig add <branch-name> -q
```

`-q` オプションで、作成されたworktreeのパスが出力される。

#### 4.2 trust dialogのスキップ

新しいworktreeでClaude Codeを起動するとtrust dialogが表示され、promptを受け付けない。これを避けるため、`~/.claude.json` にworktreeのtrust設定を追加する。既存の設定を保持し、trust関連のフラグのみ更新する。

```bash
jq --arg path "/path/to/worktree" '
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

#### 4.3 workspaceの作成

`herdr worktree open` でworktreeのworkspaceを作成する。`--cwd` に呼び出し元のリポジトリを指定すると、作成されたworkspaceは呼び出し元と同じリポジトリのworktreeとして紐づく。`--no-focus` で呼び出し元のフォーカスを維持する。

```bash
herdr worktree open --cwd "$PWD" --path /path/to/worktree --label <workspace-name> --no-focus
```

`.result.root_pane.pane_id` がpaneのIDである。これを控えておく。paneのcwdはworktreeになっている。

#### 4.4 preRunの実行

preRunがある場合のみ実行する。終了コードを目印として表示し、表示されるまで待機する。

```bash
herdr pane run <pane-id> '<preRun>; echo "PRERUN_EXIT=$?"'
herdr pane wait-output <pane-id> --regex 'PRERUN_EXIT=[0-9]+' --timeout 600000
```

終了コードが0以外のときはClaude Codeを起動せず、`herdr pane read <pane-id> --source recent-unwrapped --lines 40` の内容をユーザーに報告して終了する。

#### 4.5 Claude Codeの起動

```bash
herdr agent start <agent-name> --kind claude --pane <pane-id> -- --permission-mode acceptEdits
```

- `<agent-name>` はworkspace名を使う。agent名は `[a-z][a-z0-9_-]{0,31}` に一致し、起動中のagentの中で一意である必要がある。32文字を超える場合は切り詰め、既存のagent名と重複する場合は末尾に `-2` などを付ける
- `--permission-mode acceptEdits` はsettings.jsonを変更せずにpermission modeを指定するため
- `agent_not_ready` が返された場合は、`herdr agent read <agent-name> --source recent-unwrapped --lines 40` で画面を確認し、ユーザーに報告して終了する

#### 4.6 promptの送信

ステップ3で作成したpromptを `herdr agent prompt` で送信する。promptに引用符や改行が含まれても崩れないよう、引用符付きのヒアドキュメントで渡す。`--wait` は付けず、送信の完了を確認した時点で終了する。

```bash
herdr agent prompt <agent-name> "$(cat <<'PROMPT'
<ステップ3で作成したprompt>
PROMPT
)"
```

`claude '<prompt>'` のようにpromptをコマンドの引数で渡す方法は使用しない。macOSでは端末の1行入力の上限 (1024 byte) を超えるコマンドを `herdr pane run` が拒否するため、計画の全文を含むpromptを送れない。`herdr agent prompt` はbracketed pasteで送信するため、この上限を受けない。

**workspace名の命名規則**:

- ブランチ名の `/` を `-` に置換した名前を使用する
- prefixは不要。作業内容が一目で分かる名前にする
- 例: `feat/add-user-auth` → `feat-add-user-auth`
- 例: `fix/null-pointer` → `fix-null-pointer`
- 例: `refactor/config-loader` → `refactor-config-loader`

このコマンドを実行すると、次の状態になる。

- herdrに新しいworkspaceが作成される
- worktreeでClaude Codeが起動し、promptを受け取って作業を開始する
- workspace名とagent名から作業内容を一目で識別できる

## 例

```bash
# 自動推察でブランチ名と指示を決定
/herdr-spawn-worktree-task

# ブランチ名を指定
/herdr-spawn-worktree-task feat/new-feature

# ブランチ名と指示内容を指定
/herdr-spawn-worktree-task feat/new-feature "ユーザー認証機能を実装してください"
```

$ARGUMENTS
