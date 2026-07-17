---
name: stock-flow-board
description: >-
  現在の会話を stock(確定した決定・調査結論・成果物・未解決の論点) と
  flow(時系列の経緯ログ) に分離し、1 枚の Artifact ダッシュボードとして
  可視化する。会話の節目で同じ Artifact を再 publish して最新化し続ける。
  「stock flow で可視化」「会話ダッシュボード」「会話の現在地を見せて」
  「今どこにいるか俯瞰したい」「stock と flow を分けて」「議論を整理して
  Artifact に」などで使う。会話が長くなり決定・未決・成果物が経緯に
  埋もれてきたとき、全体を俯瞰したいときにも積極的に使う。
user_invocable: true
---

# stock-flow-board

現在の会話を stock と flow に分離し、1 枚の Artifact ダッシュボードとして
可視化する。会話の節目で同じ Artifact を再 publish し、常に現在地が
見える状態を保つ。

## なぜ分離するか

長い会話では、確定した決定・分かった事実・作った成果物・残った宿題が、
逐次的なやり取り(flow)の中に溶けて見えなくなる。「結局いま何が決まって
いて、何が残っているか」を読み返しで再構成する必要が出る。

stock と flow を別領域に置くと、この再構成が不要になる。

- **flow(流れ)**: 何が起きたかの時系列ログ。追記型で、経緯そのもの。
- **stock(蓄積)**: いまの状態。再編成・重複排除され、常に最新の一望。

判断基準は「会話が終わったあと振り返って価値が残るか」。残るなら stock、
その場の経緯なら flow。同じ話題が両方に現れてよい。flow には
「A と B を比較した」という経緯が残り、決着したら stock の決定に
「A を採用」が載る。二重化ではなく粒度を変える(経緯 対 結論)。

## stock/flow の分類ルーブリック

### flow に置くもの(時系列・追記型)

- ユーザーの依頼、投げられた問い
- 試したこと、探索した経路、行き止まり
- 実行したツール・コマンドとその結果の要約
- 途中の仮説、議論の分岐

粒度は「あとから経緯を辿れる」程度に要約する。生ログを貼らない。

### stock に置くもの(非時系列・重複排除)

4 カテゴリに分類する。テンプレートの各セクションに対応する。

- **確定した決定**: 合意・採用した方針。会話の中でしか確定して
  いない決定は、ファイルに無いので文章化して残す。
- **事実・調査結論**: 根拠つきで分かったこと。根拠のファイルパスや
  出力を併記する。
- **成果物**: 作った/変更したファイルパス、PR、この board 自身を
  含む Artifact URL など。
- **未解決の論点・次アクション**: open questions と next actions。
  いま何が残っているかの現在地。解決したら決定へ昇格させ、ここから消す。

暫定的で覆る可能性がある事項は、決定ではなく未解決の論点側に置く。

## Artifact の構成

`assets/board-template.html` を使う。本文と `<style>` のみで、
`doctype`/`html`/`head`/`body` は持たない(Artifact publish 時に
`<head>` が自動付与されるため)。

- 幅広: 2 ペイン。左が stock(4 セクション)、右が flow。
- 狭い幅: 縦積み。stock を上、flow を下に積む。現在地の把握が
  第一目的のため stock を先に見せる。
- flow は新しい経緯を上に積む(reverse chronological)。
- stock の 4 セクションは「未解決の論点・次アクション」を先頭に置く。
  決定・事実・成果物は確定済みのアーカイブで、生きている現在地は
  未解決だけのため、開いた瞬間に現在地が見える並びにする。
- テーマ対応・レスポンシブ・自己完結(外部リソース参照なし)を
  テンプレート側で満たしてある。
- インタラクションは details/summary の項目単位開閉までを上限とする。
  全展開トグル・フィルタ・検索・件数バッジ・JS ハイライトは足さない。
  board の編集を LLM が差分で担うため、同期負荷や壊れたインタラクション
  という失敗様式を増やすだけで、10 秒で現在地を掴む用途に寄与しない。

各挿入位置に `<!-- ANCHOR:xxx -->` コメントがある。更新時はその直後の
`<li>` を編集・追加する。ANCHOR は open / decisions / findings /
artifacts / flow / doctitle / title / updated。

### 項目の詳細(展開)

各項目は俯瞰用の見出しだけでなく、背後で何を話していたかを
掘れるようにする。`<details class="entry">` を使い、`<summary>` に
常時表示の見出しを、`.expand` に展開時の詳細を書く。

- **summary(常時表示)**: 一望性を保つため 1 行に収める。決定なら
  結論、flow ならそのターンで何をしたか。
- **.expand(展開時)**: 検討した選択肢、却下した案とその理由、根拠、
  経緯。ここが「どんなことを話していたか」に答える部分。

掘る背景が無い自明な項目(単なるファイルパス等)は `<details>` を
使わず素の `<li>` にする。展開の有無自体が「これ以上の背景は無い」
というシグナルになるため、無理に全項目を展開可能にしない。

stock の項目には、関連する flow の経緯を `.expand` 内で
`<span class="ref">経緯: flow #3–#4</span>` の形で参照できる
(番号は flow の `step` に対応)。追跡が有用なときだけ付ける。

## subagent への委譲(main をブロックしない)

board の維持(HTML の生成・編集・Artifact publish)は機械的な作業で、
main の context を tool 出力で埋め、進行中の作業を中断させる。会話が
長いほど節目が増え、この負荷が積み上がる。維持作業を background
subagent に委譲して main をブロックしない。

ただし「会話を棚卸しして stock/flow に分類する」判断は main にしか
できない。subagent は fresh context で始まり、現在の会話を見られない
ためだ。丸投げはできず、次の分業にする。

- **main(会話 context 内)**: 何を board に載せるかを決める。初回は
  会話全体を棚卸しし、更新時は節目の差分を抽出する。結果を、subagent
  がそのまま HTML 化できる自己完結の payload にまとめ、board の URL を
  保持する。
- **subagent(background)**: payload を受け取り、テンプレートまたは
  既存 HTML に落として scratchpad の HTML を書き、Artifact を publish
  して URL を返す。判断はせず、渡されたものを形にするだけ。

### URL を継続させる(必須)

subagent は main と別 context のため、同一 `file_path` でも新規 URL が
発行される。既存 board を更新するときは、main が保持する board URL を
payload に含め、subagent は Artifact tool に `url: <board URL>` を渡して
同じ URL を更新させる。初回は URL が無いので `url` 無しで publish し、
発行された URL を main へ返す。main はそれを保持し、以後毎回渡す。

main の URL 保持はメモリ上のため compaction で失われる。それが起きるのは
まさに長い会話 = この skill の主用途で、URL を失うと手順 1 が「初回」に
倒れ、`url` 無しの publish で新 URL が発行される(URL fork)。手順 4 の
ファイル存在確認は board の内容の破壊は防ぐが、URL の連続性は守らない。
これを防ぐため、writer は publish 後に得た URL を出力 HTML の先頭コメント
`<!-- board-url: ... -->` へ書き込む。手順 1 は、main が URL を覚えて
いなければこのコメントから復元する。状態をファイルに外在化すれば、main の
メモリは単なるキャッシュになり、fork の経路が閉じる。

board のテンプレートの見た目自体を変えるとき(色・レイアウト等)は、
機械作業ではなく設計判断なので main 側で `artifact-design` skill を
読んで行う。日々の項目追加ではテンプレートが既に設計を内包しており、
subagent は埋めるだけでよい。

### writer は 1 本に保つ

board が存在する限り、すべての更新を同じ writer 経由にする。閾値を設けて
小さな更新だけ inline 編集…はしない。同一ファイルに 2 系統の編集者が
生じ、main のファイル状態把握が陳腐化して inline の Edit が失敗・古い
内容で上書きするためだ。委譲の超過コストは background の wall-clock だけで
main を圧迫せず、flow 1 行でも損はしない。

具体化: 初回のみ Agent tool で board-writer を起動し、2 回目以降は同じ
board-writer へ SendMessage で payload を送る(再起動しない)。同名 writer
を再 Agent 起動すると 2 個が並走し、同一 HTML への同時編集や同一 URL への
同時 publish(Artifact の baseVersion 競合で 409)を招く。writer が 1 本
である限りこれらは起きず、SendMessage は writer の transcript に順に届いて
書き込みが直列化される。

writer のハンドルを失った場合(compaction 後など)は新規起動してよい。
状態(HTML と URL)は writer の外(ディスクと先頭コメント)にあるので、
新 writer は手順 4 のファイル Read と URL コメントから全状態を回復する。
context 肥大を理由に使い回しをためらう必要はない。writer は使い捨てられる。

## 処理フロー

各手順に [main] / [subagent] を明示する。

### 1. [main] 要否と現在地を判断する

会話に相談・作業の実体があるか確認する(無ければ board を作らず、何を
可視化したいかをユーザーに問う)。board URL を保持していれば更新、
していなければ初回とする。

### 2. [main] payload を作る(操作の列として)

payload は「内容の列挙」でなく「操作の列挙」にする。同一性判定(重複
排除)や昇格の可否は意味論の判断で、writer の「判断しない」契約と矛盾
するため、main が操作として解決してから渡す。操作の型:

- add: flow 項目、または stock 4 分類のいずれかへ項目追加
- edit: 対象を指定して既存項目を書き換え(重複は main がここで解消)
- promote: 未解決の論点を確定した決定へ昇格
- fold: 古い flow #N–#M を 1 項目に畳む

初回は会話全体を棚卸しし、stock 4 分類(未解決・次アクション / 確定した
決定 / 事実・調査結論 / 成果物)と flow を add の列として出す。更新は
節目の差分だけを操作の列にする。

各操作は自己完結にする。「先ほどの」等、会話を見ないと解決しない指示語を
残さない。項目は summary(見出し 1 行)と detail(展開: 検討・却下理由・
根拠)、必要なら `経緯: flow #N` を含め、分類ルーブリックと
「項目の詳細(展開)」の粒度に従う。

### 3. [main] writer に payload を渡す

初回のみ Agent tool で board-writer を起動する(2 回目以降は
「writer は 1 本に保つ」に従い SendMessage で送る)。

- `subagent_type`: `general-purpose`(Read/Write/Edit と Artifact が要る)
- `run_in_background`: `true`(main をブロックしない)
- `model`: 機械作業のため軽量で可(分類は main 済み)
- `name`: `board-writer`(継続更新を SendMessage で送るため必須)
- `prompt`: 下記テンプレート。操作の列・出力パス・テンプレートパス・
  board URL(あれば)・title・更新ラベルを埋める

2 回目以降は board-writer へ SendMessage で、その回の操作の列・更新
ラベル・(保持していれば)board URL を送る。

```txt
あなたは会話ダッシュボード(stock-flow-board)のレンダリング担当です。
判断はせず、渡された操作の列を既存 HTML に適用して Artifact を publish
し、URL を main へ返します。会話の中身は見えなくてよい設計です。
テンプレートが設計を内包しているため artifact-design skill は読みません
(Artifact tool の通常指示からの意図的な省略)。

入力:
- 出力パス: <scratchpad の stock-flow-board.html 絶対パス>
- テンプレート: <assets/board-template.html 絶対パス>
- board URL: <あれば URL、無ければ「なし」>
- title: <会話の主題>
- 更新ラベル: <「更新: YYYY-MM-DD · 第N回 (節目名)」>
- 操作の列: <add / edit / promote / fold。対象と summary/detail/ref/open>

手順:
1. 出力パスの HTML が存在すれば Read(空テンプレートで上書きしない)。
   無ければテンプレートをコピーして初期化。先頭コメント
   <!-- board-url: ... --> があれば、それが既存 board の URL。
2. 操作の列を該当 ANCHOR(open / decisions / findings / artifacts /
   flow / doctitle / updated)へ差分適用する。全再生成しない。add は
   追加、edit は対象の書き換え、promote は open 項目を decisions へ移動、
   fold は古い flow を 1 項目に畳む。カテゴリ最初の項目で empty
   プレースホルダを除去。未解決は class="open"。flow の新項目は
   ANCHOR:flow 直後(最上部)。ファイルパス・識別子は <code>。
   重複判定はしない(main が操作として解決済み)。
3. ANCHOR:doctitle の <title> と ANCHOR:updated を書き換える。
4. Artifact tool で publish。board URL があれば url に指定、無ければ
   url 無し。favicon は "📊"。
5. publish された URL を出力 HTML の先頭コメント
   <!-- board-url: <URL> --> に書き込む(次回の復元用)。
6. その URL を SendMessage で main に返し、指定した既存 URL と同一か
   (新規発行でないか)を明記する。説明は最小限で。
```

### 4. [subagent] レンダリングして publish する

subagent は上記 prompt の手順を実行する。出力パスに既存 HTML があれば
更新モードで差分編集し(空上書きの防止=ガード)、無ければテンプレートを
初期化する。この存在確認が、main の compaction 後に skill を再起動した
ときの復旧手順も兼ねる。

### 5. [main] 結果を受け取る

background 完了通知(または writer の SendMessage)で URL を受け取り、
保持する(以後の更新で渡す)。main はこの間ブロックされず、本来の作業を
続けられる。

- 返ってきた URL を保持 URL と照合する。不一致(url 指定したのに新 URL)
  や通知未着なら、黙って新 URL を採用せずユーザーに報告する。
- URL が返るまで「board を更新した」と述べない。委譲後すぐ本来作業に
  戻る設計ゆえ完了を先回りしがちだが、writer の silent failure は
  「main は更新済みと信じ board は古い」という、鮮度劣化より質の悪い
  不整合を生む。

更新の契機(main が手順 2 の差分抽出を起動する節目):

- 決定が確定した(未解決から決定へ昇格) / 調査が結論に達した
- 成果物が生まれた(ファイル作成・commit・PR)
- 未解決の論点が新規発生、または解消した
- サブタスク・フェーズが完了した / ユーザーが現在地を尋ねた

状態変化が無いターンは起動しない(無駄な publish を避ける)。

flow が伸びすぎたら payload で古い項目の要約畳みを指示する。畳んだ項目は
`step` 番号を範囲で表し(例: `1-4` の 1 バッジに「初期調査」)、新項目の
連番は畳む前の最大値から継続する(過去の `経緯: flow #N` 参照が壊れる
ため振り直さない)。

## ガード

- 会話に相談・作業の実体がまだ無い場合は、board を作らず何を
  可視化したいか確認する。
- stock/flow の分類に迷う項目は、決めきらず flow に経緯として残し、
  決着してから stock へ昇格させる。憶測で決定に昇格させない。
- flow を無制限に伸ばさない。経緯が増えたら古い項目を要約に畳む
  (詳細は会話本体に残っているため、board は俯瞰に徹する)。
- 再 publish のたびに favicon と title を変えない。ユーザーはタブの
  アイコンと名前で board を見つけるため、同一に保つ。
- Artifact は既定で非公開。共有可否はユーザーの判断に委ねる。
- 節目更新は skill の指示が context にある間だけ能動的に働く。
  会話が長引き context 要約が起きると、更新の義務は薄れ、実挙動は
  「覚えている間 + ユーザーが尋ねたとき」に劣化する。既存 HTML の
  存在確認(手順 4)により board が破壊されることはないが、鮮度は
  保証されない。
  常時性を強めたい場合は、board ファイルの存在時だけ更新を促す
  hook を併用する(この skill の既定には含めない)。
