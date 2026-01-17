# claude global rules

## 自然言語生成

- 絵文字を利用しないこと
- 不必要な強調表現を控えること
- 仕様について文書を書くとき、指示を受けている場合を除き不要な文脈の注釈を入れないこと
  - 例: DBのtable設計時、tableやcolumn名について言及しただけでメンテナンスコストが削減できる、等を箇条書きで列挙する

## GitHub PR操作の注意事項

### PR update

重要: PR更新には `gh pr edit` ではなく  `gh api repos/708u/twig/pulls/${PR_NUMBER} -X PATCH` を使うこと。
理由: gh pr editは deprecatedになっているため

```txt
⏺ Bash(gh pr edit 86 --body "## Overview…)
  ⎿  Error: Exit code 1
     GraphQL: Projects (classic) is being deprecated in favor of the new Projects experience, see:
     https://github.blog/changelog/2024-05-23-sunset-notice-projects-classic/.
     (repository.pullRequest.projectCards)
```

### failしたCIの修正をするとき

修正をcommitしpushした後、ciをwatchすること。failした場合、原因を調査し、再帰的に修正されるまで対応すること。

### descriptionを書くとき

PR番号を書くときは、必ず文章前後に空白を入れること。
理由: 前後空白をいれないとgithub上でリンクとして扱われずクリックできないため

```txt
この作業は #1 に関連します。
```

### PR更新時の重要な確認手順

- **必ずPR番号を明示的に確認すること**

```bash
# 正しい方法
PR_INFO=$(gh pr view --json number,title,body)
PR_NUMBER=$(echo $PR_INFO | jq -r '.number')
echo "現在のブランチのPR番号: #$PR_NUMBER"
```

- **PR番号の確認を怠ると、別のPRを誤って更新してしまう**
  - `gh pr view`の出力からPR番号を必ず抽出する
  - ブランチ名からの推測や仮定は絶対にしない
  - 更新前に必ずユーザーに確認を取る

- **ミスの教訓（2025-06-27）**
  - PR #8191を誤って更新してしまった事例
  - 原因：`gh pr view`の結果を見たが、PR番号の確認を怠った
  - 対策：上記の確認手順を必ず実行する

### PR上にcommentするとき

**重要**: 必ず自分自身がclaude codeであることをcommentに含めること

## Asana API操作の知見

### タスク検索の注意点

- asana_typeahead_searchでタスクIDを直接検索してもヒットしないことがある
- タスクIDが分かっている場合はasana_get_taskを直接使うのが確実なのだ

### サブタスク作成のポイント

- asana_create_taskでparentパラメータを指定すればサブタスクになる
- サブタスクは自動的に親タスクのプロジェクトを継承しない（projectsが空配列）
- 作成者は自動的にフォロワーになるのだ

### 一括操作の効率化

- 複数のサブタスクを作成する場合、Taskツールを使って一括処理すると効率的
- asana_get_tasksでparentパラメータを使えば、特定タスクの全サブタスクを取得できる

### アサイン時の動作

- assigneeに"naoya.uda"のような文字列を指定すると、自動的にユーザーGIDに変換される
- アサインすると自動的に「最近の割り当て」セクションに配置される
- アサインされたユーザーは自動的にフォロワーになる

### タスク更新時のフォーマット

- notesフィールドはMarkdown形式で記述できる
- 改行は\nで表現される
- 見出しや箇条書きも使えるのだ

### エラーハンドリング

- 存在しないタスクIDでもasana_get_taskは正常に動作する（エラーにならない）
- 権限がない場合のエラーハンドリングも重要なのだ

## テストコードの修正時

- **重要: 修正したテストコードは必ず再実行して、テストが通ることを確認します**
- テストが失敗したとき、必ずテストが通るような変更を加えることは禁止

## コードベースにimport pathを足すとき

**import pathとコード追記を同時に行う必要があります。**
理由: コード変更後にpost run hookでformatterが走るので、使用されないimport pathは即座に消されてしまうため。

## git操作

### commit時

**重要: co-authorにclaudeを含めないこと**
理由: 作業者が不明瞭になる

## markdownの変更時

markdownlintの指摘事項に抵触しないようにmarkdownを変更します。

例: コードブロックを利用するときは必ず言語を指定

```txt
hello world
```

例: MD013/line-length を遵守します。

```txt
[Expected: 80; Actual: 108]
```

## chrome mcp

### 操作

Claude for Chrome MCPを利用するとき、一つのブラウザ操作ごとに Task で
サブエージェントに委譲すること。これにより、メインコンテキストを節約できる。

注意:

- chrome操作以外の処理をTaskに依頼しないこと
- 複数の操作を一度に依頼しないこと

## cli

### rmを使うとき

-f を使うこと。
理由: rm のみの場合、対話的な実行になり、実行できないため
