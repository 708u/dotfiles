# claude global rules

## 自然言語生成

- 絵文字を利用しないこと
- 不必要な強調表現を控えること
- 仕様について文書を書くとき、指示を受けている場合を除き不要な文脈の注釈を入れないこと
  - 例: DBのtable設計時、tableやcolumn名について言及しただけで
    メンテナンスコストが削減できる、等を箇条書きで列挙する

## GitHub操作

### PR作成・更新

GitHub MCP tools
(`mcp__github__create_pull_request`,
`mcp__github__update_pull_request`) を使うこと。

`gh` CLIの `--body` にヒアドキュメントを埋め込まないこと。

理由:

- シェルエスケープの問題と可読性低下を回避
- `gh pr edit` はProjects Classic廃止でエラーになる
- MCP toolsはパラメータを構造化データとして渡すため
  エスケープ不要

### PR更新時の確認手順

PR番号を明示的に確認すること。

```bash
gh pr view --json number -q '.number'
```

注意点:

- `gh pr view`の出力からPR番号を必ず抽出する
- ブランチ名からの推測や仮定は絶対にしない
- 更新前に必ずユーザーに確認を取る
- `gh pr view --json` で `body` を含めると制御文字で
  jqパースが失敗するため、bodyは別途取得すること

### failしたCIの修正

CI jobやworkflow自体を修正した場合のみ適用。
通常のコード変更はlocalのtestで完結させる。

修正をcommit/pushした後、CIをwatchすること。
failした場合、原因を調査し、再帰的に修正されるまで対応すること。

### PR上にcommentするとき

必ず自分自身がclaude codeであることをcommentに含めること。

## git操作

## コード編集

### テストコード修正時

- 修正したテストコードは必ず再実行して、テストが通ることを確認する
- テストが失敗したとき、テストが通るような変更を加えることは禁止

### markdown変更時

markdownlintの指摘事項に抵触しないようにmarkdownを変更する。

コードブロックを利用するときは必ず言語を指定:

```txt
hello world
```

MD013/line-lengthを遵守する:

```txt
[Expected: 80; Actual: 108]
```

## ツール操作

### chrome mcp

Claude for Chrome MCPを利用するとき、一つのブラウザ操作ごとにTaskで
サブエージェントに委譲すること。これにより、メインコンテキストを節約できる。

注意:

- chrome操作以外の処理をTaskに依頼しないこと
- 複数の操作を一度に依頼しないこと

### cli

rmを使うときは-fを使うこと。

理由: rmのみの場合、対話的な実行になり、実行できないため
