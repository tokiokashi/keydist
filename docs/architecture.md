# アーキテクチャ

keydist のコードの分け方と依存の向き。設計の経緯と未実装の部分は #544 にある。
ここは「今どう分けるか」の正で、依存の規則は `test/architecture-layers.test.ts` がそのまま検査する。

## 用語

用語を変える時は、この表と #544 の用語集を先に直してから使う。

| 用語 | コード | 意味 |
|---|---|---|
| 配列 | `Layout` | 論理的な配列定義（面・trigger・コンボ等）。組み込みと自作がある |
| 物理形状 | `Shape` | キーの物理的な位置（と規格。ANSI/JIS） |
| 指の割当 | `FingerAssignment` | 各キーを担当する指。物理形状の属性ではなく**カスケードの項目**（`fingerAssignmentId`）として持つ。既定は物理形状の規格から決まり、物理形状・配列・Setupのレベルで上書きできる（#544。`engine/finger-assignment.ts`）。組み込み（既定・JIS）と自作がある |
| ポリシー | `TracePolicy` | **Traceを作る**条件（trigger / action realization、SandSの手、反対側の親指、N、ローマ字規則等） |
| Setup | `Setup` | 配列 × 物理形状 × 上書き。**上書きを持ちたい時にだけ作る**資産（同じ配列を形状違い・指の割当違い・ポリシー違いで並べる用途）。上書きを持たないSetupは作らない |
| 対象 | `AnalysisTarget` | Analyzerが見るもの。**配列**（カスケードの実効値をそのまま使う。物理形状はカスケードの「既定の形状」）か**Setup**のどちらか。集合を見るAnalyzerは対象の列を持つ。計算の単位は、対象を解決した入力（配列 × 物理形状 × 指の割当 × ポリシー） |
| カスケード | settings cascade | ポリシー・指の割当・解釈の値を グローバル → 物理形状 → 打ち方 → 配列 → Setup の順に上書きして実効値を求める仕組み。配列を対象にした時の物理形状（既定の形状）もグローバルの項目として持つ |
| テキスト | Text | 打つ文章。言語を属性に持つ。Setupと同じく**資産**として複数持ち、単体ページ・Workspaceはそこから選ぶ。組み込み（サンプル）と自作がある |
| 打ち方 | input method | テキストの言語 × 配列の種類から導く（かな直接 / ローマ字 / 直接） |
| Trace | `Trace` | 対象を解決した入力でテキストを打った記録（打鍵列・指の移動・押し方）。`generateTrace` が作る |
| 解釈 | `…Interpretation`（`ChainInterpretation` 等） | **Traceの読み方**。Traceを変えずに数値の定義を変える（chain・arpeggio等の数え方、時間モデル） |
| Analyzer | `AnalyzerDefinition` | **機能の単位**。抽出 + 可視化 + 解析設定 |
| 抽出 | extract | Trace（と解釈の結果）からAnalyzerが使うデータを取り出す純関数 |
| 可視化 | visualization | 抽出したデータを表示するcomponent。計算しない |
| 解析設定 | `AnalyzerOptions` | どの数値を・どの切り口で・どう見せるか |
| engine | engine | 解決・Trace生成・解釈・抽出の実行とキャッシュ |
| 単体ページ / Workspace | host | Analyzerを載せる器 |
| 資産 | assets | ユーザーが作って保存するもの（自作配列・形状・指の割当・ローマ字規則・Setup・カスケードの値・Workspace・個人速度・テキスト） |

使わない語: mode（en / ja）、段の名前としての「評価」（`evaluate`）、View、`AnalysisSession` / `AnalysisSnapshot`、解釈を指す「ポリシー」（`ChainPolicy` / `ArpeggioPolicy`）。

## 流れ

```text
対象（配列 または Setup）→ 解決（配列 × 物理形状 × 指の割当 × ポリシー）+ テキスト
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

指の割当（`FingerAssignment`）もこの分類では**ポリシー**と同じ扱いになる
（Traceの中身を変え、持ち主はカスケード）。ただし型は`TracePolicy`ではなく独立した
`FingerAssignment`で、`generateTrace`へは物理形状と合成した`Geometry`として渡る
（`engine/resolved-input.ts`）。

## 画面の構成

全画面を1つの器（シェル）に載せる。単体ページは**ペインが1枚だけのWorkspace**と同じ形にする。
同じAnalyzerを単体ページにもWorkspaceにも同じcomponentで載せる（#544 完了条件）ため、器の側と
ペインの側で持ち物を分けておく。

```text
シェル
├─ サイドバー      ナビゲーション
└─ 本体
   ├─ 文脈バー     テキスト / Undo・Redo / 共有
   └─ ペイン（単体ページは1枚、Workspaceは複数）
      ├─ 見出し    Analyzer名 / 対象 / 解析設定 / ⋯
      ├─ 条件の要約（開くと出どころ）
      └─ Analyzerの中身
```

| 場所 | 持つもの | 持たないもの |
|---|---|---|
| サイドバー | ナビゲーションだけ。解析（対象1つを見るもの / 集合を見るもの）、Workspaceの一覧、手持ちの資産の編集、Tester。単体ページとWorkspaceで同じもの | テキスト・Setup・解析設定などの入力 |
| 文脈バー | 使うテキストの選択（1行のチップ。選択・編集は開いた時だけ出す）、常時出す操作（Undo/Redo・共有） | ペイン固有の値 |
| ペイン | 対象（配列かSetup、またはその集合）、解析設定、条件の要約、ペインへの操作（⋯: 複製・単体で開く・閉じる・解析設定を既定へ） | テキスト |

- 対象をペインに置くのは、Workspaceのペインが「従う / 固定」の対象を自分で持つため（#544 §6）。ページ上部に置くと、ペインを並べた時に破綻する
- テキストは器の値。単体ページは全体で1つの選択、Workspaceは自分の選択を持つ（#544 §5）
- テキストの編集: 組み込みのサンプルを書き換えると、自作のテキストとして新しく保存し、以後はそれを編集する。自作のテキストは、明示的に複製しない限りその場で書き換える
- **メニューバー（編集 / 表示…）は置かない。** 全操作の目録はコマンドパレット（書き込みはすべてコマンドを通す #544 §8-2 ので、コマンドの一覧から作れる）で持つ。ペインと文脈バーにグローバルな操作が入り切らなくなった時に、メニューバー（かデスクトップアプリ化）を検討する
- スマホ幅ではサイドバーを引き出しにする
- **表示名は常に、同じ画面に並ぶ集合に対して計算する。** 集合の中で共通な部分は落とし、違う部分だけを出す（`{QWERTY/row-staggered, Colemak-DH/row-staggered, QWERTY/row-staggered・指割当JIS}` → `QWERTY` / `Colemak-DH` / `QWERTY · 指割当JIS`）。フルの名前はhoverと条件の要約に出す。それでも同じ名前になる対象（配列と、上書きの無い同じ配列のSetup等）は、その対象だけに種類（`配列` / `Setup n`）を添えて区別し、内部のidは出さない。**色は集合によらず対象ごとに固定**する（並べ方で色が変わると追えない）
- **条件の編集は条件のペインで行う。** 書き込むレベルの既定は対象のレベル（配列を対象にしていれば配列、Setupならそれ）。「この条件だけ別にしたい」は、その場でSetupを作る操作として出す。上位への適用（この配列全部・全体）は昇格の操作として出す
- **URL**: 単体ページは `/analyzer/<analyzer>`。URLで固定された1ペインで、URLはペインの初期値（対象・解析設定）を運ぶ。保存したWorkspaceは `/workspace/<id>` で、URLは識別子だけ（#544 非目標「URLをWorkspaceの保存先にしない」）

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
  - 抽出のキャッシュキーは「解釈のキー + Analyzer id + 抽出に効くoptions」（`AnalyzerDefinition.extractKeyOf` が返す値。`engine/keys.ts` の `analyzerExtractionKeyOf`）。見た目だけの解析設定はここで除かれるので、見た目だけの変更ではextractが走らない
  - 集合対象とN感度の例外向けに、抽出は「Traceを依頼する窓口」（`TraceRequester`、`analyzers/contract.ts`）を受け取れる。窓口の実装（キャッシュ経由でTraceを共有する）は `engine/trace-requester.ts` が持つ
- **storageを直接触るのは platform と app だけ。** 保存が要る層（hosts・editors等）は、appが組み立てたアダプタを注入して使う。Testerは当面の例外
- **import の書き方。** 別のトップディレクトリへは `#<dir>/...`（`package.json` の `imports`）、同じトップディレクトリの中は相対パス。ディレクトリを import しない（`index.ts` の暗黙解決はNodeのstrip-typesで動かない）。拡張子を付けて書く
- 外部ライブラリ: Dockview は `hosts/workspace/` だけ、TanStack Router / Start は routes・app・`hosts/standalone/` だけ（legacy と `features/analyzer-next/` は旧実装なので除く）。描画ライブラリ（motion等）は純粋な層以外で使ってよい
- 部品は最初は使う場所に置き、2つ目の使い手が現れた時に ui へ下ろす。Analyzer同士で共有したくなったら ui か interpretation へ下ろす

## 移行中の扱い

Phase 1（#544）で既存ファイルの配置は完了した。置き換え前の実装については次の扱いを続ける。

- `features/analyzer-next/` は #505 の実装で、engine・Setup・Analyzer契約ができた時点で置き換えて消す（#544 のPhase 0コメント）。それまで旧実装と同じく何をimportしてもよく、新しいコードからはimportしない。`docs/analyzer-next-state-contract.md` も同時に消す
- 規則に反するが今は直せないimportは `KNOWN_VIOLATIONS` に理由付きで載せる。解消したら消す（残っているとテストが落ちる）
- 純粋さの違反（ブラウザAPIの使用）には逃げ道を作らない。移行で当たる箇所は、指示書で先に扱いを決めておく
