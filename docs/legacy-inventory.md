# 旧画面の機能と新しい受け皿の対応表

旧画面（`src/legacy/`、`/analyzer`、`/analyzer/flow`）の機能を、利用者から見える単位で1つずつ挙げ、新しい構成のどこで受けるかを書く。
旧画面を消す切り替えの前提で、**この表を切り替えの完了条件にする**。
作業単位を切り出す元にもなる。

## この表の使い方

- 状態が「作る候補」「捨てる候補」の行が残っている間は、切り替えを始めない。すべての行が「実装済み」「予定あり」「捨てる（決定済み）」のどれかになり、「予定あり」の作業が終わっていることが完了条件になる
- 「作る候補」は、オーナーと決めてからissueにする（タイトル案と大きさは後ろの一覧）。「捨てる候補」は、オーナーが決める
- 新しく機能を足した時にこの表へ行を足す必要は無い。旧画面にあったものだけを載せる

### 状態の語

| 状態 | 意味 |
|---|---|
| 実装済み | 新しい構成に受け皿がある。場所を書く |
| 予定あり | 受け皿のissueがある。番号と内容を書く |
| 作る候補 | 受け皿が無い。作る案。作業としてはまだ決めていない |
| 捨てる候補 | 受け皿が無い。捨てる案。オーナーの判断が要る（`needs-decision`） |
| 捨てる（決定済み） | 既に捨てると決まっている。決めた場所を書く |

### 確認の語

| 確認 | 意味 |
|---|---|
| 操作 | 旧画面をpreview buildで開き、操作して結果を確かめた |
| 表示だけ | 旧画面を開き、その項目が表示されることは確かめた。値を変える・保存するなどの操作はしていない |
| コード | 旧画面のコードで確かめた。画面では操作していない |

新側の「実装済み」は、`/`・`/standalone/*`・`/input`・`/analyzer/flow` を開いて表示を確かめ、場所をコードで確かめた。新側の操作はe2eに任せていて、この棚卸しでは操作していない。

## 調べた範囲と方法

- 旧画面の入口は `src/routes/analyzer.tsx`（`/analyzer`）と `src/routes/analyzer_.flow.tsx`（`/analyzer/flow`）の2つ。`/analyzer` は `src/legacy/analyzer-page.tsx` が1ページに全機能を載せる
- 機能の洗い出しは、`analyzer-page.tsx`・`analyzer-react-shell.tsx`・`analyzer-remaining-ui.tsx` の構成、各 `analyzer-*-content.tsx` / `*-dialog.tsx` のラベル、`ui-state.ts` の保存項目、`main.ts` の入出力、保存のキーを読んで行った
- 画面の操作は、`vite preview` で配信したmainのビルドの `/analyzer` に対して、ヘッドレスのChromiumで行った。操作した範囲は次のとおり
  - 比較元の選択・列見出しの並び替え・棒グラフの項目の数
  - 入力方式の切り替え（日本語・英文で並ぶ配列とサンプルが変わる）・テキストの編集とサンプルへ戻す
  - 配列の詳細の対象と物理配列の切り替え（条件の1行が変わる）
  - N感度の展開と縦軸の切り替え
  - 打鍵再生の1ステップ進む・再生・一時停止、再生設定のパネルとその3つの分類
  - 計算方法・シミュレーション条件・ローマ字の綴り・物理配列と運指・個人速度のキャリブレーションの5つのダイアログの表示
  - 物理配列の設定の書き出し・条件の書き出し（どちらもJSONのダウンロードが始まる）
  - 配列の追加と、追加した配列の「削除」の表示
  - 配列図のキーを押した時の入力パターンの確認
  - Bigram Flowの「Actual / Within-hand」の切り替え・テーマの切り替え
- `classic-final` は、タグのコミットをビルドして `/analyzer` と `/input` を開いた。`src/legacy/` と見出し・詳細パネル・ダイアログの構成が同じだった。コードも、型の改名（形状 → 物理配列、`ChainPolicy` → `ChainInterpretation` 等）・サンプルテキストの置き場所・保存キー以外に違いが無いことを、import行を除いた行の差分で確かめた。**機能の一覧は旧画面と `classic-final` で共通**で、表は1つにまとめた
- 旧 `/analyzer/flow` は、新しいシェルの中にBigram Flowを出す。開いて見出しと操作（Actual / Within-hand・指の組み合わせ）を確かめた

## 旧画面の構成

`/analyzer` は、見出し（keydistのリンク・計算方法・シミュレーション条件・テーマ）の下に、左のサイドバー（入力）と右の本体を置く。

```text
サイドバー  入力方式 / 配列（詳細対象）/ この配列で使う物理配列 / 先読みN / 2つのチェック /
            比べる配列（絞り込み・チェックリスト）/ 配列ごとの条件・ローマ字の綴りのボタン /
            打ち手と機材（折りたたみ）/ 配列を追加（折りたたみ）
本体        評価テキスト → 配列の詳細（打鍵再生・統合ヒートマップ・層別ヒートマップ・
            指ごとの移動距離・指間距離の標準偏差・Bigram Flow）→ 総移動距離（棒グラフ・表）→
            配列 × 指のマトリックス（4種）→ N感度
ダイアログ  計算方法 / シミュレーション条件 / 物理配列と運指 / ローマ字の綴り / キャリブレーション
右パネル    打鍵再生設定
```

## 対応表

### A. 画面の枠・ルート・導線

| ID | 機能 | 旧画面での出どころ | 確認 | 状態 | 受け皿・候補 |
|---|---|---|---|---|---|
| A1 | 全機能を縦に並べた1ページ（`/analyzer`） | `analyzer-page.tsx` | 操作 | 実装済み | 機能ごとの個別画面（`/standalone/<名前>`）とWorkspace（`/workspace/<id>`）に分けた。個別画面のルートを `/analyzer/<名前>` に揃える作業は、旧画面の削除（J1）と一緒に行う |
| A2 | Bigram FlowのURL付きページ（`/analyzer/flow`。`mode`・`layout`・`source`・`fingers`・`lineScale`・`layerOrder`・`hoverScale`・`bandwidth`・`gain`） | `analyzer_.flow.tsx`・`features/analyzer-next/bigram-flow-route-state.ts` | 操作 | 実装済み | `/standalone/bigram-flow`。解析設定はURLに載り、共有で運ぶ（`hosts/standalone/use-url-options.ts`）。`mode`・`layout` の2つのクエリは持ち越さない（A8と同じ理由）。旧URLの転送はX5 |
| A3 | keydistのリンク（トップへ） | `analyzer-page.tsx` | 操作 | 実装済み | `app/shell/Sidebar.tsx` の `keydist` |
| A4 | テーマの切り替え（ライト・自動・ダーク） | `analyzer-remaining-ui.tsx` の `AnalyzerThemeControls` | 操作 | 実装済み | サイドバー最下端（`app/shell/Sidebar.tsx`・`app/theme/appearance.ts`） |
| A5 | 情報ボタン（i）の説明 | `analyzer-page.tsx` の `InfoButton` | コード | 実装済み | `ui/primitives/info-button.tsx` |
| A6 | 計算方法のダイアログ（数値は条件の下での結果という注意・距離の図・落とした次元・仕様へのリンク） | `analyzer-remaining-ui.tsx` の `AnalyzerHowDialog`・`gap-figure.ts` | 表示だけ | 予定あり | #51。N1。トップに観測値の注記だけがある（`routes/index.tsx`）。距離の図・落とした次元・仕様へのリンクは新側に無い |
| A7 | 仕様書へのリンク（距離モデル・再生時間モデル・構造解析モデル）とGitHubのリンク | 計算方法・シミュレーション条件のダイアログ、フッター | 表示だけ | 予定あり | #51。N1に含める。新側の画面に置き場所が無い |
| A8 | 入力方式（日本語 / 英文）の切り替え | `analyzer-react-shell.tsx` の `changeMode` | 操作 | 捨てる（決定済み） | modeを廃止し、テキストの言語 × 配列の種類から打ち方を導く（`input/setup/input-method.ts`）。英文だけのサンプル・配列の一覧は、テキストと対象の選択が受ける |

### B. テキスト

| ID | 機能 | 旧画面での出どころ | 確認 | 状態 | 受け皿・候補 |
|---|---|---|---|---|---|
| B1 | サンプルの選択（現代文・旧文・英文） | `analyzer-samples.ts` | 操作 | 実装済み | 組み込みテキスト（`input/text/builtin.ts`）。選択は文脈バーのテキストのチップ（`hosts/shared/TextChip.tsx`） |
| B2 | 本文の自由入力・サンプルへ戻す | `analyzer-react-shell.tsx` | 操作 | 実装済み | `TextChip.tsx`。組み込みを書き換えると自作のテキストとして保存し、元のサンプルは残る（docs/architecture.md「画面の構成」） |
| B3 | 本文の保存上限（10万字を超えると保存しない・その旨の表示） | `ui-state.ts` の `MAX_SAVED_TEXT_LENGTH` | コード | 捨てる（決定済み） | X3。新側のテキスト資産に同じ上限が見当たらない |
| B4 | 本文の文字数の表示（「290文字」） | `analyzer-metrics-content.tsx` の `AnalyzerTextMetricsStatus` | 操作 | 予定あり | #52。N2。新側の文脈バーとテキストのチップに文字数の表示は見つからなかった（`rg` の範囲） |

### C. 配列の選択

| ID | 機能 | 旧画面での出どころ | 確認 | 状態 | 受け皿・候補 |
|---|---|---|---|---|---|
| C1 | 比べる配列の複数選択（チェックリスト・色見本） | `AnalyzerSidebarControls` の `layout-picker` | 操作 | 実装済み | 対象の選択（`hosts/shared/TargetSelection.tsx`）。色の配り方は `engine/workspace-colors.ts` に従う。**組み込みの配列だけ。自作の配列は出ない（旧画面より狭い）。** 新しいAnalyzerは自作の配列・物理配列・ローマ字規則を読まない（`app/standalone/catalog.ts` の `builtinPaneCatalog()` は組み込みだけを返す）。自作の配列は、新しい構成の資産として作り、Analyzerで選べるようにする（N15） |
| C2 | 比べる配列の絞り込み（ローマ字配列 / かな・直接入力） | `AnalyzerSidebarControls` の `picker-filters` | 表示だけ | 予定あり | #35。配列の絞り込み（ローマ字配列 / かな・直接入力）を、新しい対象の選択に置く |
| C3 | 詳細を見る配列を1つ選ぶ | `detail-layout` のselect | 操作 | 実装済み | Singleの対象（`hosts/shared/use-set-target-selection.ts` ほか）。トップで選んだ配列がSingleの対象になる |
| C4 | 詳細を見る配列ごとに物理配列を選ぶ | `detail-geometry` のselect | 操作 | 実装済み | 配列のレベルの「既定の物理配列」（条件のモーダル。`hosts/shared/ConditionEditor.tsx`）。**選べるのは組み込みの物理配列だけ。自作の物理配列は出ない（旧画面より狭い）。** 自作の物理配列を作る画面を作るかはX7 |
| C5 | 全体の物理配列の選択 | 「打ち手と機材」の `geometry` | 表示だけ | 実装済み | 文脈バーの物理配列のチップ（`hosts/shared/DefaultShapeChip.tsx`）。**組み込みの物理配列だけ（旧画面より狭い）。** X7 |
| C6 | 追加した自作配列の削除 | `layout-picker` の「削除」 | 操作 | 予定あり | #63。N11。新側に自作配列を一覧して消す画面が無い（資産の保存形式の整理には、読み手に新しいAnalyzerが入っていない）。N15の後 |
| C7 | 選んだ配列・詳細対象の保存 | `ui-state.ts` の `layouts` | コード | 実装済み | `keydist:single-target-selection`・`keydist:multi-target-selection`（`platform/assets/`） |

### D. 条件

条件の編集は、条件のモーダルと配列のレベルの上書きに載った（docs/architecture.md「条件の要約」「条件の編集とURL」）。

| ID | 機能 | 旧画面での出どころ | 確認 | 状態 | 受け皿・候補 |
|---|---|---|---|---|---|
| D1 | 先読みN | サイドバーの `window`・条件の「モデル」 | 表示だけ | 実装済み | 条件のモーダルの行（`windowSize`） |
| D2 | 同指連続でホームキーを打つ時の移動加算 | `sfb-home` | 表示だけ | 実装済み | 条件のモーダルの行（`sfbHomeCost`） |
| D3 | スペースによるシフトで逆側の親指を優先 | `prefer-opposite-thumb` | 表示だけ | 実装済み | 条件のモーダルの行（`preferOppositeThumb`） |
| D4 | 配列ごとの個別条件（行が配列・列が条件の表） | `analyzer-conditions-content.tsx` | 表示だけ | 実装済み | 配列のレベルの上書き（モーダルの「この配列だけ別に」）。物理配列・打ち方・Setupのレベルとの関係の見せ方は今後の課題 |
| D5 | ローマ字規則の選択（配列ごと） | 条件の「ローマ字」 | コード | 実装済み | 条件のモーダルの行（`romajiRuleId`）。**選べるのは組み込みの規則だけ。自作のローマ字規則は読まない（旧画面より狭い）。** N15。規則の編集はG5 |
| D6 | triggerの保持・独立action化の3段階の個別指定 | 条件の「Trigger」 | 表示だけ | 捨てる（決定済み） | X1。新側はキーの種類ごとの例外まで。旧画面には論理trigger単位・物理trigger単位の指定がある |
| D7 | Chainの区切り・Arpeggioの数え方 | 条件の「Chain」「Arpeggio」 | 表示だけ | 実装済み | 条件のモーダルの行（`chainInterpretation`・`arpeggioInterpretation`）。全体とWorkspaceのレベルだけ（配列ごとの上書きはD13）。読む画面は再生・構造のAnalyzer待ち |
| D8 | 条件プリセット（標準・保存・選ぶ・削除） | `condition-presets.ts` | 表示だけ | 実装済み | 条件のモーダル上部（`hosts/shared/PresetSection.tsx`）。旧画面の組み込み「標準」は「すべて既定値に戻す」が受ける |
| D9 | 条件ファイルの書き出し・読み込み | `condition-bundle.ts` | 操作（書き出しだけ。読み込みはコード） | 実装済み | プリセットのファイル（`hosts/shared/preset-file.ts`）。同梱していた自作の配列・物理配列・ローマ字規則はG7 |
| D10 | 現在値と既定値の差分の一覧・結果への条件の併記 | `condition-description.ts`・`metric-conditions` | 表示だけ | 実装済み | 条件の要約と出どころの札（`hosts/shared/ConditionSummary.tsx`）。対象ごとの差は比較表・N感度が出す |
| D11 | 速度グラフの平均方式（SMA・EWMA）と窓幅・半減期 | 条件の「再生」・再生設定の「グラフ設定」 | 表示だけ | 予定あり | #55・#56。N3に含める。項目は `engine/settings-items.ts` にあるが、編集する行が無い |
| D12 | 標準速度・再生倍率・指の移動速度の考慮・全指の移動時間で律速・個人速度の適用 | 条件の「再生」・再生設定 | 表示だけ | 予定あり | #55。N3に含める |
| D13 | 配列ごとのChainの区切り・Arpeggioの数え方の上書き | `analyzer-metrics-content.tsx:626-631`（`override?.chain`・`override?.arpeggioPolicy`）、条件の「Chain」「Arpeggio」の個別設定 | コード | 捨てる（決定済み） | 解釈は全体とWorkspaceのレベルだけに置く。配列・Setupごとには置かない（`engine/settings-items.ts:138-147`の `chainInterpretation`・`arpeggioInterpretation`の `allowedLevels`）。比較で並ぶ対象の数え方が違うと比べる意味が無くなるため |

### E. 結果の表示

| ID | 機能 | 旧画面での出どころ | 確認 | 状態 | 受け皿・候補 |
|---|---|---|---|---|---|
| E1 | 総移動距離の比較表（13列） | `AnalyzerComparisonTable` | 操作 | 実装済み | 比較表（`analyzers/comparison/`）。列の式は同じ |
| E2 | 比較元の選択と、比較元を100%とした比率 | `compare-baseline` | 操作 | 実装済み | 集合の基準（`engine/multi-target-selection.ts`）・解析設定 `showBaselineRatio` |
| E3 | 列見出しによる並び替え | `table-sort` | 操作 | 実装済み | 比較表の解析設定 `sort` |
| E4 | 最小の行を太字で示す | 比較表の `best` | 操作 | 捨てる（決定済み） | docs/architecture.md「対象の選択」の比較表の節（最小の行の強調などはしない）・AGENTS.md「優劣の判定を作らない」 |
| E5 | 総移動距離の棒グラフと、棒グラフにする項目の選択 | `AnalyzerComparisonChart`・`compare-chart-metric` | 操作 | 捨てる（決定済み） | X6。表のセルの中立なデータバー（#18）は、旧画面の独立した棒グラフ（と棒グラフの項目選択）は受けない。最小値の強調はE4と同じ理由で持ち越さない |
| E6 | N感度（Nを0〜10で振った総移動距離。相対・絶対の切り替え） | `AnalyzerSensitivityResults` | 操作 | 実装済み | N感度（`analyzers/n-sensitivity/`）。縦軸の切り替えは解析設定 `scale`。距離以外の指標は未対応 |
| E7 | N感度を展開した時だけ計算する | `panels.sensitivity` | 操作 | 実装済み | 表示しているペインだけを計算する。ペインの計算はengineが担う |
| E8 | Bigram Flow（Keyboard Flow・Relative vectors・Actual / Within-hand・指の組み合わせ） | `analyzer-bigram-flow.tsx`・`analyzers/bigram-flow/` | 操作 | 実装済み | Bigram Flow（`analyzers/bigram-flow/`）。解析設定は保存・共有に載る |
| E9 | 指ごとの移動距離の棒グラフ（左右別・押下数と割合のホバー） | `AnalyzerFingerChart` | 表示だけ | 予定あり | #59。N7 |
| E10 | 指間距離の標準偏差の棒グラフ（隣り合う指6組） | `AnalyzerAdjacentChart` | 操作 | 予定あり | #59。N7に含める |
| E11 | 配列 × 指のマトリックス4種（押下数・移動距離・指間距離の平均・標準偏差）と列ごとの並び替え | `AnalyzerMatrixResult` | 表示だけ | 予定あり | #60。N8。同指連続を指ごとに出す表示は、このマトリックスに面を足す形で一緒に扱える |
| E12 | 統合ヒートマップ（打鍵数をキーに色付け・ホバーの詳細） | `AnalyzerHeatmap` | 表示だけ | 予定あり | #57。N4。`analyzers/heatmap/layer-heatmap.ts` に集計だけがある |
| E13 | 層別ヒートマップ（色の尺度の線形・対数・共通の最大値・シフトキーの枠色の凡例） | `AnalyzerHeatmap` | コード | 予定あり | #57。N4に含める。QWERTYは層が1つなので、複数層の見え方は画面では操作していない |
| E14 | 層の表示方法（並置・タブ）・層が多い配列の「まとめ・詳細」の切り替え | `AnalyzerHeatmap` | コード | 予定あり | #57。N4に含める |
| E15 | キー入力パターンの確認（キーを押して入力パターンを調べる・トリガーのガイド表示・選択のクリア） | `PickerResult`・`key-pattern-picker` | 操作 | 予定あり | #21。N4に含める。同じ仕組み（`input/layouts/key-pattern-picker.ts`）をTesterが使っている |
| E16 | 帰属先の表（層・コンボごとの押下数と割合） | `LayerStats` | コード | 予定あり | #58。N5 |
| E17 | 修飾の一覧（トリガーと出力） | `ModifierList` | コード | 予定あり | #58。N5に含める |
| E18 | コンボの配列図・コンボ表 | `ComboSection` | コード | 予定あり | #58。N5に含める |
| E19 | 結果が出ない時の「配列定義の不備」の表示 | `AnalyzerTextMetricsStatus` | コード | 実装済み | ペインの診断表示（`hosts/shared/PaneFrame.tsx` の `pane-trace-errors`） |

### F. 打鍵再生

再生の時間モデルは `spec/playback-timing.md` と `interpretation/timing/` が持つ。画面は新側に無い。

| ID | 機能 | 旧画面での出どころ | 確認 | 状態 | 受け皿・候補 |
|---|---|---|---|---|---|
| F1 | 再生の操作（再生・一時停止・停止・1ステップ戻る・進む・再生位置のシーク・位置の表示） | `AnalyzerPlaybackSurface` | 操作 | 予定あり | #54。N3 |
| F2 | 再生中の配列図（指の位置・予定のローマ字・押下予定のキー・押下履歴・順番ラベル・帰属・構造・入力の履歴） | `AnalyzerPlaybackSurface` | 操作 | 予定あり | #54。N3に含める |
| F3 | 構造の動的表示（Chain・Arpeggio・同指移動）・押下フィードバック（フェード・パルス・バウンス・なし）・指位置の準備時間・配列図の倍率 | `AnalyzerPlaybackSettings` の「表示設定」 | 表示だけ | 予定あり | #54。N3に含める |
| F4 | かな毎秒・アクション毎秒の速度グラフ（平均の推移・ChainとArpeggioの区間の帯・クリックで再生位置を移す） | `AnalyzerPlaybackRateChart` | コード | 予定あり | #56。N3に含める。平均方式はD11 |
| F5 | 再生設定を配列ごとの上書きにする（「この配列専用にする」） | 再生設定の「適用先」 | 表示だけ | 捨てる（決定済み） | X2。表示だけの設定。旧画面は配列ごとの上書きを持つ |
| F6 | Escで再生設定を閉じる | `analyzer-playback-surface.tsx` | コード | 予定あり | #54。N3に含める（新しい小窓はEscで閉じる規則に揃える） |
| F7 | 個人速度の測定（通常・方向別・指の移動・組ごとの測り直し） | `AnalyzerCalibrationDialog`・`analyzer-calibration-model.ts` | 表示だけ | 予定あり | #53。N6。ロジックは `interpretation/timing/calibration.ts` にある。ダイアログを開いて項目を確かめただけで、測定はしていない（キー入力を取るため） |
| F8 | 個人速度の保存値の確認・編集・全破棄 | `AnalyzerCalibrationDialog` | 表示だけ | 予定あり | #53。N6に含める |

### G. 資産の編集と入出力

| ID | 機能 | 旧画面での出どころ | 確認 | 状態 | 受け皿・候補 |
|---|---|---|---|---|---|
| G1 | 配列を追加（名前・4段の文字・配列側のホームキー・ローマ字規則） | `AnalyzerLayoutEditor` | 操作 | 予定あり | #61。N9。かな配列を画面から定義する機能とは対象が違う（旧画面はQWERTYの4段を並べる形）。N15の後 |
| G2 | 配列の定義ファイルの取り込み（DvorakJの `.txt`・Vialの `.vil`・紅皿の `.bnz` `.ini`。注意の表示） | `importLayout`・`input/layouts/import.ts` | コード | 予定あり | #62。N10。取り込みの処理は `input/layouts/import.ts` に残っている。自前の形式での書き出し・読み込み（G7）やJSONの貼り付けでは、他ツールの形式（DvorakJ・Vial・紅皿）のファイルは受けない |
| G3 | 物理配列エディタ（ピッチ・段ずれ・列オフセット・親指キー・分割間隔・mmとuの単位・名前を付けて保存・上書き・削除） | `AnalyzerGeometryDialog` | 表示だけ | 捨てる（決定済み） | 物理配列エディタを作らない。決定は #29（自作の物理配列を読む経路も消す）。置き場の案だった `editors/` も作らない |
| G4 | 指の割り当てエディタ（列の一括・キー単位・運指を既定へ戻す） | `AnalyzerGeometryDialog` | 表示だけ | 予定あり | #64。N13。新しい構成では指の割当が物理配列から切り離された資産になっている（`platform/assets/user-finger-assignments-storage.ts`） |
| G5 | ローマ字の綴りエディタ（基底ルール＋差分・揺れる箇所の一覧・配列への割り当て・新規作成） | `AnalyzerRomajiDialog` | 表示だけ | 予定あり | #65。N14。配列への割り当てはD5が受ける |
| G6 | 物理配列設定の書き出し・読み込み（JSON） | 「打ち手と機材」の「設定を書き出す」「設定を読み込む」 | 操作（書き出しだけ。読み込みはコード） | 捨てる（決定済み） | 物理配列エディタを作らず、自作の物理配列を扱わないため、物理配列設定の書き出し・読み込みも作らない。決定は #29・#39（#39は自作の物理配列を扱わない） |
| G7 | 自作の配列・ローマ字規則の書き出し・読み込み | 条件ファイルに同梱 | コード | 予定あり | #39。G6と同じ、自作の資産の書き出し・読み込み |
| G8 | 旧画面の保存データの読み込み（保存先の `keydist:app-state` の `analyzer`・`conditions`・`playback` と、初回だけの移行元の `keydist:ui-state`・`keydist:condition-presets`） | `analyzer-ui-state-owner.ts:53-78`・`docs/app-state.md` | コード | 捨てる（決定済み） | X4。通常の保存先は `keydist:app-state` の `analyzer`・`conditions`・`playback`。`keydist:ui-state` は、`keydist:app-state` にこの3つが無い時に1回だけ読む移行元で、移行に成功すると消す。AGENTS.mdは保存データの互換を求めない |
| G9 | 新しい画面で、自作の配列・ローマ字規則を持ち、Analyzerで選べること | `platform/assets/*-storage.ts`・`interpretation/timing/calibration.ts` | コード | 予定あり | #50。N15。今は `keydist:layouts`・`keydist:romaji-rules` を読むのは `src/legacy/` と `src/features/analyzer-next/` だけで、新しいAnalyzerは読まない。`keydist.playback-calibration.v3` を読むのは `src/legacy/` だけ。`keydist:geometry-shapes` を読むのは、旧画面と `src/features/analyzer-next/`（`runtime.ts:18`・`browser-runtime.ts:12`）のほかにはTesterだけ。自作の物理配列はX7 |
| G10 | 旧画面で作った自作の配列・物理配列・ローマ字規則を、新しい側へ移す・読む処理 | `keydist:layouts`・`keydist:geometry-shapes`・`keydist:romaji-rules` | コード | 捨てる（決定済み） | オーナーの方針（2026-10-04）。「旧画面で作ったものを持っていく構造がプログラムを歪めていなければいい。作り直したほうが速いなら新画面で作るほうがいい」。AGENTS.mdの「利用者の保存データの互換は守らない」に合う。新しい構成の資産として新しい画面で作り直す（N15）。**`/analyzer` を消すと、`/analyzer` で作った `keydist:*` の資産はどこからも使えなくなる。** X4（旧保存データの移行）と同じ扱い。リリースノートに書くかの判断（J5）につなぐ |

### H. 共有・キーボード

| ID | 機能 | 旧画面での出どころ | 確認 | 状態 | 受け皿・候補 |
|---|---|---|---|---|---|
| H1 | 共有URL | （`/analyzer` には無い。`location`・`history`・`URLSearchParams` を使っていない） | コード | 実装済み | 旧画面に無かった機能として新側にある（文脈バーの共有。`hosts/standalone/use-url-options.ts`・`use-url-targets.ts`）。旧 `/analyzer/flow` のURLはA2 |
| H2 | 比較表の列見出しのキーボード操作（Enter・Space） | `table-sort` | コード | 実装済み | 比較表の見出し（`analyzers/comparison/`） |
| H3 | 較正中のキー入力の取得 | `analyzer-calibration-dialog.tsx` | コード | 予定あり | #53。N6に含める |

旧画面が `keydown` や `onKeyDown` で独自に登録するキー操作は、`rg` で探した範囲ではH2・H3・F6と、E11のマトリックスの列見出し（Enter・Space）だけだった。ダイアログのEscと背景クリックで閉じる動作は、旧画面が `dialog` 要素の標準の動作と自前の背景クリックで持っていたもので、新しい部品の側に同じ受け皿を作るかは各Analyzerの作業で決める。

### I. Testerとの関係

| ID | 機能 | 旧画面での出どころ | 確認 | 状態 | 受け皿・候補 |
|---|---|---|---|---|---|
| I1 | 旧画面からTesterへの導線 | `analyzer-page.tsx` のリンクはkeydistのトップだけ | 操作 | 実装済み | 導線は元から無い。新側のサイドバーにTesterがある |
| I2 | Testerが読む自作の物理配列 | `tester/input-converter-view.tsx` が `keydist:geometry-shapes` を読む | コード | 捨てる（決定済み） | 物理配列エディタを作らないので、Testerが `keydist:geometry-shapes` を読む経路は消す。決定は #29 |
| I3 | 自作の配列を読む画面 | `tester/input-converter-view.tsx` のimport（`LAYOUTS`・`LAYOUTS_JA`だけ） | コード | 予定あり | #50。Testerは自作の配列を読まない（組み込みの配列だけ）。自作の配列を読むのは旧画面と `src/features/analyzer-next/` だけで、新しいAnalyzer・Setupの対象解決も読まない。新しい構成の資産として作り直す（N15。G10） |

### J. 切り替えの作業

| ID | 機能 | 旧画面での出どころ | 確認 | 状態 | 受け皿・候補 |
|---|---|---|---|---|---|
| J1 | `/analyzer` と `src/legacy/` と旧画面のe2eの削除 | `src/routes/analyzer.tsx`・`e2e/analyzer-*.spec.ts` | コード | 予定あり | #29。旧画面の削除（切り替えの本体） |
| J2 | `/analyzer/flow` と `features/analyzer-next/` の削除 | `src/routes/analyzer_.flow.tsx` | コード | 予定あり | #29。旧画面の削除の範囲。`features/analyzer-next/session-app-state.ts:58,72` も `analyzer`・`conditions`・`playback` を読み、一緒に消える |
| J3 | 古い画面の入口（トップ・サイドバー） | `app/shell/Sidebar.tsx` | コード | 捨てる（決定済み） | `/classic/` は公開しないので、付け替え先は無い。`/analyzer` と一緒に入口も消す |
| J4 | 旧い外部リンクの `legacy.html`（`/analyzer` への転送） | `scripts/write-legacy-analyzer-redirect.ts`・`vite build` の後処理 | コード | 捨てる（決定済み） | 旧URLの転送は作らない。`legacy.html` と、一緒に消す箇所（X5の一覧）は #29で消す |
| J5 | `/analyzer` で作った自作の配列・物理配列・ローマ字規則（`keydist:*`）が、`/analyzer` を消すとどこからも使えなくなること | `keydist:` | コード | 予定あり | リリースノートに書くかを決める（G10） |
| J6 | 旧画面の外にある `#legacy` への依存 | `src/app/state/app-state.ts:2`（型のimport）・`src/app/theme/appearance.ts:13-17`（定数のimport）・`src/app/theme/theme.ts:26`（`keydist:ui-state` を読む初期スクリプト）・`src/app/theme/theme.ts:22`・`src/app/theme/appearance.ts:27-29`（`analyzer.theme` を読む）・`docs/app-state.md` の該当節（Root schemaの `analyzer`・`conditions`・`playback`、Migration sourcesの表） | コード | 予定あり | #29。旧画面の削除の範囲。`src/legacy/` を消すとtypecheckが落ちる箇所と、テーマの初期値の移行元（`keydist:ui-state`）をどうするかがある |
| J7 | 旧画面だけが読む保存の項目（`keydist:app-state` の `analyzer`（`analyzer.theme` を含む）・`conditions`・`playback`） | `src/app/state/app-state.ts`・`docs/app-state.md` | コード | 予定あり | #29。旧画面の削除の範囲。旧画面を消した後は誰も読まないので、スキーマから消すかを決める。ただし `analyzer.theme` は、新しい側のテーマのコード（`theme.ts:22`・`appearance.ts:27-29`）が移行元として読むので、消す時はそちらも直す。X4が「捨てる」なら消せる |

## 作ると決めたもの（issue）

大きさの目安は、小が1つのPR、中が数個のPR、大がスタックPRを組む量。

| ID | タイトル案 | 大きさ | 含む行 | 補足 |
|---|---|---|---|---|
| N1 | 計算方法・仕様へのリンク・GitHubのリンクを新しい画面に置く | 小 | A6・A7 | #51。数値は条件の下での結果という注意は、`AGENTS.md`「数値を外に出す時」の趣旨に沿ってトップだけにある |
| N2 | テキストの文字数を文脈バーのチップに出す | 小 | B4 | #52。旧画面は「290文字」と出した |
| N3 | Analyzer: 打鍵再生を作る（配列図・操作・速度グラフ・表示設定・時間モデルの条件） | 大 | D11・D12・F1〜F4・F6 | `spec/playback-timing.md` と `interpretation/timing/` は済み。issueは3つ。再生の本体（F1〜F3・F6）が #54、条件の行（D11・D12）が #55、速度グラフ（F4とD11の画面側）が #56 |
| N4 | Analyzer: ヒートマップ（統合・層別・キー入力パターンの確認）を作る | 大 | E12〜E15 | #57（統合・層別）・#21（E15のキー入力パターン）。集計は `analyzers/heatmap/layer-heatmap.ts`。層が複数ある配列で画面を操作して確かめる必要がある。E15のキー入力パターンの確認は、キー詳細の共通化（物理キー×面ごとのツールチップとクリック詳細）の#21に統合した。キー詳細の共通化は、ヒートマップのキーのホバー詳細・入力パターンの確認と範囲が重なる |
| N5 | Analyzer: 層・コンボの内訳（帰属先・修飾・コンボ表・コンボ配列図）を作る | 中 | E16〜E18 | #58 |
| N6 | 個人速度の測定と編集の画面を作る | 中 | F7・F8・H3 | #53。キー入力を取る測定の部分が大きい。N3より先でも後でもよい |
| N7 | Analyzer: 指ごとの距離（移動距離・指間距離の標準偏差）を作る | 中 | E9・E10 | #59。Single |
| N8 | Analyzer: 配列 × 指のマトリックスを作る | 中 | E11 | #60。Multi。同指連続を指ごとに出す表示を一緒に扱える |
| N9 | 自作配列を行入力で追加する画面を作る | 中 | G1 | #61。`editors/`。かな配列を画面から定義する機能との範囲の切り分けが要る。N15の後 |
| N10 | 配列の定義ファイル（DvorakJ・Vial・紅皿）の取り込みを作る | 中 | G2 | #62。自前の形式での書き出し・読み込み（G7）とも、JSONの貼り付けとも別で、他ツールの形式のファイルを読む。処理は `input/layouts/import.ts` に残っている。N15の後 |
| N11 | 自作の配列・ローマ字規則を一覧して削除する画面を作る | 小 | C6 | #63。資産の保存形式の整理と同時に扱える。サイドバーのAssets区分の最初の項目になる。N15の後 |
| N13 | 指の割り当てエディタを作る | 中 | G4 | #64。N15の後 |
| N14 | ローマ字の綴りエディタを作る | 中 | G5 | #65。N15の後 |
| N15 | 自作の配列・ローマ字規則を新しい構成の資産として作り、Analyzerで選べるようにする | 中 | G9・I3（C1・D5は実装済みで、組み込みのみという注記が付く行。N15で選べる範囲が広がる） | #50。**N9〜N11・N14の前提。** 旧画面の保存キー（`keydist:layouts`・`keydist:romaji-rules`）を新しい側で読む作業にはしない（G10）。`KeydistAssets` と版付きのcodecとして持ち、作成の画面はN9〜N11で作る。Analyzerのカタログ（`app/standalone/catalog.ts` の `builtinPaneCatalog()`。今は `userLayouts: new Map()` を返し、組み込みだけを返す。使う場所は `TopTargetPick.tsx`・`WorkspaceApp.tsx`・`Standalone*App.tsx`）がそれを読む。**移す処理を作らないので、資産の保存形式の整理の範囲は、旧画面の保存の読み手（`src/legacy/`・`src/features/analyzer-next/`・Tester）を資産の同期の経路へ移す部分が要らなくなり、新しい構成の資産・codec・Analyzerの読み手だけになる。** 物理配列はX7に含める |


N12（物理配列エディタ）は、決定済みの項目X7へ移したので欠番にした。

## 捨てると決めたもの

| ID | 捨てるもの | 含む行 | 理由 | 捨てない場合 |
|---|---|---|---|---|
| X1 | triggerの保持・独立action化を、論理trigger単位・物理trigger単位で個別に指定する機能 | D6 | 決定済み。AGENTS.md「設定項目を足すか決める」の3つ目（割れる人を想像できるが実例が無いものは今は足さない）に当てはまる。新側はキーの種類ごとの例外まで持つ。保存の形（`triggerActivationOverrides`）は新側も読めるので、後から足す時にデータの形は変わらない。 | 決定済みなので無し |
| X2 | 再生の表示設定を配列ごとの上書きにする機能（「この配列専用にする」） | F5 | 決定済み。表示だけの設定で、数値が変わらない。カスケードの配列のレベルに置く項目としても、設定が増える割に使い道が見えない | 決定済みなので無し |
| X3 | テキストの保存上限（10万字）とその表示 | B3 | 決定済み。上限はブラウザの保存容量の都合で、容量超過の扱いは、全データのバックアップ・復元と保存容量の扱いとしてまとめて決める | 決定済みなので無し |
| X4 | 旧画面の保存データ（保存先の `keydist:app-state` の `analyzer`・`conditions`・`playback` と、移行元の `keydist:ui-state`・`keydist:condition-presets`）を、新しい構成へ1回だけ移す処理 | G8 | 決定済み。AGENTS.mdは保存データの互換と移行を要件にしない。なお旧画面の通常の保存先は `keydist:app-state` で、`keydist:ui-state` は初回に1回だけ読む移行元（`analyzer-ui-state-owner.ts:53-78`） | 決定済みなので無し |
| X5 | 旧URL（`/analyzer`・`/analyzer/flow?...`）の転送と、`legacy.html` の転送ページ | A2・J4 | 決定済み（#29）。転送を作らない。`/analyzer` は消えた後に404になり、古い画面の入口も消す（J3）。`legacy.html` は旧アプリの入口で、その後は外部の古いリンクのために `/analyzer` へ転送するページとして残った。一緒に消す箇所は次の全部: `vite.config.ts:12-31,49`（開発サーバーの転送のプラグイン）・`package.json:12`（`build` の `write-legacy-analyzer-redirect.ts`）・`scripts/write-legacy-analyzer-redirect.ts`・`.github/workflows/ci.yml:76`（`.output/public/legacy.html` の検査）・`e2e/analyzer-route.spec.ts:67-71` | 決定済みなので無し |
| X6 | 総移動距離の棒グラフと、棒グラフにする項目の選択 | E5 | 決定済み。表のセルの中立なデータバー（#18）が「値の大きさを見比べる」用途を受ける。棒グラフの最小値の強調は、`AnalyzerBarChart` の任意の引数 `emphasise`（`analyzer-metrics-content.tsx:286-298`）で付けるもので、棒グラフの前提ではない。強調はE4と同じ理由で持ち越さない | 決定済みなので無し |
| X7 | 物理配列エディタ（ピッチ・段ずれ・列オフセット・親指キー・分割間隔・単位・保存・削除） | G3・I2 | 決定済み（#29）。物理配列エディタを作らない（理由は「物理配列を作る人がいるか。機能がそもそも過剰」）。Testerが自作の物理配列を読む経路（`keydist:geometry-shapes`）は消し、物理配列の書き出し・読み込み（G6）も作らない | 決定済みなので無し |

## 保存のキー

旧画面が読み書きするキーと、新しい構成との関係。

| キー | 旧画面での中身 | 新しい構成 |
|---|---|---|
| `keydist:app-state` | 旧画面の通常の保存先（`analyzer`・`conditions`・`playback`）と、Testerの作業台・入力設定・テーマ | 新しい構成も使う（`appearance`・Testerの分）。`analyzer`・`conditions`・`playback` は旧画面と `features/analyzer-next/session-app-state.ts` だけが読む（J2・J7）。`analyzer.theme` は新しい側のテーマのコードが移行元として読む（J6・J7） |
| `keydist:ui-state` | 初回に1回だけ読む移行元。`keydist:app-state` にこの3つが無い時に読み、保存に成功すると消す | 読まない（X4）。テーマの初期スクリプト（`app/theme/theme.ts:26`）が移行元として読む（J6） |
| `keydist:condition-presets` | 旧画面の条件プリセット（`keydist:app-state` に吸収されない独立した資産） | 読まない。新しい保存先は `keydist:presets` |
| `keydist:layouts` | 自作配列 | 読むのは `src/legacy/` と `src/features/analyzer-next/` だけ。新しいAnalyzerは読まず、移さない（G10）。新しい構成の資産として作り直す（N15） |
| `keydist:geometry-shapes` | 自作の物理配列 | 読むのは旧画面・`src/features/analyzer-next/`（`runtime.ts:18`・`browser-runtime.ts:12`）・Testerだけ。新しいAnalyzerは読まず、移さない（G10）。Testerの経路は消す（X7） |
| `keydist:romaji-rules` | ローマ字規則と配列への割り当て | 読むのは `src/legacy/` と `src/features/analyzer-next/` だけ。新しいAnalyzerは読まず、移さない（G10）。新しい構成の資産として作り直す（N15） |
| `keydist.playback-calibration.v3` | 個人速度 | 読むのは `src/legacy/` だけ（再生のAnalyzerができるまで） |

## 関連

- [アーキテクチャ](architecture.md)
