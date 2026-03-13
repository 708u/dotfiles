# ロック種別と原因パターン

## ロック種別の読み方

deadlock log の `HOLDS THE LOCK(S)` / `WAITING FOR THIS LOCK TO BE GRANTED`
に表示されるロック種別の意味。

### レコードロック (`lock_mode X locks rec but not gap`)

特定の行のみをロック。PK や UNIQUE インデックスの等値検索で取得される。
他のテストへの影響は小さい。

### ギャップロック (`lock mode S` on supremum)

インデックスのギャップ（行間）をロック。
`supremum` はテーブル末尾のギャップを示す。

発生条件:

- セカンダリインデックスでの範囲検索（`IN (SELECT ...)`）
- FK CASCADE チェック時の子テーブルスキャン
- 子テーブルにデータが少ない場合、supremum ロックになりやすい

### insert intention ロック (`lock_mode X insert intention waiting`)

INSERT 前にギャップ内の挿入位置を予約するロック。
ギャップロック（S）と競合する。

## 原因パターン

### パターン1: cleanup DELETE と INSERT の循環ロック

最も頻出するパターン。

```txt
テスト A (cleanup DELETE):
  DELETE FROM parent WHERE col IN (SELECT ...)
  → FK CASCADE チェックで child テーブルに S ロック (supremum)
  → parent テーブルの X ロック待ち

テスト B (INSERT):
  INSERT INTO child (parent_id, ...)
  → FK チェックで parent テーブルに X ロック保持
  → child テーブルの insert intention ロック待ち (supremum と競合)
```

根本原因: cleanup の DELETE が非 unique search condition で
ギャップロックを取得し、FK CASCADE チェックで子テーブルまでロックが伝播。

### パターン2: FOR SHARE/UPDATE による全件スキャン

```txt
テスト A:
  SELECT ... FROM table FOR SHARE
  → テーブル全体に S ロック

テスト B:
  INSERT INTO table ...
  → X ロック待ち
```

根本原因: テストコードではなく実装コードの `FOR SHARE` が
テスト用データ以外のレコードもロック。

### パターン3: SetupDb のデータが他テストに見える

```txt
テスト A (SetupDb): CreateUser → user がコミットされる
テスト B (SetupTxDb): ListAllUsers → テスト A の user を取得
テスト A: cleanup で user を DELETE
テスト B: user に依存する INSERT → FK 違反
```

根本原因: SetupDb はデータをコミットするため、
他テストの全件スキャン系クエリに拾われる。
MySQL の FK 制約チェックは READ COMMITTED で評価されるため、
トランザクション内のスナップショットでは見えていても
DELETE がコミットされた後は FK 違反になる。

## 判定フローチャート

```txt
SAVEPOINT does not exist エラー?
├─ Yes → deadlock による SAVEPOINT 破壊
│  └─ deadlock log を確認
│     ├─ DELETE ... WHERE col IN (SELECT ...) がある?
│     │  └─ パターン1: cleanup のギャップロック
│     ├─ FOR SHARE / FOR UPDATE がある?
│     │  └─ パターン2: 全件スキャンロック
│     └─ INSERT 同士の競合?
│        └─ UNIQUE インデックスのギャップロック
└─ No
   └─ FK constraint fails エラー?
      └─ パターン3: SetupDb のデータ可視性
```
