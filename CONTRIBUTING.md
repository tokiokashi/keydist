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
- `main` はマージしても公開されない（「公開」）。CI（test / typecheck / build）は通る状態を保つ

### 作業単位の切り方

- 原則は浅く積む。各単位を `main` から切り、PRのbaseも `main` にする
- 積む（スタックPR）のは、未マージの単位に本当に依存する時だけ。深く積むほど、下の修正やマージのたびに上の追従が要る
- push済みのブランチはrebase・強制pushしない。`main` や下のブランチの変更は、それを**マージして**取り込む
- 並行作業はgit worktreeを分けてよい。同じファイルに触る単位は並行にせず直列にする。衝突を後で解く手間の方が大きい

### マージ

オーナーはいつでもマージしてよい。エージェントがマージするのは、次を**全部**満たす時だけ。

- 実装者と別のレビュアー（レビュー役のエージェント）が、**現在のhead**を承認している。
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
- 下から1つずつ入れる（エージェントがマージする時はこちら）: 一番下のPRを「マージ」の条件と方式で入れ、次のPRのbaseが `main` に付け替わったか確かめる（付け替わっていなければ `gh pr edit <番号> --base main`）。そのブランチへ `main` をマージしてpushし、CIとレビューを通してから次を入れる
- まとめて入れる（オーナーが手で行う）: スタック機能のマージを一番上のPRで行うと、下のPRも一緒に `main` へ入る。途中のPRで行うと一番下からそこまでが入り、上のPRは自動で `main` へ付け替わる。auto-mergeは使えず、スタックの一括マージは非同期のマージAPIが要るので、PR画面か `gh stack merge` で行う
- 誤りの直し方は入れ方で決まる。1つずつ入れるなら、誤りを含むPRのブランチに修正コミットを足し、上のブランチへマージして追従させる。まとめて入れるなら、スタックの上に修正を積む（入るのは一番上の状態なので、一番上が検証済みなら足りる）。どちらも既存のコミットは書き換えない
- 同じリポジトリ内のブランチだけで組む（forkをまたげない）

## 公開（GitHub Pages）

公開は `main` へのマージではなく、**`v*` のタグを打った時だけ**行う（`.github/workflows/pages.yml`）。
`main` を開発の合流点として動かしても、公開物は変わらない。手動実行（workflow_dispatch）は置かない。
公開されているものが常にタグで辿れ、任意のブランチを公開できないようにするため。

**公開の操作はオーナーだけが行う。** `v*` と `classic-final` のタグを打つ・動かすのも、公開の実行を再実行するのも、エージェントはしない。
マージしてよい条件を満たしていても、公開するかどうかは別の判断になる。

- 公開する: 公開したいコミット（通常は `main`）に `vX.Y.Z` のタグを打ってpushする
- 同じ内容を配信し直す: Actions画面でそのタグの「Deploy to GitHub Pages」の実行を開き、「Re-run all jobs」を押す。再実行できるのは最初の実行から30日以内なので、それより古いタグは新しいタグを打ち直す
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
