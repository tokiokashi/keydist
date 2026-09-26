# アーキテクチャ

keydist のコードの分け方と依存の向き。設計の経緯と未実装の部分は #544 にある。
ここは「今どう分けるか」の正で、依存の規則は `test/architecture-layers.test.ts` がそのまま検査する。

## 用語

用語を変える時は、この表と #544 の用語集を先に直してから使う。

| 用語 | コード | 意味 |
|---|---|---|
| 配列 | `Layout` | 論理的な配列定義（面・trigger・コンボ等） |
| 物理形状 | `Shape` | キーの物理的な位置・指の割当 |
| ポリシー | `TracePolicy` | **Traceを作る**条件（trigger / action realization、SandSの手、反対側の親指、N、ローマ字規則等） |
| Setup | `Setup` | **計算の単位**。配列 × 物理形状 × ポリシー |
| カスケード | settings cascade | ポリシー・解釈の値を グローバル → 物理形状 → 打ち方 → 配列 → Setup の順に上書きして実効値を求める仕組み |
| テキスト | Text | 打つ文章。言語を属性に持つ |
| 打ち方 | input method | テキストの言語 × 配列の種類から導く（かな直接 / ローマ字 / 直接） |
| Trace | `Trace` | Setupでテキストを打った記録（打鍵列・指の移動・押し方）。`generateTrace` が作る |
| 解釈 | `…Interpretation`（`ChainInterpretation` 等） | **Traceの読み方**。Traceを変えずに数値の定義を変える（chain・arpeggio等の数え方、時間モデル） |
| Analyzer | `AnalyzerDefinition` | **機能の単位**。抽出 + 可視化 + 解析設定 |
| 抽出 | extract | Trace（と解釈の結果）からAnalyzerが使うデータを取り出す純関数 |
| 可視化 | visualization | 抽出したデータを表示するcomponent。計算しない |
| 解析設定 | `AnalyzerOptions` | どの数値を・どの切り口で・どう見せるか |
| engine | engine | 解決・Trace生成・解釈・抽出の実行とキャッシュ |
| 単体ページ / Workspace | host | Analyzerを載せる器 |

使わない語: mode（en / ja）、段の名前としての「評価」（`evaluate`）、View、`AnalysisSession` / `AnalysisSnapshot`、解釈を指す「ポリシー」（`ChainPolicy` / `ArpeggioPolicy`）。

## 流れ

```text
Setup（配列 × 物理形状 × ポリシー）+ テキスト
  ↓ Trace生成
Trace
  ↓ 解釈（構造・時間モデル・複数のAnalyzerが使う指標）
  ↓
Analyzer（抽出 → 可視化）
  ↓
host（単体ページ / Workspace）
```

条件は3種類に分ける。「その値を変えると、同じ名前の数値の意味が変わるか」で判定する。

| 種類 | 何を決めるか | 持ち主 |
|---|---|---|
| ポリシー | Traceの中身 | カスケード |
| 解釈 | Traceは同じまま、数値の定義 | カスケード（当面グローバルのみ） |
| 解析設定 | どの数値をどう見せるか | Analyzerのインスタンス |

## ディレクトリ

トップは流れの段の名前で切る。

```text
src/
  input/             入力の段
    layouts/         配列定義と型、層、配列のimport
    shapes/          物理形状
    semantics/       trigger / action realization
    romaji/
    text/            サンプルテキストと言語
    settings/        カスケードの仕組み
    setup/           Setup
  trace/             Trace生成
  interpretation/    構造（chain・arpeggio…）、時間モデル、複数のAnalyzerが使う指標
  analyzers/
    contract.ts      Analyzerの契約のうち純粋な部分（抽出・解析設定・Traceを依頼する窓口の型）
    <name>/          .ts が抽出と設定（純粋）、.tsx が可視化と definition.tsx（可視化との結び付け）
  engine/            実行とキャッシュ
  hosts/
    shared/          ペインの枠
    standalone/      単体ページ
    workspace/       Workspace
  editors/           資産を編集するUI
  tester/            Tester（engine/ は純粋）
  ui/
    primitives/      汎用部品
    theme/           token
    keyboard/        キーボード図など、入力の型を知る部品
    charts/          グラフの部品
  platform/          storage・ブラウザAPI
  app/               組み立て・シェル・AppState
  routes/            TanStack Startの規約どおり。createFileRouteだけの薄いファイル
  router.tsx
  legacy/            旧Analyzer。切り替え時に削除
```

## 依存の規則

どの層も自分の層の中は import してよい。表はそれ以外の行き先。

| from | import してよい先 |
|---|---|
| `input` | — |
| `trace` | input |
| `interpretation` | input, trace |
| `analyzers/<name>` の `.ts` | input, trace, interpretation, `analyzers/` 直下（契約）, 自分の `.ts` |
| `analyzers/<name>` の `.tsx` | 上に加えて、自分の `.tsx`, ui |
| `analyzers/` 直下 | input, trace, interpretation。個別のAnalyzerは不可 |
| `engine` | input, trace, interpretation, `analyzers/` 直下（契約） |
| `hosts/<name>` | engine, analyzers, ui, input, trace, interpretation, `hosts/shared`。他のhostは不可 |
| `editors` | input, ui |
| `tester` | input, ui, platform（当面の例外） |
| `ui/primitives` `ui/theme` | — |
| `ui/keyboard` `ui/charts` | ui/primitives, ui/theme, input |
| `platform` | input |
| `app` `routes` | すべて |
| `legacy` | すべて |

- Analyzer同士は import しない。個別のAnalyzerから別のAnalyzerへも、契約から個別のAnalyzerへも向かない
- host同士は import しない。共有物は `hosts/shared/` に置く。`hosts/` 直下にはファイルを置かない

- `legacy` と移行中の `features/analyzer-next` を import してよいのは app・routes・legacy・`features/analyzer-next` だけ
- **純粋な層**（input / trace / interpretation / engine、`analyzers/**/*.ts`、`tester/engine/`）は React・描画ライブラリ・Router・Dockview・DOM・storage・ブラウザAPIを使わない。`import type` も含めて使わない
  - **純粋さは推移的に守る。** 純粋なファイルは純粋なファイルしか import できない。抽出が表示用の型を借りたくなったら、その型を input か interpretation に置く
  - unit testの `node --experimental-strip-types` は `.tsx` を読めない。計算がReactのファイルを1つでもimportするとテストできなくなる
  - 重い計算をWeb Workerへそのまま移せる
  - キャッシュが描画のタイミングに縛られない
- **可視化は計算しない。** engineが抽出を実行し、hostが結果をcomponentへ渡す
- **Analyzerの契約は純粋な部分だけを `analyzers/contract.ts` に置く。** 可視化のcomponentとの結び付けは各Analyzerの `definition.tsx` で行う。engineは純粋な部分しか知らないので、engineの型にReactが現れず、Workerへそのまま移せる
- **storageを直接触るのは platform と app だけ。** 保存が要る層（hosts・editors等）は、appが組み立てたアダプタを注入して使う。Testerは当面の例外
- **import の書き方。** 別のトップディレクトリへは `#<dir>/...`（`package.json` の `imports`）、同じトップディレクトリの中は相対パス。ディレクトリを import しない（`index.ts` の暗黙解決はNodeのstrip-typesで動かない）。拡張子を付けて書く
- 外部ライブラリ: Dockview は `hosts/workspace/` だけ、TanStack Router / Start は routes・app・`hosts/standalone/` だけ（legacy と `features/analyzer-next/` は旧実装なので除く）。描画ライブラリ（motion等）は純粋な層以外で使ってよい
- 部品は最初は使う場所に置き、2つ目の使い手が現れた時に ui へ下ろす。Analyzer同士で共有したくなったら ui か interpretation へ下ろす

## 移行中の扱い

Phase 1（#544）で既存ファイルの配置は完了した。置き換え前の実装については次の扱いを続ける。

- `features/analyzer-next/` は #505 の実装で、engine・Setup・Analyzer契約ができた時点で置き換えて消す（#544 のPhase 0コメント）。それまで旧実装と同じく何をimportしてもよく、新しいコードからはimportしない。`docs/analyzer-next-state-contract.md` も同時に消す
- 規則に反するが今は直せないimportは `KNOWN_VIOLATIONS` に理由付きで載せる。解消したら消す（残っているとテストが落ちる）
- 純粋さの違反（ブラウザAPIの使用）には逃げ道を作らない。移行で当たる箇所は、指示書で先に扱いを決めておく
