# ADR-0002: 生成物をTraceと呼び、段を分けて持つ

- 番号: ADR-0002
- 日付: 2026-10-06（このリポジトリの最初のコミットの日。旧リポジトリから履歴を持たずに取り込んだため、決めた日は読めない）
- 状態: 採用

## 背景

対象を解決した入力でテキストを打った結果から、距離・構造・再生など複数の数値と図が作られる。
結果の元になる記録を1つの名前で呼び、後段が同じ記録を読む形にしないと、Analyzerごとに別の打鍵列を作り直すことになる。

決めた当時の議論は、取り込み前の履歴にあり読めない。以下は、コード・`docs/architecture.md`・`spec/` に書かれている内容に限る。

## 決定

- 対象を解決した入力でテキストを打った記録（打鍵列・指の移動・押し方）を **Trace** と呼ぶ。`generateTrace` が作る（`docs/architecture.md` の用語「Trace」）
- 流れは、解決 → Trace生成 → 解釈（構造・複数のAnalyzerが使う指標）→ Analyzer（抽出 → 可視化）→ host（個別画面 / Workspace）の順に、段を分けたまま持つ（`docs/architecture.md`「流れ」）
- Trace生成段と解釈段は別の関数にする。どちらも入力と出力が値で、DOMやReactに依存しない純関数にする（`src/engine/pipeline.ts`）
- 段の名前に「評価」（`evaluate`）を使わない。`docs/architecture.md` の「使わない語」に挙げている

## 却下した案

- 「評価」を段の名前にする案は、使わない語として退けられている。理由は書かれていない
- 他の呼び名（View、`AnalysisSession` / `AnalysisSnapshot`）も使わない語に挙がっている。理由は書かれていない

## 結果

- 段を分けているので、キャッシュのキーも段ごとに持つ（`src/engine/keys.ts` の `traceKeyOf`・`interpretationKeyOf`・`singleExtractionKeyOf`）
- 解釈や抽出だけを作り直す変更では、Traceを作り直さない。打鍵再生の時間モデルを解析設定へ移した時に、この性質を使った（ADR-0004）
- Traceに影響する数値が変わる変更では `MODEL_VERSION` を上げる。Traceのキーに入るので、古いキャッシュは自然に一致しなくなる（`src/engine/model-version.ts`）
