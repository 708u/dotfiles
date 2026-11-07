---
name: precommit-review
description: >-
  commit 前の working diff に対して /simplify → /code-review を
  順に実行し、重大な指摘のみ修正して commit 可能な状態にする
  品質チェックフロー。「品質チェック」「commit 前レビュー」
  「precommit review」「simplify と code-review をかけて」など、
  ユーザーが明示的に品質チェックを求めたときのみ使用する。
  実装が完了しただけで自動実行はしない。token コストが
  掛かるため、依頼なしの実行は避ける。
user_invocable: true
---

# precommit-review

commit 前の working diff に対する品質チェックフロー。
以下を順に実行し、指摘を反映してから commit する。

## 処理フロー

### 1. /simplify

再利用性・簡素化・効率性の観点からクリーンアップを反映する。

### 2. /code-review

バグを検出して修正する。

指摘は全件直すのではなく、動作・結論・判断を変える指摘のみ
修正し、残りは修正せずに報告する。再実行は最大 1 回まで。

## 理由

- simplify は品質のみを見てバグは検出しない。
  code-review がバグ検出を担うため両方を通す
- 指摘は多く出るため、重大度で選別しないと軽微な指摘への
  修正でコストが膨らむ
