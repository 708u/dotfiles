---
name: herdr-spawn-worktree-task
description: >-
  セッションの文脈から別の作業を切り出し、新しい worktree の herdr workspace で Claude Code を起動して prompt を渡す。「worktree で別タスクを始めて」「この作業を別の Claude に任せて」「spawn worktree」で使用。
argument-hint: "[branch-name] [指示内容...] [with /command...]"
---

# herdr-spawn-worktree-task

指示書やセッションの文脈をもとにpromptを作成し、ファイルに書き出す。worktreeの作成からClaude Codeの起動、promptの送信までは `scripts/spawn.sh` が行う。

このskillは複数同時に実行できる。worktree、workspace、agentの名前はいずれもブランチ名に基づいて決まるため、並列に実行しても衝突しない。

## 引数（すべてオプション）

- ブランチ名は指定がなければ自動推察する
- 指示内容は指定がなければセッションの文脈から推察する
- `with /command` 形式でコマンドを指定すると、prompt内でそのコマンドを呼び出す
  - 例: `/herdr-spawn-worktree-task feat/new with /prepare-pr`
  - 複数指定可: `with /command1 /command2`

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

指示内容を元に、新しいworktreeのClaude Codeへ送るpromptを作成する。

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

promptの指示内容を確定した後、1つの問題を複数の独立した作業に分割できるかを判定する。以下のいずれかに該当すれば、agent teamsによる並列実行を指示に含める。agent teamsは環境変数 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` で有効にする実験的な機能であり、有効でない環境では並列実行を指示に含めない。

判定基準:

- 互いに依存しない独立したサブタスクが2つ以上ある
  - 例: テスト作成とドキュメント作成
  - 例: フロントエンドとバックエンドの独立した変更
- 同一作業でも編集対象のファイルを分割できる
  - 例: 複数ファイルへの同種の修正をファイル単位で分担
  - 例: 各モジュールへの型定義の追加

該当する場合は、claudeへの指示に次の内容を含める。

1. サブタスクごとにteammateを起動して委譲する
2. サブタスク間に依存関係がある場合は、タスクリストで依存関係を設定する
3. 全teammateの完了を待ち、整合性を確認する
4. 整合性の確認後にcommitする

使うtoolの名前はClaude Codeのバージョンによって変わるため、promptにはtool名を書かず、機能の名前で指示する。

```txt
例: agent teamsで並列実行するprompt

以下のタスクをagent teamsで並列実行してください。

## 概要
ユーザー管理機能を実装する。

## 並列実行の指示
以下のサブタスクごとにteammateを起動し、
それぞれ委譲してください。

### サブタスク1: APIエンドポイントの実装
@src/api/users.ts を新規作成し、
GET /users と POST /users を実装する。

### サブタスク2: コンポーネントの実装
@src/components/UserList.tsx を新規作成し、
ユーザー一覧表示コンポーネントを実装する。

## 完了条件
- 全teammateの完了を待ち整合性を確認する
- 依存関係がある場合はタスクリストで依存関係を設定する
- 整合性確認後にcommitする

完了したら:
1. /simplify を呼び出してコードを整理
2. /commit-push-update-pr でPRを作成・更新
```

**PRの向き先**:

ユーザーが明示的にsource branchを指定してworktreeを作成する場合のみ、次のように扱う。

- PRの向き先は指定された派生元ブランチにする
- 指示内にbase branchを明記すること
- ステップ5でscriptに `--source <派生元ブランチ>` を渡す。派生元ブランチはworktreeとしてcheckoutされている必要がある
- 例: 「`feat/base`から派生」と指定された場合、PRは`feat/base`に向けて作成する
- source指定がない場合（デフォルト）はmainに向けてPRを作成する

preRunや完了時の手順に以下のコマンドを含める場合は、必ずAskUserQuestionで確認すること。

- `rm`, `mv`, `chmod`, `chown`
- `git reset --hard`, `git clean -f`
- その他破壊的な操作

### 4. promptの書き出し

ステップ3で作成したpromptを、Writeでセッションのscratchpad directoryに書き出す。scratchpad directoryが無い環境では `/tmp` を使う。

- ファイル名は `spawn-prompt-<workspace-name>.txt` とする。workspace名はブランチ名の `/` を `-` に置換した名前である
- 拡張子は `.md` にしない。markdown向けのlintがpromptの文面にも指摘を出すため

### 5. worktreeの作成とClaude Codeの起動

```bash
~/.claude/skills/herdr-spawn-worktree-task/scripts/spawn.sh [--pre-run '<preRun>'] [--source <派生元ブランチ>] <branch-name> <promptファイルの絶対パス>
```

scriptは次の処理を行う。

1. `twig add` でworktreeを作成する。`--source` を指定した場合はtwigに渡す
2. trust dialogが表示されないよう、`~/.claude.json` にworktreeを承認済みとして登録する
3. `herdr worktree open` でworkspaceを作成する。フォーカスは呼び出し元に残る
4. preRunを指定した場合は、workspaceのpaneで実行して終了を待つ
5. `herdr agent start` でClaude Codeを `--permission-mode acceptEdits` で起動する
6. `herdr agent prompt` でpromptファイルの内容を送る

promptをコマンドの引数 (`claude '<prompt>'`) で渡さないのは、macOSでは端末の1行あたりの入力上限 (1024 byte) を超えるコマンドを `herdr pane run` が拒否するためである。`herdr agent prompt` はbracketed pasteで送るため、この上限を受けない。

### 6. 結果の報告

出力の `status` で分岐する。

| status | 意味 | 報告内容 |
| --- | --- | --- |
| `started` | Claude Codeにpromptを送った | ブランチ名、workspace、agent名 |
| `no_herdr` | herdrのpane外で実行した。worktreeの作成までで終了した | worktreeのパスとpromptファイルのパス |
| `pre_run_failed` | preRunが0以外で終了した | 終了コードと画面の末尾 |
| `agent_not_ready` | Claude Codeの起動を確認できなかった | 画面の末尾 |
| `error` | 引数の誤り、または途中の command の失敗 | 理由か失敗した command。worktree を作成したあとで失敗した場合は、残った worktree を片付けるか確認する |

`error` の原因が `herdr agent prompt` の場合、promptが届いていないとは限らない。再送する前に `herdr agent read <agent名> --source recent-unwrapped --lines 40` で画面を確認する。

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
