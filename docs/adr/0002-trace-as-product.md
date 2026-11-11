# ADR-0002: 生成物をTraceと呼び、段を分けて持つ

- 番号: ADR-0002
- 日付: 2026-10-06（取り込みの日。決めた日は読めない。READMEの「日付」を参照）
- 状態: 採用

## 背景

決めた当時の議論と理由は、取り込み前の履歴にあり読めない。以下は、コード・`docs/architecture.md`・`spec/` に書かれている内容に限る。

## 決定

- 対象を解決した入力でテキストを打った記録（打鍵列・指の移動・押し方）を **Trace** と呼ぶ。`generateTrace` が作る（`docs/architecture.md` の用語「Trace」）
- 流れは、解決 → Trace生成 → 解釈（構造・複数のAnalyzerが使う指標）→ Analyzer（抽出 → 可視化）→ host（個別画面 / Workspace）の順に、段を分けたまま持つ（`docs/architecture.md` 「流れ」）
- Trace生成段と解釈段は別の関数にする。どちらも入力と出力が値で、DOMやReactに依存しない純関数にする（`src/engine/pipeline.ts`）
- 段の名前に「評価」（`evaluate`）を使わない。`docs/architecture.md` の「使わない語」に挙げている

## 却下した案

- 却下の記録は読み取れない。`docs/architecture.md` の「使わない語」に、段の名前としての「評価」（`evaluate`）、View、`AnalysisSession` / `AnalysisSnapshot` が挙がっている。理由は書かれていない

## 結果

- 段を分けているので、キャッシュのキーも段ごとに持つ（`src/engine/keys.ts` の `traceKeyOf`・`interpretationKeyOf`・`singleExtractionKeyOf`）
- 解釈や抽出だけを作り直す変更では、Traceを作り直さない。打鍵再生の時間モデルを解析設定へ移した時に、この性質を使った（ADR-0004）
- Traceに影響する数値が変わる変更では `MODEL_VERSION` を上げる。Traceのキーに入るので、古いキャッシュは自然に一致しなくなる（`src/engine/model-version.ts`）
