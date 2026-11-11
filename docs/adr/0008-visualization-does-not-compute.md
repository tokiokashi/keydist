# ADR-0008: 可視化は計算せず、engineが抽出を実行する

- 番号: ADR-0008
- 日付: 2026-10-06（このリポジトリの最初のコミットの日。旧リポジトリから履歴を持たずに取り込んだため、決めた日は読めない）
- 状態: 採用

## 背景

図を描くcomponentが数値を計算すると、計算がReactの描画のタイミングに縛られ、テストにも、Workerへの移動にも、キャッシュにも、Reactが入り込む。
決めた当時の議論は、取り込み前の履歴にあり読めない。以下は、`docs/architecture.md` に書かれている内容に限る。

## 決定

- **可視化は計算しない。** engineが抽出を実行し、hostが結果をcomponentへ渡す（`docs/architecture.md`「依存の規則」）
- Analyzerの契約のうち純粋な部分（抽出・解析設定・Traceを依頼する窓口の型）だけを `analyzers/contract.ts` に置く。可視化のcomponentとの結び付けは、各Analyzerの `definition.tsx` と `analyzers/pane-parts.tsx` の型に置く。engineは純粋な部分しか知らない
- 名前と短い説明は、Reactに依存しない `analyzers/<name>/pane-meta.ts` に置く。routeは `definition.tsx` ではなくこちらを読む。`definition.tsx` をimportすると、本体のcomponentとCSSが全ページの初期読み込みに入るため
- 抽出のキャッシュキーは、解釈のキー + Analyzer id + 抽出に効くoptions + 抽出が読む資産とする（`engine/keys.ts` の `analyzerExtractionKeyOf`）。見た目だけの解析設定はキーから除かれるので、見た目だけの変更では抽出が走らない
- 抽出が読む資産（今は個人速度の保存値）は、`ResolvedInput.extractionAssets` に持ち、抽出の文脈として渡す。キーに入れる分は各Analyzerが `assetsKeyOf` で決める。Traceと解釈のキーには入れない
- `ResolvedInput.cascade` は表示専用で、抽出はそこから読まない

## 却下した案

- 可視化のcomponentが自分で計算する案は、純粋な層の理由（ADR-0007）で退けられている。計算がReactのファイルを1つでもimportすると、unit testが読めなくなる。重い計算をWorkerへそのまま移せない。キャッシュが描画のタイミングに縛られる
- 却下した他の案の記録は読み取れない

## 結果

- engineの型にReactが現れず、計算をWorkerへそのまま移せた（ADR-0009）
- 資産を読むAnalyzerは、`assetsKeyOf` で資産の変更を抽出のキーに入れる責任を負う。資産を読まないAnalyzerは何も入れない
- 抽出が複数のTraceを必要とする集合のAnalyzerは、「Traceを依頼する窓口」（`TraceRequester`）を通して、キャッシュ経由でTraceを共有する
