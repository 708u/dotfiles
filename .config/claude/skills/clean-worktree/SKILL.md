---
name: clean-worktree
description: >-
  マージ済みの git worktree を一括削除し、対応する cmux
  workspace も閉じる。削除済み worktree の CWD を持つ
  シェルが残ると mise が check_working_directory で
  クラッシュし続けるため、workspace も合わせて閉じる
  必要がある。「clean worktrees」「worktree 掃除」
  「twig clean」「不要な worktree 削除」「古い workspace
  閉じて」「merged branches 整理」や、mise が
  クラッシュしている・ReportCrash が重いといった
  状況でも使用する。
user_invocable: true
---

# Clean Worktree

マージ済み worktree を `twig clean` で削除し、
対応する cmux workspace を閉じるスキル。

削除済み worktree のディレクトリを CWD とする
シェルセッションが残ると、mise の activate hook が
`check_working_directory` で panic し、ReportCrash が
CPU を消費し続ける。このスキルは worktree 削除と
workspace クリーンアップをセットで行うことで、
この問題を防ぐ。

## 処理フロー

### 1. 候補の確認

```bash
twig clean -v --check
```

出力をユーザーに提示する。
以下の情報が含まれる:

- 削除候補のブランチ一覧
- スキップされたブランチとその理由
  (未コミット変更、未マージなど)
- `No worktrees to clean` の場合はステップ 2, 3 を
  スキップしてステップ 4 へ進む

ユーザーが未マージのものも含めたい場合:
- `--force` (`-f`): 未マージ・未コミットも対象
- `--force --force` (`-ff`): ロック済みも対象
- `--stale`: upstream-gone のブランチを対象

削除対象があるか確認し、実行してよいか
ユーザーに確認を取る。

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

### 3. cmux workspace の特定と終了

削除された worktree に対応する cmux workspace を
見つけて閉じる。

#### 3a. 削除された worktree パスの特定

ステップ 2 の出力からブランチ名を取得し、
worktree ディレクトリ規則からパスを組み立てる。

worktree パスの規則:
`<repo-root>-worktree/<branch-name>`

#### 3b. workspace の CWD を照合

`cmux sidebar-state` の `cwd` フィールドで
各 workspace の実際の作業ディレクトリを取得する。
タイトルやスクリーン内容のパースより信頼性が高い。

```bash
cmux list-workspaces
```

出力から workspace ID を取得し、各 workspace の
CWD を確認する:

```bash
cmux sidebar-state --workspace workspace:<n>
```

`cwd=` 行の値が、削除された worktree パスと
一致するか、そのサブディレクトリであるかを
確認する。

`*` が付いている workspace は現在選択中なので
絶対に閉じない。

#### 3c. surface 数に応じた処理

マッチした workspace の surface 数を確認する:

```bash
cmux list-pane-surfaces --workspace workspace:<n>
```

**surface が 1 つの場合**:
workspace ごと閉じる。

```bash
cmux close-workspace --workspace workspace:<n>
```

**surface が複数の場合**:
workspace を閉じると他の作業も失われるため、
ユーザーに該当 workspace と CWD を提示し、
手動で対象 surface を閉じるか workspace ごと
閉じるかの判断を委ねる。

`cmux sidebar-state` は workspace 単位の CWD
しか返さず、surface 単位の CWD API はないため、
自動判定できない。

いずれの場合も、`*` が付いている workspace
(現在選択中) は閉じない。

閉じる前にユーザーに対象 workspace の一覧を
提示して確認を取る。

### 4. 存在しない worktree を指す workspace の削除

twig clean の結果に関わらず、常にこのステップを
実行する。手動削除や他の方法で消えた worktree を
CWD に持つ cmux workspace を検出して閉じる。

#### 4a. 全 workspace の CWD を確認

`cmux list-workspaces` で全 workspace を取得し、
各 workspace の CWD を `cmux sidebar-state` で
確認する。

#### 4b. worktree パスの判定

CWD が worktree ディレクトリ規則
(`<repo>-worktree/` を含むパス) に該当するか
確認する。該当する場合、そのディレクトリが
実際にファイルシステム上に存在するか確認する。

#### 4c. 存在しないパスを持つ workspace の処理

CWD が存在しない worktree パスを指している
workspace について、ステップ 3b, 3c と同じ
手順で処理する:

- `*` が付いている workspace は閉じない
- surface が 1 つなら workspace を閉じる
- surface が複数ならユーザーに判断を委ねる
- 閉じる前にユーザーに確認を取る

### 5. 完了報告

以下をまとめて報告する:

- 削除した worktree とブランチ名
- 閉じた cmux workspace
  (twig clean 由来 / stale CWD 由来を区別)
- スキップされたブランチとその理由(あれば)

## 注意点

- `twig clean` は git リポジトリ内で実行する必要がある。
  カレントディレクトリが対象リポジトリでない場合は
  `twig clean -C <path>` を使用する。
- 複数リポジトリに worktree がある場合は、
  どのリポジトリを対象にするかユーザーに確認する。
- 現在選択中の cmux workspace は閉じない。
