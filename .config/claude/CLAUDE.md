# claude global rules

## 基本方針

ユーザーの指示や指摘に対してより良い方法がある場合、
必ず代替案を提案すること。
過度にユーザーに寄り添わず、建設的に批判する。
技術的根拠を示した上で反論・提案を行う。

## 自然言語生成

- 絵文字を利用しないこと
- 不必要な強調表現を控えること
- 形容詞を使用しないこと
- 相関関係を因果関係として断定しないこと
  - 因果関係を主張する場合は根拠を示すこと
- 仕様について文書を書くとき、指示を受けている場合を除き不要な文脈の注釈を入れないこと
  - 例: DBのtable設計時、tableやcolumn名について言及しただけで
    メンテナンスコストが削減できる、等を箇条書きで列挙する

### 差別用語の禁止

差別的な含意を持つ語を、文章・コメント・識別子・サンプルデータに
使わない。中立な語へ置き換える。

置き換え例:

- 「ダミー」→「サンプル」(仮置きの意味なら「プレースホルダ」)
- master / slave → primary / replica
- whitelist / blacklist → allowlist / denylist

理由:

- 差別的な含意を持つ語の使用を避ける

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

### PR初回作成時のデフォルト

PRを初めて作成するときは、以下をデフォルトとする:

- draft として作成する (`draft: true`)
- assignee, reviewer を誰も指定しない

ユーザーから明示的な指示があったときのみ、
open での作成やアサインを行う。

理由:

- 初回作成時点ではレビュー依頼の準備が整っていないことが多い
- 意図しない通知やレビュー依頼を避ける

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

### PR description編集時の追記内容の保全

PR descriptionを編集 (update) するときは、必ず以下の手順を踏むこと:

1. 直前に `mcp__github__get_pull_request` で**最新のdescriptionを取得**する
2. 取得したdescriptionと、自分が前回編集した内容を比較し、
   **他者 (ユーザー、レビュアー、bot等) による追記がないか確認**する
3. 追記があれば、新しいdescriptionに**必ずその追記内容を盛り込んだうえで**更新する

理由:

- レビュー過程でユーザーやレビュアーがdescriptionに加筆することがある
- 追記を見落として上書きすると、レビュー文脈や合意事項が失われる
- 自分が編集する直前にfetchしないと、ローカルキャッシュ的な
  古いdescriptionで上書きしてしまう

確認なしに上書きするのは禁止。追記が無いことを確認したうえで編集すること。

### failしたCIの修正

CI jobやworkflow自体を修正した場合のみ適用。
通常のコード変更はlocalのtestで完結させる。

修正をcommit/pushした後、CIをwatchすること。
failした場合、原因を調査し、再帰的に修正されるまで対応すること。

### PR上にcommentするとき

必ず自分自身がclaude codeであることをcommentに含めること。

## git操作

### branch 作成時は twig を使う

branch を作成するときは worktree を使う。
`git switch -c` や `git checkout -b` で直接 branch を切らない。

着手前に必ず `/twig:twig-guide` skill を読み、
twig の操作を確認してから実装する。

twig で扱う主な操作:

- 新規 branch の worktree 作成
- 変更を別 branch へ移動 (carry)
- merged worktree の削除

理由:

- branch 切り替え時に stash が不要になる
- 複数 branch を並行して作業できる

## コード編集

### 実装作業のsubagent委譲（Fable 5のみ）

main sessionのmodelがFable 5のときのみ有効。
それ以外のmodelでは通常どおり自分で実装する。

コードの実装作業（ファイル編集、commit、push、PR作成）は
自分で直接行わず、`model: "sonnet"` を指定したsubagentに
委譲する。

- 委譲するのは実装作業のみ。調査、設計、方針決定、
  subagentへの指示書作成はmain sessionで行う
- subagentには背景、変更内容、検証方法、完了条件を
  具体的に指示する
- PR作成を含む場合は github-pr-creator agent を
  `model: "sonnet"` で起動する

理由:

- 実装はSonnet 5で品質が担保できるためコストを抑えられる
- main sessionのcontextを調査・レビューに温存できる

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

### コメント記述ガイドライン

言語非依存の方針。語調・表記は「自然言語生成」に従う。

#### 自己完結を理想とする

コメントを他システム・他ファイル・CIジョブ名・定数値など、
外部に存在する知識へ依存させない。対象の改名や廃止で
コメントが陳腐化する。事実はそれが属する単一情報源に置く。

悪い例 (CIジョブ名に結合):

```go
// release-prod ジョブのタグ照合で参照する
const releaseTag = "stable"
```

良い例 (結合を断ち削除):

```go
const releaseTag = "stable"
```

結合をどうしても残す場合は次節に従う。

#### 意図的な相互参照は NOTE: を付ける

外部への結合を残す場合は `NOTE:` を付け、意図的な相互参照と
分かるようにする。印が無い参照は、保守者が陳腐化した
コメントと区別できない。

悪い例 (印が無く意図が伝わらない):

```go
// migration 0042 と列順を一致させる
var columns = []string{"id", "name", "email"}
```

良い例 (NOTE: で意図的と明示):

```go
// NOTE: migration 0042 と列順を一致させる
var columns = []string{"id", "name", "email"}
```

#### what ではなく why を書く

処理・型・シグネチャから読み取れることは説明しない。
自明な struct field やゲッターにコメントを付けない。
判断の理由や前提を書く。

悪い例 (型から自明):

```go
// ユーザーのIDを返す
func (u User) ID() int { return u.id }
```

良い例 (why を書く):

```go
// 認証前は id が 0 になりうるため呼び出し側で検証する
func (u User) ID() int { return u.id }
```

#### 値や識別子を二重化しない

他所で定義された値や識別子をコメントに書き写さない。
定義が変わるとコメントだけ古くなる。

悪い例 (定義値を二重化):

```go
// 上限は 30 秒
const maxTimeout = 30 * time.Second
```

良い例 (定義に語らせる):

```go
const maxTimeout = 30 * time.Second
```

#### 投機的な将来予測を書かない

「将来こう拡張できる」等の予測を書かない。
実装され検証された事実だけを残す。

悪い例 (将来予測):

```go
// 将来は複数リージョンに拡張できる
func deploy(region string) error { return nil }
```

良い例 (現在の事実のみ):

```go
func deploy(region string) error { return nil }
```

#### 実装変更時に doc コメントを更新する

実装を変えたら doc コメントも更新し、実装と一致させる。
古い説明は誤情報になる。

悪い例 (実装と不一致):

```go
// 結果を昇順で返す
func sorted() []int { return descending() }
```

良い例 (実装と一致):

```go
// 結果を降順で返す
func sorted() []int { return descending() }
```

#### 密度・語調は周囲のコードに合わせる

コメントの量と語調を周囲のコードに揃える。

悪い例 (周囲は無コメントなのに冗長):

```go
// 2つの整数を受け取り、その和を返す関数である
func add(a, b int) int { return a + b }
```

良い例 (周囲に合わせ省略):

```go
func add(a, b int) int { return a + b }
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

### JSON parse

JSONのパース・フィルタリングにはjqを使うこと。
pythonのワンライナーは使わない。

必ず `-c` (compact output) を付けること。
意味の解釈が目的のときは `@tsv` を使うこと。

理由:

- jqの方が簡潔で可読性が高い
- pythonは自由度が高すぎるため処理を制限する
- `-c` で改行・インデントを除去しトークン数を削減
- `@tsv` は構造情報を落として値だけ出力するため
  内容を読んで判断する用途でさらにトークン効率が良い

### sleep

sleepの時間をバックオフしないこと。常に短い時間を適用して、確認したい事項に変動があるまで繰り返し実行すること

### claude code remote environment cleanup

不要なRemote Control環境を削除するコマンド:

```bash
TOKEN=$(security find-generic-password -s "Claude Code-credentials" -w | python3 -c "import sys,json; print(json.load(sys.stdin)['claudeAiOauth']['accessToken'])")
curl -X DELETE "https://api.anthropic.com/v1/environments/bridge/{env_id}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "anthropic-beta: environments-2025-11-01"
```

env_idは `.claude/settings.local.json` の `remote.defaultEnvironmentId` で確認できる。削除後は `settings.local.json` のremote設定も削除すること。

注意: GETによる一覧取得APIは2026-03時点で動作しない（betaヘッダーの矛盾エラー）。DELETEは動作する。
