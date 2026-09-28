/**
 * 数値を左右するモデルの版（#544 §8-4）。
 *
 * Trace生成（`#trace/generate.ts`）・解釈（`#interpretation/**`）のロジックが変わり、
 * 同じSetup + テキストでも数値が変わりうる変更をした時だけ、この値を1つ上げる。
 *
 * 上げる基準:
 * - 上げる: distanceの計算式・N判定・trigger/action realizationの解決順・
 *   chain/arpeggioの数え方など、`generateTrace` / `analyzeStrokeStructure` / `computeMetrics`
 *   が返す数値そのものが変わる変更
 * - 上げない: 型・コメント・リファクタ（数値が1桁も動かない）、UIやcodecだけの変更、
 *   カスケードの項目やSetupの保存形式の変更（Traceの中身が変わらない限り）
 *
 * 用途:
 * - `#engine/keys.ts` のキャッシュキーに含める。版が変わった旧キャッシュのキーは自然に
 *   一致しなくなるので、明示的なキャッシュの全消去は要らない
 * - 計算結果（`EngineTraceResult` / `EngineInterpretationResult`）に載せる。共有リンク・
 *   書き出しに添えれば、受け取った側が「どの版で計算した数値か」を表示できる
 *   （#544 §8-4「共有リンクと書き出しには計算した版を載せる」）
 */
export const MODEL_VERSION = 1;
