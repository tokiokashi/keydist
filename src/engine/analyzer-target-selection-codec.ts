import { defineAssetCodec, isRecord, UNSAFE_OBJECT_KEYS, type AssetCodec } from '#input/codec/index.ts';
import { decodeAnalysisTarget, type AnalysisTarget } from '#input/setup/index.ts';
import type { AnalyzerTargetSelectionState } from './analyzer-target-selection.ts';

/**
 * `AnalyzerTargetSelectionState`のcodec（#578指摘1）。`analyzer-set-selection-codec.ts`の
 * 単一対象版。ネスト・未知idの扱いは同じ理由（`selections`へ1段ネストしてcodecの予約語
 * `version`との衝突を避ける／未知のAnalyzer idは残す）。
 */
export const ANALYZER_TARGET_SELECTION_CODEC: AssetCodec<AnalyzerTargetSelectionState> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    const rawSelections = payload.selections;
    if (rawSelections === undefined) return {};
    if (!isRecord(rawSelections)) {
      diagnostics.push({ path: 'payload.selections', message: 'object形式でないため選択を全て捨てた' });
      return {};
    }
    const result: Record<string, AnalysisTarget> = {};
    for (const [analyzerId, raw] of Object.entries(rawSelections)) {
      const path = `payload.selections.${analyzerId}`;
      if (UNSAFE_OBJECT_KEYS.has(analyzerId)) {
        diagnostics.push({ path, message: `予約された名前「${analyzerId}」のため、この選択を捨てた` });
        continue;
      }
      const decoded = decodeAnalysisTarget(raw, path, diagnostics);
      if (decoded === undefined) continue;
      result[analyzerId] = decoded;
    }
    return result;
  },
  encodePayload: (value) => ({
    selections: Object.fromEntries(Object.entries(value).map(([analyzerId, target]) => [analyzerId, { ...target }])),
  }),
});
