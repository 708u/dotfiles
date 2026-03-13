---
name: investigate-mysql-deadlock
description: >-
  MySQL InnoDB デッドロックを調査する。integration test のフレーキーテスト、
  SAVEPOINT does not exist エラー、deadlock detected エラーの原因特定に使用。
  「デッドロック調査」「deadlock」「SAVEPOINT エラー」「テストがランダムに落ちる」
  「フレーキーテスト」で使用する。
user-invocable: true
---

# MySQL InnoDB デッドロック調査スキル

integration test の並列実行時に発生するデッドロックの原因を特定する。

## 前提

- MySQL は `127.0.0.1:3307` で起動中
- DB接続: `mysql -h 127.0.0.1 -P 3307 -u root`

## 初期化（スキルロード時に即実行）

スキルが読み込まれた時点で general_log を有効化する。
再現テスト実行前からクエリを記録しておくことで、
thread ID の追跡漏れを防ぐ。

```bash
mysql -h 127.0.0.1 -P 3307 -u root -e "
SET GLOBAL general_log = OFF;
SET GLOBAL log_output = 'FILE';
SET GLOBAL general_log_file = '/var/lib/mysql/general.log';
SET GLOBAL general_log = ON;
" 2>/dev/null
```

調査完了後は必ず無効化すること（「調査完了」セクション参照）。

## 調査フロー

### デッドロックの再現

対象テストを `-count=N` で複数回実行して再現する。

```bash
go test -tags="integration" -count=100 \
  -run 'TestA|TestB' ./path/to/package/...
```

NOTE: `-count` を使わないと Go のテストキャッシュにより1回しか実行されない。

### InnoDB deadlock log の確認

```bash
mysql -h 127.0.0.1 -P 3307 -u root \
  -e "SHOW ENGINE INNODB STATUS\G" 2>/dev/null \
  | sed -n '/LATEST DETECTED DEADLOCK/,/TRANSACTIONS$/p'
```

deadlock log から以下を読み取る:

- **各トランザクションの SQL 文**: INSERT / DELETE / UPDATE のどれか
- **MySQL thread id**: テストとの対応付けに使用
- **HOLDS THE LOCK(S)**: 保持中のロックの種類とテーブル
- **WAITING FOR THIS LOCK TO BE GRANTED**: 待機中のロック

### deadlock とテストの対応付け（general_log）

deadlock log だけではどのテスト関数が原因か特定できない。
general_log は初期化セクションで有効化済みのため、
thread ID で全クエリをトレースできる。

テスト再現後、deadlock log から thread ID を特定:

```bash
mysql -h 127.0.0.1 -P 3307 -u root \
  -e "SHOW ENGINE INNODB STATUS\G" 2>/dev/null \
  | sed -n '/LATEST DETECTED DEADLOCK/,/TRANSACTIONS$/p' \
  | grep -E 'thread id|^INSERT|^DELETE|^UPDATE'
```

thread ID でクエリ履歴を照合:

```bash
docker compose exec db cat /var/lib/mysql/general.log \
  | grep -E '^\d.*\s(THREAD_ID_1|THREAD_ID_2)\s' \
  | grep -v -E 'SET |SELECT @@|statistics|Close stmt'
```

クエリ内容（テーブル名、INSERT/DELETE の値）からテスト関数を特定する。

### ロック種別の分析

deadlock log の HOLDS/WAITING から原因パターンを判定する。
詳細は [lock-patterns.md](./lock-patterns.md) を参照。

### 改善方針の決定

原因パターンに基づき改善案を検討する。
詳細は [remediation.md](./remediation.md) を参照。

### 調査完了

general_log を無効化する。有効のままだと I/O 負荷が継続するため必ず実行する。

```bash
mysql -h 127.0.0.1 -P 3307 -u root \
  -e "SET GLOBAL general_log = OFF;" 2>/dev/null
```
