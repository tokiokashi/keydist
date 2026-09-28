import { defineAssetCodec, isRecord, type AssetCodec } from '#input/codec/index.ts';
import { decodeAnalysisTarget } from '#input/setup/index.ts';
import type { SingleTargetSelection } from './single-target-selection.ts';

/**
 * `SingleTargetSelection`のcodec（#663）。payloadは`{ target? }`。
 *
 * 版1はAnalyzerごとに持っていた旧資産（`keydist:analyzer-target-selections`）とは別のキーに
 * 置く新しい資産の版で、旧資産からの移行は持たない（互換は守らない。AGENTS.md）。
 * 対象が壊れていれば診断付きで「まだ選んでいない」へ戻す。
 */
export const SINGLE_TARGET_SELECTION_CODEC: AssetCodec<SingleTargetSelection> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    if (payload.target === undefined) return { target: undefined };
    return { target: decodeAnalysisTarget(payload.target, 'payload.target', diagnostics) };
  },
  encodePayload: (value) => (value.target === undefined ? {} : { target: { ...value.target } }),
});
