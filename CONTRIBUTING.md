# 開発の作法

## コミットメッセージ

[Angular Commit Message Conventions](https://github.com/angular/angular/blob/main/contributing-docs/commit-message-guidelines.md) に従う。

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 1行目（必須）

- `type` と `scope` は**英小文字**。`subject` は**日本語**でよい
- `subject` は命令形・現在形（「追加する」「直す」）。過去形にしない
- 末尾に句点（`。`）を付けない
- 1行目は 72 文字以内に収める（バイト数ではなく**文字数**）
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
| `ci` | GitHub Actions などの CI 設定 |
| `chore` | 上記に当てはまらない雑務 |
| `revert` | 取り消し。body に `This reverts commit <hash>.` を書く |

**測定値が変わる変更は `fix` か `feat`。** `refactor` は数値が1桁も動かない時だけ使う。

### scope

変更した領域を1つ選ぶ。複数にまたがるなら省略してよい。

| scope | 対応 |
|---|---|
| `model` | `spec/distance-model.md` と `src/evaluate.ts` |
| `metrics` | `src/metrics.ts` |
| `geometry` | `src/geometry.ts` |
| `sensitivity` | `src/sensitivity.ts` |
| `layouts` | `src/layouts/` |
| `romaji` | `src/romaji/` |
| `ui` | `src/main.ts` `src/chart.ts` `src/theme.ts` `src/style.css` `index.html` |
| `deps` | 依存関係の更新 |

### body / footer

- `body` は**なぜ**その変更をしたかを書く。何をしたかは diff が語る
- 数値が変わる変更なら、変更前後の値を `body` に書く
- issue との紐づけは `footer` に `Closes #12` / `Refs #12`
- 破壊的変更は `footer` に `BREAKING CHANGE: <説明>`

### 例

```
feat(layouts): 新下駄配列を追加する

面モデルの simultaneous trigger で定義できることの検証も兼ねる。

Closes #15
```

```
fix(model): 同指連続でホームキーを打つ場合の距離を計上する

g=0 では物理的に復帰する時間がないため、k == H_f でも d_stay を採る。
異論がありうるので sfb_home_cost で切り替え可能にした。

大西 / N=3 / かな290文字: 総距離 148u → 153u

Refs #1
```

## commit-msg フック

規約違反を commit 時点で弾くフックを `.githooks/` に置いてある。
clone 直後に1度だけ有効化する。

```bash
git config core.hooksPath .githooks
```

検査するのは次の4点。`Merge` / `Revert` / `fixup!` / `squash!` で始まるメッセージは
git が形を決めるので素通しする。

| 検査 | 内容 |
|---|---|
| 形 | 1行目が `<type>(<scope>): <件名>` になっているか |
| 長さ | 1行目が 72 文字以内か |
| 句点 | 件名が `。` で終わっていないか |
| 空行 | 2行目が空行か（本文を書く場合） |

フック自身の挙動は `test/commit-msg.test.ts` で検証している（`npm test` に含まれる）。
CI も PR の各コミットに同じスクリプトを掛けるため、フックを有効化し忘れても PR で落ちる。

## ブランチと PR

- `main` に直接 push しない。`<type>/<短い説明>` のブランチを切る（例: `feat/kana-layout-form`）
- push 前に `npm test` と `npm run build` を通す
- `main` への merge で GitHub Pages に配信されるため、**`main` は常に動く状態を保つ**

## テスト

`node --test` を使う。テストは `test/*.test.ts`。

- モデルの分岐（仕様 §9 の `g` による場合分け）を変えたら、対応するテストを足す
- 配列を追加したら「全かなが打てる」ことを検証する既存テストに乗せる

### 合計件数は環境によって変わる

`npm test` が報告する件数は実行環境で変わる。`test/commit-msg.test.ts` の 8 件は
bash の無い環境では丸ごとスキップされるため、その分だけ少なく出る。

そのため、**件数が 8 ずれている時は食い違いではなくこの差である可能性が高い**。
PR 本文に件数を書く時は `# pass` だけでなく `# skipped` も併記すると、読む側が区別できる。
CI（ubuntu）では必ず全件走るので、判断に迷ったら CI の数字を正とする。
