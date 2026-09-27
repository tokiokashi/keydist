import { defineAssetCodec, isRecord, UNSAFE_OBJECT_KEYS, type AssetCodec } from '#input/codec/index.ts';
import type { AnalyzerSetSelectionState } from './analyzer-set-selection.ts';

/**
 * `AnalyzerSetSelectionState`のcodec（#544 §8-3）。`standalone-analyzer-options-codec.ts`と
 * ほぼ同じ形（外側の形だけを検査し、Analyzer idごとの中身は単純な文字列配列なのでそのまま
 * decodeできる。個別Analyzerへ依存する深いdecodeが要らない分、あちらより単純）。
 *
 * - 資産全体がobjectでなければ空へ戻す
 * - 各キー（Analyzer id）が`UNSAFE_OBJECT_KEYS`なら、その1件だけ診断付きで捨てる
 * - 各値が配列でなければその1件だけ捨てる。配列の要素は文字列だけを残す
 *   （`comparison-selection-codec.ts`の`setupIds`と同じ判断: Setupの実体が実際に
 *   存在するかどうかはcodecの仕事ではない）
 * - 未知のAnalyzer idは残す（`standalone-analyzer-options-codec.ts`と同じ判断。
 *   Analyzerが一時的に無効化・削除されても選択を静かに失わない）
 */
export const ANALYZER_SET_SELECTION_CODEC: AssetCodec<AnalyzerSetSelectionState> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    const result: Record<string, readonly string[]> = {};
    for (const [analyzerId, raw] of Object.entries(payload)) {
      if (UNSAFE_OBJECT_KEYS.has(analyzerId)) {
        diagnostics.push({
          path: `payload.${analyzerId}`,
          message: `予約された名前「${analyzerId}」のため、この選択を丸ごと捨てた`,
        });
        continue;
      }
      if (!Array.isArray(raw)) {
        diagnostics.push({ path: `payload.${analyzerId}`, message: '配列形式でないため選択を捨てた' });
        continue;
      }
      const setupIds: string[] = [];
      for (const item of raw) {
        if (typeof item === 'string') {
          setupIds.push(item);
        } else {
          diagnostics.push({ path: `payload.${analyzerId}[]`, message: `文字列でない要素「${String(item)}」を捨てた` });
        }
      }
      result[analyzerId] = setupIds;
    }
    return result;
  },
  encodePayload: (value) => Object.fromEntries(
    Object.entries(value).map(([analyzerId, setupIds]) => [analyzerId, [...setupIds]]),
  ),
});
