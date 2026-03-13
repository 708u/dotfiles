# 改善方針

## パターン1: cleanup DELETE のギャップロック

### 優先度1: CASCADE に任せる

FK に `ON DELETE CASCADE` が設定されている場合、
子テーブルの手動 DELETE は不要。親テーブルだけ削除すれば
CASCADE で子テーブルも削除される。

```go
// 悪い例: 子テーブルを手動で削除
t.Cleanup(func() {
    db.Exec("DELETE FROM child WHERE parent_id IN (SELECT id FROM parent WHERE org_id = ?)", orgID)
    db.Exec("DELETE FROM parent WHERE org_id = ?", orgID)
})

// 良い例: CASCADE に任せる
t.Cleanup(func() {
    db.Exec("DELETE FROM parent WHERE id = ?", parentID)  // PK指定
})
```

### 優先度2: PK で削除する

テスト中に作成したレコードの ID を記録し、PK で削除する。
CLAUDE.md の「良い例1: PRIMARY KEYを使用」パターン。

```go
// テスト中にIDを記録
created, err := models.Parents(
    models.ParentWhere.OrgID.EQ(orgID),
).All(ctx, db)
require.NoError(t, err)

ids := make([]uint64, len(created))
for i, r := range created {
    ids[i] = r.ID
}

// PK で削除（レコードロックのみ）
t.Cleanup(func() {
    _, _ = models.Parents(
        models.ParentWhere.ID.IN(ids),
    ).DeleteAll(context.Background(), db)
})
```

### 優先度3: SetupTxDb に移行

cleanup 自体を不要にする。txdb は自動ロールバックするため
他テストへの影響もない。

ただし以下の場合は txdb を使えない:

- テスト内で並列トランザクションを使う
- トランザクションの COMMIT/ROLLBACK 自体をテストする

## パターン2: FOR SHARE/UPDATE の全件スキャン

テストコードではなく実装コードの問題。以下を検討:

- テストから `t.Parallel()` を外す
- テスト対象のクエリにフィルタ条件を追加できないか検討

## パターン3: SetupDb のデータ可視性

- `SetupTxDb` に移行する（データが未コミットになり他テストから見えなくなる）
- 移行できない場合、`t.Parallel()` を外して直列実行にする

## 確認方法

修正後、`-count=100` で再実行してデッドロックが発生しないことを確認:

```bash
go test -tags="integration" -count=100 \
  -run 'TestTargetFunction' ./path/to/package/...
```

deadlock log に新しいエントリが増えていないことも確認:

```bash
mysql -h 127.0.0.1 -P 3307 -u root \
  -e "SHOW ENGINE INNODB STATUS\G" 2>/dev/null \
  | grep 'LATEST DETECTED DEADLOCK' -A2
```
