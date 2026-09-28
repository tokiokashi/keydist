import * as v from 'valibot';
import { decodeField, defineAssetCodec, isRecord, type AssetCodec } from '#input/codec/index.ts';
import { initialComparisonSelection, type ComparisonSelectionState } from './comparison-selection.ts';

/**
 * `ComparisonSelectionState`（比較表単体ページの対象の集合）のcodec（#544 §8-3）。
 * `standalone-text-codec.ts`と同じ単純さ（他資産との整合を取る必要が無い）。
 *
 * - `setupIds`: 文字列配列。要素が文字列でなければその要素だけ捨てる（Setupの実体が
 *   実際に存在するかどうかはcodecの仕事ではない。削除されたSetupを指すidが残る場合は
 *   `hosts/standalone`側がAnalyzerの`failures`経由で検出し、行として表示する
 *   （#544指示書「Setup削除時の表示」）ので、ここでは形式（文字列であること）だけ見る
 * - `baselineSetupId`: 文字列 or 欠落（undefined）。文字列でなければ診断を積んで
 *   `undefined`（基準なし）へ戻す
 */
const comparisonSelectionSchema = v.strictObject({
  setupIds: v.array(v.string()),
  baselineSetupId: v.optional(v.string()),
});

export const COMPARISON_SELECTION_CODEC: AssetCodec<ComparisonSelectionState> = defineAssetCodec<ComparisonSelectionState>({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    const fallback = initialComparisonSelection();
    const decoded = decodeField(comparisonSelectionSchema, payload, { ...fallback, setupIds: [...fallback.setupIds] }, 'payload', diagnostics);
    return { setupIds: decoded.setupIds, baselineSetupId: decoded.baselineSetupId };
  },
  encodePayload: (value) => ({
    setupIds: [...value.setupIds],
    ...(value.baselineSetupId === undefined ? {} : { baselineSetupId: value.baselineSetupId }),
  }),
});
