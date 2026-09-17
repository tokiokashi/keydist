# CLAUDE.md

## このリポジトリについて

キーボードの論理配列を、モデル文章を打った時の**指の総移動距離**で評価するツール。
Vite + TypeScriptのブラウザ単体アプリ。バックエンドは無い。GitHub Pagesに配信する。

- 何を測るか・どう測るかは `spec/distance-model.md` が唯一の正。
- 打鍵再生が1ステップをどれだけの時間で表示するかは `spec/playback-timing.md` が唯一の正。
  距離モデルは時間の概念を持たないので、両者は別の仕様として分ける。
- 使い方・対応配列は `README.md`。
- 開発の作法（コミット・ブランチ・PR）は `CONTRIBUTING.md`。

## 仕様が先、実装が後

**モデルの挙動を変える変更は、先に仕様を直してから実装する。**
距離モデル（距離・指標・運指）なら `spec/distance-model.md`、
再生の時間の決め方なら `spec/playback-timing.md`。
数値の導出は2手で追える範囲に留める（距離モデル仕様 §1）。忠実度が上がる変更でも、
導出の追跡可能性を下げるものは入れない。

UI・配列定義の追加など、モデルに触らない変更は仕様の更新を要しない。

## ディレクトリ構成

| パス | 中身 |
|---|---|
| `src/evaluate.ts` | 評価器の本体。仕様 §7〜§10の実装 |
| `src/metrics.ts` | 出力指標（仕様 §11） |
| `src/geometry.ts` | 座標系・キー位置・指の割り当て（仕様 §3） |
| `src/sensitivity.ts` | N感度曲線 |
| `src/layouts/` | 配列定義。`types.ts` が記法の型。かな配列は `fromFaces` で面（trigger + mode）から書く |
| `src/romaji/` | かな → ローマ字テーブル |
| `src/user-layouts.ts` | 自作配列のlocalStorage永続化 |
| `src/playback.ts` | 打鍵再生。表示時間は再生時間モデル仕様 §3 の実装 |
| `src/playback-calibration.ts` | 個人速度の測定（再生時間モデル仕様 §6） |
| `src/main.ts` `src/chart.ts` `src/theme.ts` | 画面 |
| `test/` | `node --test` のテスト |
| `spec/` | モデル仕様（距離モデル・再生時間モデル） |

## 開発コマンド

```bash
npm install
npm run dev        # 開発サーバー
npm test           # モデルの分岐を検証
npm run typecheck  # 型検査のみ
npm run build      # 型検査 + ビルド
```

**pushする前に `npm test` と `npm run build` を通す。** CIも同じものを回す。

## 実装の方針

- **依存はむやみに増やさない。** 現在のdevDependenciesはvite / typescript / @types/nodeの3つだけで、
  ランタイム依存も無い。追加する時は理由をPRに書く。
  ただし**ランタイム依存ゼロ自体は目的ではない**。GitHub Pagesで動く限り、
  必要なら足してよい（2026-09-14の判断）。漢字の読み解決（#5層3）で辞書を積むのが想定される例
- テストランナーはNode組み込みの `node --test`。別のフレームワークを入れない
- `tsconfig.json` は `strict` + `noUnusedLocals` + `noUnusedParameters`。緩めない
- 計算部（`evaluate` / `metrics` / `geometry` / `sensitivity`）はDOMに依存させない。
  テストから直接呼べる状態を保つ
- コードコメントは日本語。「なぜそうしたか」を書く。「何をしているか」はコードで読ませる

## モデルに触る変更をした時

`spec/distance-model.md` の該当節・`README.md` の「何を測るか」・`test/` の3点が
揃っているか確認する。数値が変わる変更なら、issue #1に載っている測定表のように
変更前後の値をPRに書く。

再生の時間の決め方を変えた時は `spec/playback-timing.md` の該当節と `test/` の2点。
**適用範囲（§7）に挙げた制約を外す変更なら、§7 の該当項目も消すか書き換える。**
距離モデルの数値は動かないので、測定表は要らない。

## Issueとラベル

| ラベル | 用途 |
|---|---|
| `model` | 距離モデル・仕様そのもの |
| `layout` | 配列定義の追加・修正 |
| `ui` | 画面・入力フォーム・図 |
| `metrics` | 出力指標 |
| `infra` | ビルド・CI・リポジトリ基盤 |
| `docs` | README・仕様以外のドキュメント |
| `meta` | ロードマップなどissue運用そのもの |

コミットとissueの紐づけ:

- 実装完了・検証済みなら `Closes #XX`
- 実装したが未検証なら `Refs #XX`
