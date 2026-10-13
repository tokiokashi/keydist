import type { AggregatedAnalysisResult } from '../structure/aggregate.ts';
import type { StrokeStructureKind } from './calibration.ts';

/** 構造の種類を決めるのに読む、構造解析の結果の部分。 */
export type StrokeStructureInput = Pick<AggregatedAnalysisResult, 'strokes' | 'chains' | 'arpeggioSpans'>;

const kindsCache = new WeakMap<object, readonly StrokeStructureKind[]>();

function markTransitions(
  covered: Uint8Array,
  ranges: readonly { readonly startStrokeIndex: number; readonly endStrokeIndex: number }[],
): void {
  for (const { startStrokeIndex, endStrokeIndex } of ranges) {
    // 範囲は半開区間。遷移i-1 → iは、両端のストロークが同じ範囲に入る時だけ範囲の中にある。
    for (let index = Math.max(1, startStrokeIndex + 1); index < Math.min(endStrokeIndex, covered.length); index++) {
      covered[index] = 1;
    }
  }
}

/**
 * 各ストロークの直前からの遷移（`i-1` → `i`）が属する構造の種類を返す。
 * ArpeggioSpanの中ならArpeggio、そうでなくAnalysis Chainの中ならChain、どちらでもなければその他。
 * 直前のストロークが無い最初のストロークはその他。同じ解析結果には同じ配列を返す。
 */
export function strokeStructureKinds(analysis: StrokeStructureInput): readonly StrokeStructureKind[] {
  const cached = kindsCache.get(analysis);
  if (cached !== undefined) return cached;

  const count = analysis.strokes.length;
  const inArpeggio = new Uint8Array(count);
  const inChain = new Uint8Array(count);
  markTransitions(inArpeggio, analysis.arpeggioSpans);
  markTransitions(inChain, analysis.chains);
  const kinds = Array.from({ length: count }, (_, index): StrokeStructureKind =>
    inArpeggio[index] === 1 ? 'arpeggio' : inChain[index] === 1 ? 'chain' : 'other');
  kindsCache.set(analysis, kinds);
  return kinds;
}
