# 開発の作法

## コミットメッセージ

[Angular Commit Message Conventions](https://github.com/angular/angular/blob/main/contributing-docs/commit-message-guidelines.md)に従う。

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 1行目（必須）

- `type` と `scope` は**英小文字**。`subject` は**日本語**でよい
- `subject` は命令形・現在形（「追加する」「直す」）。過去形にしない
- 末尾に句点（`。`）を付けない
- 1行目は72文字以内に収める（バイト数ではなく**文字数**）
- 本文を書く場合は、1行目との間に**空行**を入れる

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

**測定値が変わる変更は `fix` か `feat`。** `refactor` は数値が1桁も動かない時だけ使う。

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
| `ui` | `src/ui/` `src/app/` `src/routes/` `src/legacy/` |
| `deps` | 依存関係の更新 |

### body / footer

- `body` は**なぜ**その変更をしたかを書く。何をしたかはdiffが語る
- 数値が変わる変更なら、変更前後の値を `body` に書く
- issueとの紐づけは `footer` に `Closes #12` / `Refs #12`
- 破壊的変更は `footer` に `BREAKING CHANGE: <説明>`

### 例

```
feat(layouts): 新下駄配列を追加する

面モデルのsimultaneous triggerで定義できることの検証も兼ねる。

Closes #15
```

```
fix(model): 同指連続でホームキーを打つ場合の距離を計上する

g=0では物理的に復帰する時間がないため、k == H_fでもd_stayを採る。
異論がありうるのでsfb_home_costで切り替え可能にした。

大西 / N=3 / かな290文字: 総距離148u → 153u

Refs #1
```

## commit-msgフック

規約違反をcommit時点で弾くフックを `.githooks/` に置いてある。
clone直後に1度だけ有効化する。

```bash
git config core.hooksPath .githooks
```

検査するのは次の4点。`Merge` / `Revert` / `fixup!` / `squash!` で始まるメッセージは
gitが形を決めるので素通しする。

| 検査 | 内容 |
|---|---|
| 形 | 1行目が `<type>(<scope>): <件名>` になっているか |
| 長さ | 1行目が72文字以内か |
| 句点 | 件名が `。` で終わっていないか |
| 空行 | 2行目が空行か（本文を書く場合） |

フック自身の挙動は `test/commit-msg.test.ts` で検証している（`npm test` に含まれる）。
CIもPRの各コミットに同じスクリプトを掛けるため、フックを有効化し忘れてもPRで落ちる。

## ブランチとPR

- `main` に直接pushしない。`<type>/<短い説明>` のブランチを切る（例: `feat/kana-layout-form`）
- push前に `npm test` と `npm run build` を通す
- `main` へのマージは、リリースPRを除いて公開しない（「公開」）。CI（test / typecheck / build）は通る状態を保つ

### 作業単位の切り方

- 原則は浅く積む。各単位を `main` から切り、PRのbaseも `main` にする
- 積む（スタックPR）のは、未マージの単位に本当に依存する時だけ。深く積むほど、下の修正やマージのたびに上の追従が要る
- push済みのブランチはrebase・強制pushしない。`main` や下のブランチの変更は、それを**マージして**取り込む
- 並行作業はgit worktreeを分けてよい。同じファイルに触る単位は並行にせず直列にする。衝突を後で解く手間の方が大きい

### マージ

オーナーはいつでもマージしてよい。エージェントがマージするのは、baseが `main` のPRで、次を**全部**満たす時だけ。
スタックに入っていないPRは直接マージし、スタックは一番上のPRに `merge-stack` ラベルを付けて入れる（「スタックPR」）。
リリースPRは、オーナーにリリースを頼まれている時だけマージしてよい（「公開」）。

- 実装者と別のレビュアー（レビュー役のエージェント）が、**現在のhead**を承認している。スタックなら全PRのheadについて。
  レビュー後に修正コミットを足したら、その修正も含めて再レビューを受けてからマージする
- headのCIが緑。このリポジトリはCIをマージの必須条件にしていないので、赤くてもマージ自体はできてしまう。`gh pr checks` で自分で確かめる
- オーナーが決めていない選択を含まない。含むなら、PR本文に「決めきれなかった点」として選択肢とそれぞれで何が変わるかを書き、マージせずに残す

方式は**merge commit**（`gh pr merge <番号> --merge`）。squash・rebaseマージは使わない。
上にブランチが積まれたPRをsquashすると、上のブランチが持つ元のコミットと `main` のsquashコミットが別物になり、
上のブランチを `main` へ入れる時にadd/addの衝突が出た。

### スタックPR

依存する変更を分けて出す時は、GitHubのstacked pull requests（2026年7月からpublic preview）を使う。
各PRのbaseを1つ下のPRのブランチにして積む。

- 作る: `gh stack init` → `gh stack add` → `gh stack submit`。baseを連鎖させて作った既存PRは `gh stack link` でスタックにまとめる
- スタックは線形（上のブランチが下のブランチを含む）でないとスタック機能でマージできない。下の変更は下のブランチを上へマージして取り込む。下の変更をcherry-pickで上に写す「sync」コミットは作らない（線形でなくなる）
- **上のPRを単独で下のブランチへマージしない。** 下のPRに混ざり、`main` の履歴で見分けられなくなる
- スタックのPRは、GitHubの非同期マージAPI（`merge-async`）でしかマージできない。一番上のPRで行うと下のPRも一緒に `main` へ入る。途中のPRで行うと一番下からそこまでが入り、上のPRは自動で `main` へ付け替わる。auto-mergeは使えない
- オーナーはPR画面か `gh stack merge` でマージする
- エージェントは、「マージ」の条件を満たした時に**一番上のPRへ `merge-stack` ラベルを付ける**。スタックのPRを通常のマージAPIやスタック外の手段でマージしない。
  ラベルを受けて `.github/workflows/merge-stack.yml` が次を行い、結果をPRにコメントしてラベルを外す（失敗しても外れるので、直してから付け直す）
  - 付けた人が書き込み権限を持つか、PRが `main` 向けの開いたスタックの一番上か、draft・未マージで閉じたPRが無いかを確かめる
  - スタックが `package.json` の `version` を変えていないかを確かめる（変えていたら断る。リリースPRはスタックに入れない）
  - 全PRのheadで `verify` / `browser-e2e` / `commit-messages` が成功し、他のチェックに失敗・実行中が無いかを確かめる
  - 一番上のPRを `merge-async`（merge commit）でマージし、終わるまで待つ
  - レビューの有無と未決の選択の有無は機械では確かめない。ラベルを付けることが、それらを満たしたという宣言になる
- `merge-stack` はリポジトリの `GITHUB_TOKEN` でマージする。`GITHUB_TOKEN` による push は別のワークフローを起動しないので、
  このマージでは `main` のCIも `release.yml` も走らない（各PRのheadのCIは確認済み。`version` を変えるスタックは上の検査で断る）。走らせたい時は、オーナーがsecret `STACK_MERGE_TOKEN`
  （Contents・Pull requestsにwriteを持つfine-grained PAT）を置く
- 下のPRが入ると、GitHubは上のブランチをサーバー側で書き換える（rebase）。rebase・強制pushの禁止はエージェント自身の操作の話で、
  これは対象外。書き換えられたブランチで作業を続ける前に、fetchしてローカルのworktreeをリモートのブランチに合わせる。
  古いローカルの履歴をpushしない
- 誤りを見つけたら、**スタックの一番上に修正を積む**。下のPRへコミットしない。まとめて入るのは一番上の状態なので、一番上が検証済みなら足りる。既存のコミットは書き換えない
- 同じリポジトリ内のブランチだけで組む（forkをまたげない）

## 公開（GitHub Pages）

公開物は常に `vX.Y.Z` のタグで辿れるものに限る。版番号の正は `package.json` の `version` で、タグは `v` + `version` と一致しなければ公開されない。
公開は次のどれかで起きる。

| 起点 | 誰が | 何が公開されるか |
|---|---|---|
| リリースPRのマージ（`.github/workflows/release.yml`） | オーナー、または頼まれたエージェント | リリースPRの**head**のコミット |
| `vX.Y.Z` タグのpush（`pages.yml`） | オーナー | タグのコミット |
| 手動実行（`pages.yml` の Run workflow、入力は既存のタグ名） | オーナー | 指定したタグのコミット |

それ以外の `main` へのマージは公開しない。`main` を開発の合流点として動かしても公開物は変わらない。

### リリースPR

- **エージェントはオーナーに頼まれた時だけリリースPRを作る。** 自分の判断でリリースを始めない。
  頼まれていれば、「マージ」の条件（独立したレビュー・CIの緑）を満たした時に自分でマージしてよい
- 作り方: 最新の `main` から `chore/release-X.Y.Z` を切り、`npm version <minor|patch> --no-git-tag-version` で
  `package.json` と `package-lock.json` の `version` だけを上げ、`chore(release): X.Y.Z` でコミットする。
  PRのタイトルも `chore(release): X.Y.Z` にする（`release.yml` はこのタイトルでリリースPRを見分ける）
- リリースPRは `main` から分かれた後の**1コミットだけ**で、`package.json` と `package-lock.json` しか変えない。
  `release.yml` が機械的に確かめ、外れていれば公開しない
- 公開されるのは**PRのheadのコミット**で、マージコミットではない。PRを作った時点の `main` に固定され、
  マージまでの間に `main` へ入った別の作業は含まれない。だから `main` はリリースを待たずに進めてよい
- 開いておくリリースPRは**1つだけ**。後から入った作業も含めたくなったら、今のリリースPRを閉じ、新しい `main` から作り直す。
  リリースPRのブランチに `main` をマージして更新しない（何を公開するのかがPRの差分から読めなくなる）
- merge commitでマージする。`release.yml` は、マージコミットを作ったPRがリリースPRで、そのheadの `version` が
  `X.Y.Z` であることを確かめてから、headに注釈付きタグ `vX.Y.Z` を打ち、同じ実行の中で配信する
  （`GITHUB_TOKEN` で打ったタグは `pages.yml` を起動しないため、`release.yml` が `pages.yml` を呼ぶ）
- リリースPR以外で `version` を変えたPRが入ると、`release.yml` は失敗して公開しない（エラーに原因のPRを出す）。`version` は下げない
- PRが見つからないという失敗は、APIへの反映が遅れただけのことがある。その時は「Re-run all jobs」で直る
- 同じ版番号のタグが別のコミットに既にあると失敗する。同じ番号で中身の違う公開は作らない

### 版番号

- 安定するまでは `0.x.y`
- 機能を入れたリリースは minor（`npm version minor`）、公開済みの版への修正だけのリリースは patch（`npm version patch`）
- `v1.0.0` は新UIへの切り替え（旧UIの削除）のために取っておく
- 最初のリリースは `v0.1.0`。そのため `main` の `version` は `0.0.0` にしてあり、最初のリリースPRで `npm version minor` すると `0.1.0` になる

### 配信し直す・戻す

- 同じ版を配信し直す: Actions画面でその公開の実行（「Release」か「Deploy to GitHub Pages」）を開き「Re-run all jobs」。
  タグが既に同じコミットにあれば打ち直さずに配信だけする。再実行は最初の実行から30日以内に限られる
- 前の版に戻す: Actions画面の「Deploy to GitHub Pages」→「Run workflow」で、戻したい版のタグ名（例 `v0.1.0`）を入れる。
  受け付けるのは既存の `vX.Y.Z` タグだけで、ブランチ名・SHA・存在しないタグは拒否する。30日の制限も無い。
  タグの無いコミットは公開できない（公開物を常にタグで辿れるようにするため）
- 戻す代わりに、直した版を patch のリリースPRで出す方法もある。問題の原因が分かっているならこちらが先
- クラウドのエージェントはタグのpushも手動実行もできない（403）。この2つはオーナーの操作になる
- `classic-final` のタグはオーナーだけが動かす。配信のたびに実行時点の `classic-final` を引くので、
  オーナーが `classic-final` を動かした後に古い版を配信し直しても、当時の旧画面は再現しない
- 旧画面（Analyzer再設計 #544 より前の最終形）は、タグ `classic-final` のコミットを
  `/keydist/classic/` にビルドして同梱する。旧画面のソースは `main` に残さず、このタグだけで保つ

## テスト

`node --test` を使う。unit test は主対象のソース隣へ `src/**/*.test.ts` として置く。`test/*.test.ts` には architecture・commit-msg などリポジトリ横断の検査だけを置き、fixture は `test/fixtures/` に置く。

- モデルの分岐（仕様 §9の `g` による場合分け）を変えたら、対応するテストを足す
- 配列を追加したら「全かなが打てる」ことを検証する既存テストに乗せる

### 合計件数は環境によって変わる

`npm test` が報告する件数は実行環境で変わる。`test/commit-msg.test.ts` の8件は
bashの無い環境では丸ごとスキップされるため、その分だけ少なく出る。

そのため、**件数が8ずれている時は食い違いではなくこの差である可能性が高い**。
PR本文に件数を書く時は `# pass` だけでなく `# skipped` も併記すると、読む側が区別できる。
CI（ubuntu）では必ず全件走るので、判断に迷ったらCIの数字を正とする。
