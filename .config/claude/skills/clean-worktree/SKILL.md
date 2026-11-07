---
name: clean-worktree
description: >-
  マージ済みの git worktree を一括削除し、対応する herdr の workspace と pane も閉じる。削除済み worktree の CWD を持つシェルが残ると mise が check_working_directory でクラッシュし続けるため、workspace と pane も合わせて閉じる必要がある。「clean worktrees」「worktree 掃除」「twig clean」「不要な worktree 削除」「古い workspace 閉じて」「merged branches 整理」や、mise がクラッシュしている・ReportCrash が重いといった状況でも使用する。
user_invocable: true
---

# Clean Worktree

マージ済み worktree を `twig clean` で削除し、対応する herdr の workspace と pane を閉じるスキル。

削除済み worktree のディレクトリを CWD とするシェルセッションが残ると、mise の activate hook が `check_working_directory` で panic し、ReportCrash が CPU を消費し続ける。このスキルは worktree 削除と workspace・pane のクリーンアップをセットで行うことで、この問題を防ぐ。

## 処理フロー

### 1. 候補の確認

```bash
twig clean -v --check
```

出力をユーザーに提示する。
出力には次の情報が含まれる。

- 削除候補のブランチ一覧
- スキップされたブランチとその理由 (未コミット変更、未マージなど)
- `No worktrees to clean` の場合はステップ 2, 3 をスキップしてステップ 4 へ進む

ユーザーが未マージのものも含めたい場合は次のオプションを使う。

- `--force` (`-f`): 未マージ・未コミットも対象
- `--force --force` (`-ff`): ロック済みも対象
- `--stale`: upstream-gone のブランチを対象

削除対象があるか確認し、実行してよいかユーザーに確認を取る。

### 2. worktree の削除

ユーザーの確認後に実行する。

```bash
twig clean -v --yes
```

出力から削除されたブランチ名を抽出する。
各削除行は以下の形式:

```txt
Removed worktree and branch: <branch-name>
```

`<branch-name>` を記録しておく。

### 3. herdr の workspace と pane の特定と終了

削除された worktree を CWD に持つ herdr の pane を特定して閉じる。herdr の pane 内 (`HERDR_ENV=1`) で実行していない場合は、このステップとステップ 4 をスキップし、その旨を報告する。

#### 3a. 削除された worktree パスの特定

ステップ 2 の出力からブランチ名を取得し、worktree ディレクトリの規則からパスを組み立てる。

worktree パスの規則:
`<repo-root>-worktree/<branch-name>`

#### 3b. pane の CWD の確認

`herdr pane list` は `--workspace` を省略すると全 workspace の pane を返し、pane ごとの `cwd` を含む。

```bash
herdr pane list \
  | jq -r '.result.panes[] | [.workspace_id, .pane_id, .cwd] | @tsv'
herdr workspace list \
  | jq -r '.result.workspaces[] | [.workspace_id, .label, .pane_count] | @tsv'
```

`cwd` が削除された worktree パスと一致するか、そのサブディレクトリである pane を抽出する。

呼び出し元の pane (`$HERDR_PANE_ID`) と workspace (`$HERDR_WORKSPACE_ID`)、`herdr workspace list` で `focused` が true の workspace は対象から外す。

#### 3c. 閉じる単位の決定

workspace ごとに、抽出した pane の数と `pane_count` を比べる。

**workspace の全 pane が該当する場合**:
workspace ごと閉じる。

```bash
herdr workspace close <workspace_id>
```

**一部の pane だけが該当する場合**:
該当する pane だけを閉じる。

```bash
herdr pane close <pane_id>
```

閉じる前にユーザーに対象の workspace と pane、それぞれの CWD を提示して確認を取る。

`workspace close` が `workspace_group_close_required` を返した場合は `--group` を付けずに中止し、ユーザーに報告する。`--group` は紐づく worktree の workspace もまとめて閉じるため。

### 4. 存在しない worktree を指す pane の削除

twig clean の結果に関わらず、常にこのステップを実行する。手動削除や他の方法で削除された worktree を CWD に持つ pane を検出して閉じる。

#### 4a. 全 pane の CWD を確認

ステップ 3b と同じく `herdr pane list` で全 pane の `cwd` を取得する。

#### 4b. worktree パスの判定

CWD が worktree ディレクトリ規則 (`<repo>-worktree/` を含むパス) に該当するか確認する。該当する場合、そのディレクトリが実際にファイルシステム上に存在するか確認する。

#### 4c. 存在しないパスを持つ pane の処理

CWD が存在しない worktree パスを指している pane について、ステップ 3b, 3c と同じ手順で処理する。

- 呼び出し元の pane と workspace、focus 中の workspace は閉じない
- workspace の全 pane が該当すれば workspace を閉じる
- 一部だけ該当すれば該当する pane を閉じる
- 閉じる前にユーザーに確認を取る

### 5. 完了報告

次の内容をまとめて報告する。

- 削除した worktree とブランチ名
- 閉じた herdr の workspace と pane (twig clean 由来 / stale CWD 由来を区別)
- スキップされたブランチとその理由(あれば)

## 注意点

- `twig clean` は git リポジトリ内で実行する必要がある。
  カレントディレクトリが対象リポジトリでない場合は `twig clean -C <path>` を使用する。
- 複数リポジトリに worktree がある場合は、どのリポジトリを対象にするかユーザーに確認する。
- 呼び出し元の herdr の pane と workspace、focus 中の workspace は閉じない。
