---
name: session-rename
description: >-
  タスク完了時にセッション名を自動付与する。
  claude -p でのタスク実行終了時、結果に基づいた
  セッション名をファイルに書き出す。SessionEnd hook が
  読み取り jsonl に反映する。タスクが完了した、
  作業が終わった、セッション名を付けたい、
  最後の仕上げとして使用する。
user_invocable: true
---

# session-rename

タスク完了後にセッション名を生成し、ファイルに書き出す。
SessionEnd hook が読み取り、`claude --resume` の一覧に
反映される。

## プロジェクト固有の命名ルール

`.claude/session-rename.local.md` が存在する場合、
そのファイルの指示に従ってセッション名を生成する。
存在しない場合はデフォルトルールを使用する。

スキル実行時、まず以下を確認する:

```bash
cat .claude/session-rename.local.md
```

ファイルが存在すれば、その内容をデフォルトルールより
優先して適用する。

## デフォルトのセッション名フォーマット

```txt
[status] 短い説明（3-8語）
```

### status の判定基準

- `[success]` - タスクが正常に完了した
- `[failure]` - タスクが失敗した、エラーで完了できなかった
- `[skip]` - タスクがスキップされた、対象が存在しなかった

### 説明の書き方

- 何をしたかを端的に表現する
- 日本語で書く
- プロジェクト名やファイル名など固有名詞を含めると
  検索しやすくなる

例:

```txt
[success] zsh abbr に claude 短縮を追加
[failure] CI workflow の修正（lint エラー未解消）
[skip] 対象ファイルが存在しないためスキップ
```

## 実行手順

**重要: 以下のコマンドは一字一句そのまま実行すること。
`echo` や `;` 等を付け足してはならない。
コマンドの改変は許可パターンから外れ、
不要な承認プロンプトを発生させる。**

1. `.claude/session-rename.local.md` を確認し、
   プロジェクト固有ルールがあれば読み込む
2. タスクの結果を評価し、status を判定する
3. ルールに従い短い説明文を生成する
4. セッション ID を取得する:
   `cd ${CLAUDE_PLUGIN_ROOT} && ./scripts/get-session-id.sh`
5. セッション名を書き出す:
   `cd ${CLAUDE_PLUGIN_ROOT} && ./scripts/write-session-name.sh <session_id> <name>`
