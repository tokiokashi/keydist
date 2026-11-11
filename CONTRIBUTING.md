# 開発の作法

## コミットメッセージ

[Angular Commit Message Conventions](https://github.com/angular/angular/blob/main/contributing-docs/commit-message-guidelines.md)に従う。

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 1行目（必須）

- `type` と `scope` は英小文字。`subject` は日本語でよい
- `subject` は命令形・現在形（「追加する」「直す」）。過去形にしない
- 末尾に句点（`。`）を付けない
- 1行目は72文字以内に収める（バイト数ではなく文字数）
- 本文を書く場合は、1行目との間に空行を入れる

### type

| type | 使いどころ |
|---|---|
| `feat` | 機能の追加 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみの変更 |
| `style` | 挙動を変えない整形（空白・セミコロン等） |
| `refactor` | 挙動を変えない構造変更 |
| `perf` | 速度改善 |
| `test` | テストの追加・修正 |
| `build` | ビルド設定・依存関係 |
| `ci` | GitHub ActionsなどのCI設定 |
| `chore` | 上記に当てはまらない雑務 |
| `revert` | 取り消し。bodyに `This reverts commit <hash>.` を書く |

測定値が変わる変更は `fix` か `feat`。`refactor` は数値が1桁も動かない時だけ使う。

### scope

変更した領域を1つ選ぶ。複数にまたがるなら省略してよい。

| scope | 対応 |
|---|---|
| `model` | `spec/distance-model.md` と `src/trace/generate.ts` |
| `metrics` | `src/interpretation/metrics.ts` |
| `geometry` | `src/input/shapes/` |
| `sensitivity` | `src/analyzers/n-sensitivity/` |
| `layouts` | `src/input/layouts/` |
| `romaji` | `src/input/romaji/` |
| `ui` | `src/ui/` `src/app/` `src/routes/` |
| `deps` | 依存関係の更新（`deps-dev` は開発用の依存の更新。Dependabotが付ける） |

### body / footer

- `body` はなぜその変更をしたかを書く。何をしたかはdiffが語る
- 数値が変わる変更なら、変更前後の値を `body` に書く
- issueとの紐づけは `footer` に書く。実装して検証済みなら `Closes #XX`、未検証なら `Refs #XX`
- 破壊的変更は `footer` に `BREAKING CHANGE: <説明>`

### 例

```
feat(layouts): 新下駄配列を追加する

面モデルのsimultaneous triggerで定義できることの検証も兼ねる。

Closes #XX
```

```
fix(model): 同指連続でホームキーを打つ場合の距離を計上する

g=0では物理的に復帰する時間がないため、k == H_fでもd_stayを採る。
異論がありうるのでsfb_home_costで切り替え可能にした。

大西 / N=3 / 混合のテキスト10044字: 総距離AAAu → BBBu（実際に測った値を書く）

Refs #XX
```

## commit-msgフック

規約違反をcommit時点で弾くフックを `.githooks/` に置いてある。
clone直後に、本体のチェックアウトで1度だけ有効化する。

```bash
git config core.hooksPath .githooks
```

設定はworktreeと共有されるので、worktreeの中では打たない。
サブエージェント用のworktreeを作る時に、値が絶対パス（本体の `.githooks`）へ書き換わるが、値は直さない。
hooksは本体のチェックアウトにある版が使われるので、リードは単位を始める前に本体を `origin/main` に保つ。

検査するのは次の4点。`Merge` / `Revert` / `fixup!` / `squash!` で始まるメッセージは
gitが形を決めるので素通しする。

| 検査 | 内容 |
|---|---|
| 形 | 1行目が `<type>(<scope>): <件名>` になっているか |
| 長さ | 1行目が72文字以内か |
| 句点 | 件名が `。` で終わっていないか |
| 空行 | 2行目が空行か（本文を書く場合） |

検査より前に、メッセージ中のセッションURLの行（行頭の `Claude-Session:`）を消し、Claudeの共作者の行（`Co-Authored-By: Claude … <noreply@anthropic.com>`）からメールアドレスだけを外す。人間の共作者の行は触らない。

フック自身の挙動は `test/commit-msg.test.ts` が検証する。CIもPRの各コミットに同じスクリプトを掛ける。

## 書式とlint

書式と一般的な誤りの検査は Biome（設定は `biome.json`）が受け持つ。依存の向きの検査は `test/architecture-layers.test.ts` が持つ。

- `npm run lint`: 検査だけ（書き換えない）。CIの `verify` ジョブも同じ検査を回す
- `npm run format`: 書式を書き換える
- 対象は `src`・`test`・`e2e`・`scripts` とルートの設定ファイルの `.ts`・`.tsx`・`.js`・`.mjs`・`.cjs`。CSS・JSON・`.gitignore` にあるもの・`test/fixtures/`・`patches/` は対象外
- 切っている規則は `biome.json` の `linter.rules` にある。直す単位を別のissueにして順に入れ、直したら `off` を外す
- 書式だけを変えたコミットは `.git-blame-ignore-revs` に載せる。手元の `git blame` で読み飛ばすには、clone直後に1度 `git config blame.ignoreRevsFile .git-blame-ignore-revs` を打つ（GitHubの画面は、このファイルを自動で読む）

## 読みの辞書

漢字の読みの解析に使う辞書（IPADICの zip）は、リポジトリに置かず、`npm run dev` と `npm run build` が `.cache/dictionary/`（追跡しない）へ取る。
版・取得元・sha256は `src/platform/reading/dictionary-spec.ts` に固定してあり、sha256が合わなければ止まる。置き場に合う zip があれば取り直さない。
`npm test` は辞書を取得せず、ネットワークに頼らない。置き場に zip がある時に、実際の辞書で解析する検査が走る。手元で zip が無ければ飛ばす。
CI（`CI` が設定されている環境）では飛ばさず、zip が無ければ失敗する。`ci.yml` と `pages.yml` は Test の前に `scripts/dictionary-fetch.ts` を回して zip をそろえるので、この検査は必ず走る。
公開物には zip と告知文（`lindera-ipadic-NOTICE.txt`）が入る。CIは zip を `dictionary-spec.ts` のハッシュをキーにキャッシュする（`ci.yml`・`e2e.yml`・`pages.yml`・`update-screenshots.yml`）。
取得元のリリースから zip が消えて過去のタグのビルドが失敗した時は、同じ zip を別の場所へ置いて `upstreamUrl` を差し替えれば、同じ公開物を作り直せる。

## ブランチとPR

- `main` に直接pushしない。`<type>/<短い説明>` のブランチを切る（例: `feat/kana-layout-form`）
- push前に `npm run lint`・`npm run typecheck`・`npm test`・`npm run build` を通す。ブラウザe2eは手元で全件を回さず、CIの結果を読む（「ブラウザe2e」）
- 開発に使う npm は `package.json` の `packageManager` に書いた版（npm 11）。Node 22 付属の npm 10 で `npm install`・`npm ci` を打つと `devEngines` の検査で失敗するので、`npm install --global npm@11` で入れ替える。CIの `npm ci` を回すジョブも同じ版に入れ替えてから回す
- `main` へのマージは、リリースPRを除いて公開しない（「公開」）。CI（test / typecheck / build / browser-e2e）は通る状態を保つ

### 作業単位の切り方

- 各単位を `main` から切り、PRのbaseも `main` にする
- 積む（スタックPR）のは、未マージの単位に依存する時だけ
- push済みのブランチはrebase・強制pushしない。`main` や下のブランチの変更は、それをマージして取り込む
- 並行作業はgit worktreeを分けてよい。同じファイルに触る単位は並行にせず直列にする
- worktreeの `node_modules` は `.worktreeinclude` で本体から複製されるが、`.bin` のリンクは複製されない。差分が `package.json`・`package-lock.json`・`patches/` のどれかを含むなら `npm ci`、含まなければ `npm rebuild --ignore-scripts` を1回流してから使う

### マージ

オーナーはいつでもマージしてよい。エージェントがマージするのは、baseが `main` のPRで、次を全部満たす時だけ。

- 実装者と別のレビュアー（区分で決まるレビュー役のエージェント）が、現在のheadを承認している。スタックなら全PRのheadについて。レビュー後に修正コミットを足したら、再レビューを受ける
- headのCIが緑。CIはマージの必須条件にしていないので、`gh api repos/tokiokashi/keydist/commits/<sha>/check-runs` で自分で確かめる
- PRのheadが今の `origin/main` を祖先に含まない時は、`main` をマージした状態で `npm run lint`・`npm run typecheck`・`npm test`・`npm run build` が通る。リードがマージの直前に確かめ、e2eは見ない
  - `git fetch origin main <ブランチ>` の後に `git merge-base --is-ancestor origin/main origin/<ブランチ>` が0で終われば、この検査は要らない
  - 一時の作業ツリーは `origin/<ブランチ>` から作る。`FETCH_HEAD` は使わない。直前の `git fetch` が複数のrefを取ると、`FETCH_HEAD` の先頭が `main` を指す
  - 一時の作業ツリーには `node_modules` が無い。差分に `package.json`・`package-lock.json`・`patches/` が含まれる時は `npm ci` し、含まれない時は本体の `node_modules` をsymlinkする。symlinkは `git worktree remove` の前に外す
  - 衝突した時か検査が落ちた時は、実装役に `main` をマージさせ、新しいheadで再レビューを受ける
- 推奨案で決めた選択があれば、PR本文の「決めきれなかった点」に挙げてある
- PRで直さずに残すもの（後続）は、マージ前にissueにしてマイルストーンを決め、PR本文にはその番号だけを書く

スタックに入っていないPRは直接マージし、スタックは一番上のPRに `merge-stack` ラベルを付けて入れる（「スタックPR」）。
リリースPRは、オーナーにリリースを頼まれている時だけマージしてよく、条件は下の「リリースPRの条件」に置き換わる。

リリースPRの条件。次を全部満たせばマージしてよい。

- `git diff --stat origin/main...<head>` が `package.json` と `package-lock.json` だけで、`main` から分かれた後が1コミットである
- 変更が `package.json` の `version` と、`package-lock.json` の `version`（ルートと `packages[""]`）だけである。
  `node .github/scripts/release-version-only.cjs "$(git merge-base origin/main <head>)" <head> <新しい版番号>` が0で終われば通り、非0なら標準出力に外れた箇所が出る
- headのCIが緑である（`verify` はpushとpull_requestの両方のrun、`browser-e2e` はpull_requestのrun）
- その版のマイルストーンの開いたissueが0件である

`release-plan.sh` がマージ後に機械で確かめる項目を、スタブで再現して確かめ直さない。

方式はmerge commit（クラウドのセッションでは `gh api -X PUT repos/tokiokashi/keydist/pulls/<番号>/merge -f merge_method=merge -f sha=<承認したhead>`）。`sha` を付け、承認の後にheadが動いていたらGitHubに拒ませる。squash・rebaseマージは使わない。

### スタックPR

依存する変更を分けて出す時は、GitHubのstacked pull requests（2026年7月からpublic preview）を使う。
各PRのbaseを1つ下のPRのブランチにして積む。

- 作る: `gh stack init` → `gh stack add` → `gh stack submit`。baseを連鎖させて作った既存PRは `gh stack link` でスタックにまとめる
- スタックは線形（上のブランチが下のブランチを含む）でないとスタック機能でマージできない。下の変更は下のブランチを上へマージして取り込む。下の変更をcherry-pickで上に写す「sync」コミットは作らない（線形でなくなる）
- 上のPRを単独で下のブランチへマージしない。下のPRに混ざり、`main` の履歴で見分けられなくなる
- スタックのPRは、GitHubの非同期マージAPI（`merge-async`）でしかマージできない。一番上のPRで行うと下のPRも一緒に `main` へ入る。途中のPRで行うと一番下からそこまでが入り、上のPRは自動で `main` へ付け替わる。auto-mergeは使えない
- オーナーはPR画面か `gh stack merge` でマージする
- エージェントは、「マージ」の条件を満たした時に一番上のPRへ `merge-stack` ラベルを付ける。スタックのPRを通常のマージAPIやスタック外の手段でマージしない。
  ラベルを受けて `.github/workflows/merge-stack.yml` が次を行い、結果をPRにコメントしてラベルを外す（失敗しても外れるので、直してから付け直す）
  - 付けた人が書き込み権限を持つか、PRが `main` 向けの開いたスタックの一番上か、draft・未マージで閉じたPRが無いかを確かめる
  - スタックが `package.json` の `version` を変えていないかを確かめる（変えていたら断る。リリースPRはスタックに入れない）
  - 全PRのheadで `verify` / `browser-e2e` / `commit-messages` が成功し、他のチェックに失敗・実行中が無いかを確かめる。
    同じheadに、`verify` にはpush由来とpull_request由来が付き、`browser-e2e`（`e2e.yml`）にはpull_request由来だけが付く。
    (名前, event)ごとに最新の実行を取り、付いているものがどれも失敗・実行中でないことと、必須の各ジョブが少なくとも1つのeventで成功していることを求める（片方の成功でもう片方の失敗を隠さない）。
    判定のロジックは `.github/scripts/merge-stack-checks.cjs`（`test/merge-stack-checks.test.ts` で検証）
  - 判定してからマージ要求までの間に、どれかのPRのheadが動いていないかを取り直して照合する（動いていたら断る。付け直す）。
    `merge-async` のshaで固定できるのは一番上のPRだけなので、下のPRは照合で守る。照合とマージ要求の間の一瞬は固定できない
  - 一番上のPRを `merge-async`（merge commit）でマージし、終わるまで待つ
  - 「マージ」の条件のうち、レビュー・「決めきれなかった点」の記載・後続のissue化など上に挙げた以外のものは機械では確かめない。ラベルを付けることが、それらを全部満たしたという宣言になる
- `merge-stack` はsecret `STACK_MERGE_TOKEN`（Contents・Pull requestsにwriteを持つfine-grained PAT）でマージする。
  このリポジトリには設定してあるので、マージはオーナーとして行われ、`main` へのpushでCIと `release.yml` が走る
  （`version` を変えないので `release.yml` は何も公開せずに終わる）。
  未設定なら `GITHUB_TOKEN` に落ち、そのpushは別のワークフローを起動しないので `main` のCIも `release.yml` も走らない
- `STACK_MERGE_TOKEN` は有効期限が切れる。切れると `merge-stack` は認証エラーで失敗する。
  症状は、PRに何も書かれず、ラベルも残ったまま、Actionsの実行だけが赤くなること（スタックの中身の問題ではない）。
  ラベルを付けたのに反応が無ければ、Actionsの `Merge stack` の実行ログを見る。更新はオーナーだけが行う
  - GitHubの Settings → Developer settings → Fine-grained personal access tokens で、このリポジトリに Contents・Pull requests の write を持つトークンを再生成する
  - リポジトリの Settings → Secrets and variables → Actions で `STACK_MERGE_TOKEN` の値を差し替える
  - 更新後はPRの `merge-stack` ラベルを外して付け直す
- 下のPRが入ると、GitHubは上のブランチをサーバー側で書き換える（rebase）。rebase・強制pushの禁止はエージェント自身の操作の話で、
  これは対象外。書き換えられたブランチで作業を続ける前に、fetchしてローカルのworktreeをリモートのブランチに合わせる。
  古いローカルの履歴をpushしない
- 誤りを見つけたら、スタックの一番上に修正を積む。下のPRへコミットしない。まとめて入るのは一番上の状態なので、一番上が検証済みなら足りる。既存のコミットは書き換えない
- 同じリポジトリ内のブランチだけで組む（forkをまたげない）

## issueとマイルストーン

### 振り分け

| マイルストーン | 入れるもの |
|---|---|
| `vX.Y.Z`（例 `v0.2.0`） | その版に含めるもの。名前は出す予定の版番号（タグと同じ形）にする |
| `v1.0.0` | 新UIへの切り替え（旧UIの削除、「版番号」）までに要るもの |
| `later` | 版を決めていないもの。やらないと決めたものは入れずに閉じる（閉じるかはオーナーが決める） |

- 開いているissueは、いずれか1つのマイルストーンに入れる。マイルストーンが無いのは作った直後だけにし、作った人がその場で振り分ける
- 次の版のマイルストーンは、次の版に入れると決めたものだけにする。入れるのは、オーナーが決めたその版の範囲に入るものだけ。迷うものは `later` に置き、入れると決めた時に移す
- 出す版番号が変わったら（patchでなくminorにする等）、マイルストーンの名前を付け替える。issueを移し直さない

### オーナー判断待ち

オーナーが決めていない選択を含むissueには、ラベル `needs-decision` を付ける。本文か最後のコメントに、何を決めてほしいかと選択肢を書く。
決まったら、決まった内容をコメントに残してラベルを外す。

`needs-decision` の付いたissueは、下の「待ち時間の作業」「ついでに直す」に取らない。

### リリースの前に片付ける

リリースPRを作る前に、その版のマイルストーンの開いたissueを0件にする。1件ずつ、次のどちらかにする。

- 直す（PRで `Closes #XX`）
- 次の版のマイルストーンへ移す。移す時は、なぜ今の版で直さないかを一言issueにコメントする

`needs-decision` のissueが残っていたら、オーナーに決めてもらうか、次の版へ移す。
マイルストーンは、リリースPRのマージ後に閉じる。

### 待ち時間の作業

本線の作業単位がレビュー待ち・CI待ち等で止まっている間は、別の作業単位で今の版のマイルストーンの小さいissueを片付ける。

- 開いている他の作業単位（本線を含む）が触っているファイルを触るissueは取らない（「作業単位の切り方」の、同じファイルは直列にする規則）
- 本線と同じく `main` から切り、別のworktreeで作る。本線のブランチに積まない

小さいissueの目安は、次を全部満たすもの。

- 触るのが1ファイル〜数ファイルで、1つのPRで閉じる
- 仕様（`spec/`）の変更を伴わない。測定値が動かない
- オーナーの未決を含まない（`needs-decision` が付いていない）

### ついでに直す

同じファイルを触るPRでは、そのファイルにかかる小さいissueをついでに直してよい。PR本文に `Closes #XX` を書く。
PRの目的と関係の無い変更が増えてレビューしにくくなるなら、別のPRに分ける。

## 依存の自動更新

`.github/dependabot.yml` のDependabotが、毎週月曜の朝（日本時間）に依存の更新PRを作る。CIは通常のPRと同じように回る。

- 更新は次のグループごとに1つのPRになる: `tanstack`（`@tanstack/*`）・`vite`（`vite`・`@vitejs/*`）・`react`（`react`・`react-*`・`@types/react*`）・`playwright`・`nitro`・`dev`（その他の開発用の依存）・`app`（その他の実行時の依存）。
  依存は設定の上から最初に当たったグループに入る
- `nitro` はbeta版なので、他の更新に混ぜずに単独のPRにする。破壊的な変更が入りやすいので、他のグループより厳しく見る
- セキュリティ更新は、`security` グループの1つのPRにまとまる
- 更新PRのコミットの件名は `build(deps): …` / `build(deps-dev): …` になる。`commit-messages` の検査（72文字以内）を通る。
  Dependabotが件名を72文字以内に切り詰める。通らない件名のPRが来たら、`dependabot.yml` のグループ名を短くする
- 更新PRも、通常のPRと同じ条件（独立したレビューの承認・CIの緑）でマージする

### patchの当たらない更新

`patches/` のpatchは、上流の不具合を回避するために、`package.json` に無い推移的依存に当てる（今はpatchが無い）。当てる依存は設定の対象に直接入れず、
直接依存の更新に任せる。`postinstall` の `patch-package --error-on-fail` の挙動は次の通り。

- patchのファイル名の版と入った版が違っても、patchが当たれば警告だけで通る
- patchが当たらなければinstallが失敗する。更新PRのCIが落ちて気づく

patchが当たらなくなった更新PRは、そのままマージしない。同じPRのブランチに、新しい版へ作り直したpatchを足してからマージする（古いpatchは消す）。
上流で直ってpatchが不要になった時も同じで、patchを消す。

## 公開（GitHub Pages）

公開物は常に `vX.Y.Z` のタグで辿れるものに限る。版番号の正は `package.json` の `version` で、タグは `v` + `version` と一致しなければ公開されない。
公開は次の2つでだけ起き、どちらも `main` の上で走る。

| 起点 | 誰が | 何が公開されるか |
|---|---|---|
| リリースPRのマージ（`.github/workflows/release.yml`） | オーナー、または頼まれたエージェント | リリースPRのheadのコミット |
| 手動実行（`pages.yml` の Run workflow、入力は既存のタグ名） | オーナー | 指定したタグのコミット |

それ以外の `main` へのマージは公開しない。`main` を開発の合流点として動かしても公開物は変わらない。
タグをpushしても公開されない。
手動実行もブランチに `main` を選んだ時だけ受け付ける。

### リリースPR

- エージェントはオーナーに頼まれた時だけリリースPRを作る。自分の判断でリリースを始めない。
  頼まれていれば、「マージ」の「リリースPRの条件」を満たした時に自分でマージしてよい
- リリースPRはリード（エージェント本人）が `npm version` で作ってよい。実装役（implementer）に出さない
- 作る前に、その版のマイルストーンの開いたissueを0件にする（「リリースの前に片付ける」）
- 作り方: 最新の `main` から `chore/release-X.Y.Z` を切り、`npm version <minor|patch> --no-git-tag-version` で
  `package.json` と `package-lock.json` の `version` だけを上げ、`chore(release): X.Y.Z` でコミットする。
  PRのタイトルも `chore(release): X.Y.Z` にする（`release.yml` はこのタイトルでリリースPRを見分ける）
- リリースPRは `main` から分かれた後の1コミットだけで、`package.json` と `package-lock.json` しか変えない。
  `release.yml` が機械的に確かめ、外れていれば公開しない
- 公開されるのはPRのheadのコミットで、マージコミットではない。PRを作った時点の `main` に固定され、
  マージまでの間に `main` へ入った別の作業は含まれない。だから `main` はリリースを待たずに進めてよい
- 開いておくリリースPRは1つだけ。後から入った作業も含めたくなったら、今のリリースPRを閉じ、新しい `main` から作り直す。
  リリースPRのブランチに `main` をマージして更新しない（何を公開するのかがPRの差分から読めなくなる）
- merge commitでマージする。`release.yml` は、マージコミットを作ったPRがリリースPRで、そのheadの `version` が
  `X.Y.Z` であることを確かめてから、headに注釈付きタグ `vX.Y.Z` を打ち、同じ実行の中で配信する
  （`GITHUB_TOKEN` で打ったタグは `pages.yml` を起動しないため、`release.yml` が `pages.yml` を呼ぶ）
- リリースPR以外で `version` を変えたPRが入ると、`release.yml` は失敗して公開しない（エラーに原因のPRを出す）。`version` は下げない
- PRが見つからないという失敗は、APIへの反映が遅れただけのことがある。その時は「Re-run all jobs」で直る
- 同じ版番号のタグが別のコミットに既にあると失敗する。同じ番号で中身の違う公開は作らない

### 版番号

- 安定するまでは `0.x.y`
- 利用者から見て新しくできることが増えるリリースは minor（`npm version minor`）、公開済みの版を直すリリースは patch（`npm version patch`）
  - 線引きは厳密にしない。直しの中に小さな機能が混ざっても、オーナーが直しだと判断すれば patch でよい。
    版番号の分類のためにリリースを分けたり、作業をマイルストーン間で動かしたりしない
- `v1.0.0` は新UIへの切り替え（旧UIの削除）のために取っておく
- 最初のリリースは `v0.1.0`。そのため `main` の `version` は `0.0.0` にしてあり、最初のリリースPRで `npm version minor` すると `0.1.0` になる

### 配信し直す・戻す

- 同じ版を配信し直す: Actions画面でその公開の実行（「Release」か「Deploy to GitHub Pages」）を開き「Re-run all jobs」。
  タグが既に同じコミットにあれば打ち直さずに配信だけする。再実行は最初の実行から30日以内に限られる
- 前の版に戻す: Actions画面の「Deploy to GitHub Pages」→「Run workflow」で、戻したい版のタグ名（例 `v0.1.0`）を入れる。
  受け付けるのは既存の `vX.Y.Z` タグだけで、ブランチ名・SHA・存在しないタグは拒否する。30日の制限も無い。
  タグの無いコミットは公開できない（公開物を常にタグで辿れるようにするため）
- 戻す代わりに、直した版を patch のリリースPRで出す方法もある。問題の原因が分かっているならこちらが先
- クラウドのエージェントは手動実行ができない（403）。戻す・30日を過ぎて配信し直すのはオーナーの操作になる

### 公開先のURL

- アプリを置くパス（viteの `base`）は、`pages.yml` が配信のたびにPagesの設定の公開先のURLから決める。
  独自ドメインなら `/`、`tokiokashi.github.io/keydist/` なら `/keydist/` になる。リポジトリにパスもドメイン名も書かない
- Settings → Pagesで独自ドメインを付け外しすると、その時点で配信されている公開物は前のパスのままなので、画面が読み込めなくなる。
  付け外しの直後に「Deploy to GitHub Pages」を今の版のタグで手動実行して、新しいパスで作り直す
- 公開はGitHub Actionsから行うので、`CNAME` ファイルは置かない（Actionsからの公開ではPagesが読まない。ドメインの正はSettingsの設定）
- CIの `build` は `/keydist/` で組む。ルート以外のパスに置いても壊れないことを確かめるため

### リリース前の確認（staging）

`main` をリリースの前に画面で確かめられるよう、`.github/workflows/staging.yml` が本番と別のURLへ配信する。
配信先はCloudflareのWorkerで、設定は `.github/staging/wrangler.jsonc` にある。本番の公開とは独立していて、ここで配信したものは本番に出ない。

- `main` へのpushのたびに、そのコミットを https://keydist-staging.tokiokashi.com/ へ配信する
- マージ前のブランチを先に見たい時は、Actions画面の「Deploy to staging」→「Run workflow」でブランチを選ぶ。クラウドのエージェントは手動実行ができないので、オーナーの操作になる
- 配信先は1つだけで、最後に配信したものが残る。ブランチを手動で配信した後は、次の `main` へのpushで `main` に戻る
- URLが固定なので、stagingのブラウザの保存データは配信をまたいで残る。本番とはオリジンが違うので、本番の保存データは見えない
- すべての応答に `X-Robots-Tag: noindex` を付け、検索エンジンに載せない
- リポジトリのSecretsに `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` が無い間は、配信せずに成功で終わる

## 性能の予算

`perf.yml` が、PRごとにベース（PRのbase）とheadを同じjobの中でビルドし、計算の時間とバンドルサイズの差分をjob summaryに出す。

- 計算の時間（`scripts/bench-engine.ts`）: 既定の日本語テキストと英文サンプルを、代表的なSetupでTrace生成・解釈・主要な抽出に通した時間。漢字を読みに直す段は時間に入れない。ベースとheadを交互に2回ずつ測り、最小値を比べる。報告だけで、失敗にしない。共有のランナーは時間がばらつくので、ばらつきを見てから閾値を決める
- バンドルサイズ（`scripts/measure-bundle.ts`）: 事前描画したページが最初に読み込むJavaScriptとCSS、計算用Worker、公開物全体のgzipサイズ。headが `scripts/bundle-budget.json` の上限を超えたらjobが失敗する
- 上限は、導入時のgzipサイズの1.1倍を1000 byte単位に切り上げた値。意図した増加で超える時は、同じPRで上限を引き上げ、理由をPR本文に書く
- 手元で測る時は、`npm run build` の後に `node --experimental-strip-types scripts/measure-bundle.ts --out <json>`、`node --expose-gc --experimental-strip-types scripts/bench-engine.ts --out <json> --texts-file <json>` を回す。差分の表は `scripts/perf-report.ts` が作る
- 計算をWeb Workerへ移す基準は `docs/architecture.md` の「依存の規則」にある

## テスト

`node --test` を使う。unit test は主対象のソース隣へ `src/**/*.test.ts` として置く。`test/*.test.ts` には architecture・commit-msg などリポジトリ横断の検査だけを置き、fixture は `test/fixtures/` に置く。

- モデルの分岐（仕様 §9の `g` による場合分け）を変えたら、対応するテストを足す
- 配列を追加したら「全かなが打てる」ことを検証する既存テストに乗せる

### 書くテストと書かないテスト

テストは、そのテストが要るかを先に決めてから書く。要るのは、壊れた時に、使っていても気付けないまま害が出て、その害がテストを書いて保守する手間より大きい所だけである。
害は次の3つを指す。

- 利用者が誤った数値を読む事
- 利用者のデータが失われる事
- 層の依存やCIのように、後の変更が前提にする開発の規則が崩れ、誤った前提の上に変更が積み重なる事

要らないテストを足し続けると、テストが実装の写しになる。仕様や画面を変えるたびにテストも書き直す事になり、変更の手間が倍になる一方で、何も検出できない。

テストで守る性質は次の4つ。

- 数値: 距離・Trace・指標が仕様の通りで、リファクタで動かない事。図と表で、値を別の値と取り違えさせない事も含む。図の点の名前どうしが重ならない事、図の座標と目盛りが値と一致する事、誤読される補助線を引かない事（`AGENTS.md`「数値を扱う時・外に出す時」）がその例である。
  抽出と指標の固定値（`test/*-regression.test.ts`）はこの性質のテストである
- 配列の定義: 作者の資料と一致し、全かなが打てる事
- 利用者のデータ: 元に戻す操作・別タブとの同期・保存・保存データの移行で、データが実際に消えない・書き換わらない事。
  操作の前に、消える・置き換わる値の範囲を利用者に伝える文の、範囲の部分も含む。範囲を誤って伝えると、利用者は気付かないまま、残したい値を消す操作をする
- 開発の基盤: 層の依存の向きの検査、別々のファイルに書いた一覧どうしの一致の検査、CI・フック・エージェントの定義の検査。
  一覧の一致は、`src/hosts/workspace/single-analyzers.ts` と `analyzer-registry.ts` の登録の一致がその例である。エージェントの定義は、`reviewer` と `reviewer-strict` の本文の一致がその例である

ページのe2eは、上の性質とは別に、ページごとに1本持つ。範囲は「ブラウザe2e」の「e2eに書く範囲」に従う。図の描画は、図のスクリーンショット（`e2e/visual-figures.spec.ts`）で見る。

テストを足す前に、その対象が壊れた時に何が起きるかを考える。上のどれかが、気付かれないまま崩れるなら書く。表示・文・配置が変わるだけなら、使えば気付けるので書かない。
次のテストは書かない。

- 画面に出る文の言い回しや、知らせ・注意・説明の文にどの値や種類が挙がるかを確かめるテスト。
  上の「利用者のデータ」に挙げた、操作の前に消える範囲を伝える部分は除く。操作の後の知らせが誤っていても、データそのものは変わらない
- 画面の文言の規約（開発の内部の語を出さない等）を確かめるテスト。規約に反した語が出ても、数値もデータも変わらず、後の変更の前提にもならない。規約はレビュー役がPRごとに確かめる
- 定数・列の定義・ラベルの並びを写して比べるテストと、型検査が既に保証している事を確かめるテスト
- 名前の置き場所の選び方・目盛りの刻みの段数・余白・ページの配置・折り返し・幅ごとの見え方のように、使えば見えて値の取り違えにつながらない表示を確かめるテスト
- 消した表示・文言・設定項目が無い事を確かめるテスト
- 不具合の修正で、その不具合の再発だけを見張るテスト。直った事は手元の実行で確かめる。
  上の性質の不具合は、その性質のテストとして書く

既存のunit testが上のどれかに当たっていても、まとめて消す作業はしない。unit testは残しても実行が速く、1本ずつ確かめて消す手間の方が大きい。消すのは、作業単位で書き換えたテストに限る。
既存のe2eは、実行に時間がかかり、仕様を変えるたびに書き直しが出るので、まとめて減らす。残す本を先に決め、それ以外はspecごとに消す。レビューは、残す本が「e2eに書く範囲」を満たすかを確かめる。

### テストの役割分担

層ごとに、何をどのテストで検査するかを決めてある。数値で判定できるものは、ブラウザを使わない上の層のテストへ寄せる。

| 対象 | テスト | 置き場 |
|---|---|---|
| input・trace・interpretation・engine・各Analyzerの抽出 | `node --test`（unit test） | 主対象のソースの隣（`src/**/*.test.ts`） |
| 抽出と指標の結果 | 固定入力に対する期待値の固定（fixture） | `test/*-regression.test.ts` と `test/fixtures/` |
| 図（数値が合っていても起きる重なり・欠け・色・配置） | Playwrightの `toHaveScreenshot`（基準の画像との比較） | `e2e/visual-figures.spec.ts` と `e2e/screenshots/` |
| ページ（ページごとの1本と、ブラウザでしか起きないデータの場面） | Playwrightのe2e | `e2e/*.spec.ts` |

- `node --test` は型を除去するだけでJSXを変換できない。`.tsx` をimportするテストは書けないので、描画に依らない計算は `.ts` に分けてunit testで検査し、描画は図のスクリーンショットとページのe2eで見る
- 図の数値が合っていることは、unit testとfixtureで固定する。スクリーンショットは、数値が合っていても起きる崩れだけを見る。数値の検査をスクリーンショットに寄せない
- スクリーンショットは、図の本体だけを撮る。ペインの枠・条件の表示・見出しは含めない。
  対象はBigram FlowとHeatmapから始め、図を足す時は `e2e/visual-figures.spec.ts` に1件ずつ足す

### 合計件数は環境によって変わる

`npm test` が報告する件数は実行環境で変わる。`test/commit-msg.test.ts` の17件は
bashの無い環境では丸ごとスキップされるため、その分だけ少なく出る。

件数が17ずれている時は、まずこの差を疑う。PR本文に件数を書く時は `# pass` と `# skipped` を併記する。
CI（ubuntu）では必ず全件走るので、判断に迷ったらCIの数字を正とする。

### ブラウザe2e

`e2e/*.spec.ts` はPlaywright（`npm run test:browser`）で動かす。CIの `browser-e2e`（`.github/workflows/e2e.yml`）が全件を回す。
4つのshard（`browser-e2e-shard (1/4)`〜`(4/4)`）へ分けて並列に回す。shardごとのビルドを含めて、1つのshardは約1分で終わる。
`browser-e2e` というジョブがshardの結果を1つにまとめる。必須チェックの名前はこの `browser-e2e`。

走るのは `pull_request`（draftを含む）・`main` へのpush・`workflow_dispatch` だけ。`main` 以外のブランチへのpushでは走らない。
PRを開く前に全件を見たい時は、draft PRを開くか、`e2e.yml` を `workflow_dispatch` で回す。

`pull_request` で、baseとの差分のファイルが全部 `*.md` なら、shardを走らせず `browser-e2e` だけがsuccessになる。
判定は拡張子で行う（`main` へのpushと `workflow_dispatch` は常に全件）。

- 2つのproject（`playwright.config.ts`）で回す。`pc` は全てのspecをPCの幅（Desktop Chrome）で回し、`mobile` は幅390×844で、タグ `@page` を付けた本だけを回す。
  ページの本には `import { PAGE_TAG } from './fixtures.ts'` で取った印を `test('名前', { tag: PAGE_TAG }, async ({ page }) => { ... })` の形で付ける。
  印を付けた本は、`e2e/fixtures.ts` の自動fixtureがブラウザのエラー・警告を集め、本の最後に空である事を確かめる。
  データの場面と `visual-figures.spec.ts` には印を付けず、`pc` だけで回す。`mobile` で通らない本は、ページの本の範囲で操作を直す（幅に依存する検査は書かない）
- 手元では、触ったspecだけを1ワーカーで回す: `npx playwright test e2e/<触ったspec>.spec.ts --workers=1`
- `@playwright/test`（`package.json`）が要求するブラウザの版が実行環境に無いと、「Executable doesn't exist」で1件も起動しない。
  版が合わないエラーが出たら `npx playwright install chromium-headless-shell` で入れてよい（入るのは追跡しないファイルだけ）。
  symlinkなどの回避策は作らない
- 手元のdev serverのポートはworktreeごとに決まる（configのあるリポジトリのルートの絶対パスから4200〜4999。どのディレクトリから回しても同じ）。並行する別worktreeでも、一時のconfigを作らずそのまま回せる。
  ポートが別のworktreeのserverと重なった時は、e2eの実行が最初に止まり、`KEYDIST_E2E_PORT` で変えるよう案内が出る。
  実行の冒頭に出る `e2e: http://127.0.0.1:<ポート>` が、当たるserverのポート。`KEYDIST_E2E_PORT=<番号>` で固定もできる。CIは4173の固定
- 全件は、draft PRを開くか `e2e.yml` を `workflow_dispatch` で回して、CIの結果を読む。headのコミットのcheck runを見る

  ```bash
  sha=$(git rev-parse HEAD)
  curl -s "https://api.github.com/repos/tokiokashi/keydist/commits/$sha/check-runs" \
    | jq -r '.check_runs[] | "\(.name)\t\(.status)\t\(.conclusion)"'
  ```

  `browser-e2e` の `status` が `completed`、`conclusion` が `success` なら通っている。
  どのshardが落ちたかは `browser-e2e-shard (N/4)` の行で分かる。
  失敗時はActionsの実行に、落ちたshardごとに `browser-e2e-trace-<N>`（`test-results/`）が7日間残る
- `merge-stack` はジョブの名前と起動元（event）ごとに最新の実行を取る。`browser-e2e` はpull_requestにしか付かないので、その成功を求める。
  必須でないジョブも、failureなら止める（`browser-e2e-shard` のfailureも同じ）
- `main` へのpushは、続けてマージしても途中のマージコミットの実行を取り消さない（`e2e.yml` と `ci.yml` のconcurrencyはmainだけコミットごとのgroupにし、main以外は同じブランチの古い実行を取り消す。同じgroupのpendingは新しい実行に置き換わって取り消されるため、mainではgroupを分けている）

#### スクリーンショットの基準の画像

`e2e/visual-figures.spec.ts` は、`e2e/screenshots/` の基準の画像と図を比べる。

- 比べるのはCIだけ。基準の画像は、CIの `browser-e2e` と同じ環境（`ubuntu-latest`・Node 22・`npx playwright install` で入れるChromium・`CI=1`・本番ビルドとpreviewの配信）で作る。
  手元は環境が違い、描画が1画素ずれるので、手元ではこのspecを飛ばす（`CI` が空の時）。`npx playwright test e2e/<spec> --workers=1` の手順のまま、落ちずに飛ばされる
- 固定するもの。`e2e/screenshot-helper.ts` が、画面の大きさ（1280×900）・テーマ（ライト）・動き（`prefers-reduced-motion: reduce` と `animations: 'disabled'`）・フォントを固定する。
  フォントはrunnerに入っているものに頼らず、`package-lock.json` で版を固定したnpmのパッケージ `@fontsource-variable/noto-sans-jp` を、アプリのサーバーを通さずに配って全要素へ当てる。
  runnerのイメージが更新されても、字形と幅が動かない。比較の許容は `playwright.config.ts` の `expect.toHaveScreenshot` に置く（文字の縁の揺れだけを許す小ささ）
- 図の見た目を変えるPRは、基準の画像を作り直して同じPRに入れる。行うのはPRを作った人（エージェントなら実装役）。
  1. PRにラベル `update-screenshots` を付ける。付けると `Update Screenshots`（`.github/workflows/update-screenshots.yml`）が走る。
     同じPRで作り直しをもう一度したい時は、ラベルを外して付け直す。Actions画面から `workflow_dispatch` で起動する方法は、workflowのファイルが `main` にある時だけ使える
  2. 実行が終わったら、artifact `screenshots` を取る。`gh run list --workflow update-screenshots.yml --branch <ブランチ>` で実行を探し、`gh run download <run-id> -n screenshots -D <空のディレクトリ>` で取る
  3. 取ったファイルを `e2e/screenshots/` に置いてコミットし、pushする。workflowは画像をコミットしない（`GITHUB_TOKEN` によるpushではCIが走らず、そのheadに `browser-e2e` のcheck runが付かないため）
  4. 置いた画像を目で確かめ、意図した変化だけであることをPR本文に書く
- 画像が無い、または図が変わっていると、`browser-e2e` のこのspecが落ちる。差分の画像は、失敗時のartifact（`browser-e2e-trace-<N>`）に入る

e2eの本文: 字数に依存しない検査は、短い本文（`e2e/short-text-helper.ts` の `SHORT_TEXT_REF`）を使う。個別画面は `e2e/fixtures.ts` の `test` が既定で短い本文から始め、保存値でWorkspaceを作る検査は保存値の `text` に `SHORT_TEXT_REF` を書いて `useShortText(page)` を呼ぶ。既定のテキストを使うのは、`standalone-bigram-flow.spec.ts` の全部の検査と、`fixtures.ts` を通さない `visual-figures.spec.ts`・`text-content-timer-race.spec.ts` だけである。

e2eに書く範囲: ページのe2eは、次の2種類だけにする。図のスクリーンショットは、上の「スクリーンショットの基準の画像」に従う。e2eで確かめたくなった計算は、unit testに移す。

- ページごとに1本: ページを開き、エラーを出さずに中身が描かれ、そのページの主な操作を1回して結果が画面に出る事を確かめる。PCの幅とスマホの幅で1回ずつ回す。
  unit testはコマンドを直接呼ぶので、画面の部品とコマンドのつながりが切れても通る。オーナーが開かないページやスマホの幅で、つながりが切れたまま公開される事を防ぐ
- 利用者のデータのうち、ブラウザでしか起きない場面: 再読み込みの後の復元、別タブとの書き込みの競合、画面をまたぐ元に戻す操作、共有リンクで開いた時の条件
- 2つ目以降の操作の組合せ、細かいはみ出し・折り返し・幅を変えた時の境目は書かない
- ブラウザのエラー・警告（ResizeObserver・Hydrationの不一致など）を確かめる時は `e2e/browser-errors-helper.ts` の `collectBrowserErrors` を使う。
  `page.on('console')` と `page.on('pageerror')` だけでは、ResizeObserverの警告（`window` の `error` にだけ届く）を捕まえない
- エラーの文に依存する検査は、開発用のbuild（dev server）と本番用のbuild（CIと同じ `npm run build && npm run preview`）の両方で製品を壊し、落ちることを確かめる。
  本番用のReactは、文の代わりに `Minified React error #418` のような番号だけを出す

