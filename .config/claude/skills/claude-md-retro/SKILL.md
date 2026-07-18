---
name: claude-md-retro
description: >-
  定期的な CLAUDE.md の振り返り改善。過去 N 週間の session transcript から
  繰り返し指示・訂正フィードバック・ルール未発火を発掘し、CLAUDE.md 自体の
  重複・陳腐化・自己矛盾も洗い出して、承認を得て反映する。
  「CLAUDE.md 改善」「CLAUDE.md 振り返り」「claude md retro」
  「繰り返し指示の調査」「session 分析」「ルールの棚卸し」「指示の振り返り」
  「同じ指示を何度もしている」などで使う。単発 session の学びの反映や単純な
  品質監査は claude-md-management plugin の管轄で、複数 session を横断した
  発掘を伴うときにこの skill を使う。
user_invocable: true
---

# claude-md-retro

CLAUDE.md を定期的に振り返り、両方向の乖離を検出して改善する。

CLAUDE.md は書きっぱなしにすると陳腐化する。一方で、ルール化すべき
繰り返し指示や訂正フィードバックは transcript の中に埋もれ、明文化
されないまま毎回口頭で繰り返される。この skill は両方向の乖離を
定期的に検出する。ファイルから現実への乖離 (陳腐化・自己矛盾) と、
現実からファイルへの乖離 (未文書化の繰り返し指示) の両方を対象にする。

この skill は dotfiles リポジトリの session から実行する。実行台帳を
project スコープの memory に置くため、実行場所を固定する。

## フェーズ 0: 実行台帳の確認

memory ディレクトリの `claude-md-retro-ledger.md` を読む。ディレクトリは
次のとおり。

```txt
~/.claude/projects/-Users-708u-ghq-github-com-708u-dotfiles/memory/
```

台帳には過去の実行履歴 (実行日、window、採用と commit hash、却下、
観察対象と基準回数) が記録されている。ここから今回の実行条件を決める。

- 調査 window: 前回実行日以降。台帳が無ければ過去 14 日。上限は 30 日。
  状態が動いていない期間を無駄に広げると発掘コストに見合わないため。
- 再提案の禁止: 却下済み提案は今回の候補から除外する。同じ提案を
  蒸し返さないため。
- 実効性測定: 前回追加したルールに対応する再指示パターンを、今回の
  window で数え直し、台帳の基準回数と比較する。減っていればルールが
  効いている。変わらなければ未発火を疑う。

台帳が無ければ初回として扱う。

## フェーズ 1: CLAUDE.md 自己批評

main session で実施する。対象は global (`.config/claude/CLAUDE.md`) と
project の CLAUDE.md。次のチェックリストで欠陥を洗い出す。

- 見出しの重複、同一文の二重掲載 (MD024 違反)
- 理由がルール本文の再掲になっている (循環した理由)
- ファイル自身が違反している実行不能なルール (例: 形容詞の全面禁止)
- 他所の識別子への結合が陳腐化 (tool 名・CI ジョブ名の改名で無効化)
- 一回性の手順が常駐している (毎 session の context を浪費。memory へ)
- markdownlint 違反。行長は byte でなく文字数で検証する:

```bash
perl -CSD -ne '
print "$ARGV:$.: ", length($_)-1, "\n" if length($_) > 81;
close ARGV if eof
' <対象ファイル>
```

awk の `length` は byte 数を返し、日本語で誤検知するため perl を使う。

- harness の現行動作と矛盾する前提 (廃止された tool・API への言及)
- 節の内容と所属セクションの不一致 (git 操作の節が別セクションにある等)

## フェーズ 2: transcript 偵察

main session で実施する。中身は読まず、分割設計のための件数把握のみ行う。

```bash
find ~/.claude/projects -name '*.jsonl' -newermt <window開始日> \
  -not -path '*/subagents/*' -not -path '*/memory/*' \
  | awk -F/ '{print $(NF-1)}' | sort | uniq -c | sort -rn
```

subagents 配下は Claude 自身の発話なので常に除外する。project 別の
件数から subagent への分割を決める。目安は 1 agent あたり 50〜80 ファイル。

## フェーズ 3: 並列発掘

分割ごとに general-purpose subagent を同一メッセージで並列起動する。
発掘の判断基準と報告フォーマットは prompt に内包させる。次のテンプレート
を使い、山括弧の箇所を実際の値で埋める。抽出スクリプトの箇所には、この
skill の `scripts/extract-typed-prompts.sh` の絶対パスを入れる。

```txt
Claude Code の session transcript から、ユーザーが繰り返し出している
指示・修正フィードバックを発掘するタスク。

対象: <対象ディレクトリと window の指定>

手順:
1. ~/.claude/CLAUDE.md を Read し、既存ルールを把握する。
2. 各 jsonl から実ユーザー発話のみを抽出する。生ファイルを cat しては
   いけない (巨大)。必ず次のスクリプトを使う:
   <extract-typed-prompts.sh の絶対パス> <files...>
3. 抽出結果を分類・集計する:
   a. 繰り返し指示 (3 回以上)
   b. 挙動への訂正フィードバック (1 回でも重要)
   c. ルール化済みなのに再指示されている (= ルール未発火の疑い)
   d. 実効性測定: <観察対象パターンの列挙> の出現回数
4. 報告フォーマット: 各パターンにつき {パターン名, 分類, 概算回数,
   代表引用 2-3 個 (各 80 字以内, PII はマスク), 日付範囲,
   既存ルールでのカバー状況}。最後に追記価値が高い順の候補上位 5 件。

注意: worktree 系 session は spawn 由来の自律実行が大半でシグナルが
薄い。冒頭の長文テンプレート指示は集計対象外とし、その後の対話的な
短い指示・訂正を対象にする。トークン節約のため抽出結果全文を
コンテキストに残さず、ファイルごとに処理して集計だけ持ち回る。
```

## フェーズ 4: 統合と承認

main session で実施する。フェーズ 1 と 3 の結果を突合し、次の 4 区分で
提示する。

- A 群: CLAUDE.md 本体の機械的整理 (重複統合・循環理由削除・行長修正)
- B 群: 新規ルール追記 (発掘した繰り返し指示・訂正の明文化)
- C 群: 他 project の CLAUDE.md 向き (特定リポジトリ固有の運用)
- 観察: 文言追記では直らない見込みのもの。例として、書いてあるのに
  発火しないルールがある。hook による強制が候補になるなら、提案に
  update-config skill を含める。

却下済み台帳と突合して再提案を除外したうえで、AskUserQuestion で反映
範囲の承認を取る。承認前に編集しない。憶測で反映すると台帳の却下履歴
と衝突するため。

## フェーズ 5: 反映

承認された提案を配置する。配置先は次の決定木で決める。

- 全 project の全 session で常に効くべき行動規範 → global CLAUDE.md
- 特定リポジトリ固有の運用 → その project の CLAUDE.md
- 一回性の手順・参照情報 (常駐する価値がない) → memory
- 再利用可能な多段ワークフロー → skill 化
- 書いてあるのに発火しない自動挙動の強制 → hook (update-config)

判定に迷ったら次を補助質問にする。

- 毎 session 読む価値があるか (無ければ memory か skill)
- 違反したときの実害の大きさ (大きいほど常駐ルール向き)
- 発火条件を機械的に検知できるか (できるなら hook 候補)

dotfiles の CLAUDE.md・skill の小変更は、project ルールにより main へ
直接 commit / push してよい。行長は前掲の perl の文字数チェックで検証
する。main session の model が Fable 5 のときは、既存ルール「実装作業の
subagent委譲」に従い編集作業を opus subagent へ委譲する。

## フェーズ 6: 台帳更新

実行内容を台帳へ追記する。次を記録する。

- 実行日と window
- 採用 (commit hash 付き)
- 却下 (再提案しない対象)
- 観察対象と今回の出現回数

これが無いと、次回に却下済み提案を再発見し、実効性測定の基準も失う。

## ガード

- transcript の引用に PII (実名・メールアドレス・社内 URL 等) が含まれる
  場合はマスクする。発掘結果はユーザーへ提示するため。
- 状態変化のない短い window では実行しない。発掘コストに見合わないため。
- 憶測でルール化しない。訂正フィードバックは原文の引用を根拠に添える。
