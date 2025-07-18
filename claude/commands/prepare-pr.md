# 現在の作業内容をPull Requestにする

あなたの目的は、作業完了後のコードベースに対してgithub上でpull requestをレビュー可能な状態に準備することです。

**重要**:

- 作業に直接関係ないdiffがでている場合、そのコードをcommitしないこと
- docs/planning/*はcommitしないこと
- branch名は708u/${conventional-commitに則った値: (feat|fix|hotfix|chore|deps|test|ci|or something)}-${作業名}にすること

## 手順

- (option): ブランチがmainだった場合、作業用のブランチを切る
- 作業を最小単位で意味のある粒度でgit add & git commitする。全ての関連するコードをcommitするまで繰り返す。
- branchをgit pushする
- 作業後、pull_request_template.mdをベースに作業内容を記述し、pull requestを作成する

## 作業完了後

以後、同じsession内で変更をpushするとき、作業内容に応じてPR descriptionをrefineすること。
