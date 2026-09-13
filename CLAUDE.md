# CLAUDE.md

## このリポジトリについて

キーボードの論理配列を、モデル文章を打った時の**指の総移動距離**で評価するツール。
Vite + TypeScript のブラウザ単体アプリ。バックエンドは無い。GitHub Pages に配信する。

- 何を測るか・どう測るかは `spec/distance-model.md` が唯一の正。
- 使い方・対応配列は `README.md`。
- 開発の作法（コミット・ブランチ・PR）は `CONTRIBUTING.md`。

## 仕様が先、実装が後

**モデルの挙動を変える変更は、先に `spec/distance-model.md` を直してから実装する。**
数値の導出は2手で追える範囲に留める（仕様 §1）。忠実度が上がる変更でも、
導出の追跡可能性を下げるものは入れない。

UI・配列定義の追加など、モデルに触らない変更は仕様の更新を要しない。

## ディレクトリ構成

| パス | 中身 |
|---|---|
| `src/evaluate.ts` | 評価器の本体。仕様 §7〜§10 の実装 |
| `src/metrics.ts` | 出力指標（仕様 §11） |
| `src/geometry.ts` | 座標系・キー位置・指の割り当て（仕様 §3） |
| `src/sensitivity.ts` | N 感度曲線 |
| `src/layouts/` | 配列定義。`types.ts` が記法の型 |
| `src/romaji/` | かな → ローマ字テーブル |
| `src/user-layouts.ts` | 自作配列の localStorage 永続化 |
| `src/main.ts` `src/chart.ts` `src/theme.ts` | 画面 |
| `test/` | `node --test` のテスト |
| `spec/` | モデル仕様 |

## 開発コマンド

```bash
npm install
npm run dev        # 開発サーバー
npm test           # モデルの分岐を検証
npm run typecheck  # 型検査のみ
npm run build      # 型検査 + ビルド
```

**push する前に `npm test` と `npm run build` を通す。** CI も同じものを回す。

## 実装の方針

- **依存を増やさない。** 現在の devDependencies は vite / typescript / @types/node の3つだけ。
  ランタイム依存はゼロ。追加する時は理由を PR に書く
- テストランナーは Node 組み込みの `node --test`。別のフレームワークを入れない
- `tsconfig.json` は `strict` + `noUnusedLocals` + `noUnusedParameters`。緩めない
- 計算部（`evaluate` / `metrics` / `geometry` / `sensitivity`）は DOM に依存させない。
  テストから直接呼べる状態を保つ
- コードコメントは日本語。「なぜそうしたか」を書く。「何をしているか」はコードで読ませる

## モデルに触る変更をした時

`spec/distance-model.md` の該当節・`README.md` の「何を測るか」・`test/` の3点が
揃っているか確認する。数値が変わる変更なら、issue #1 に載っている測定表のように
変更前後の値を PR に書く。

## Issue とラベル

| ラベル | 用途 |
|---|---|
| `model` | 距離モデル・仕様そのもの |
| `layout` | 配列定義の追加・修正 |
| `ui` | 画面・入力フォーム・図 |
| `metrics` | 出力指標 |
| `infra` | ビルド・CI・リポジトリ基盤 |
| `docs` | README・仕様以外のドキュメント |

コミットと issue の紐づけ:

- 実装完了・検証済みなら `Closes #XX`
- 実装したが未検証なら `Refs #XX`
