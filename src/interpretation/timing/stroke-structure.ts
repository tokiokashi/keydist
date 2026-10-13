import type { AggregatedAnalysisResult } from '../structure/aggregate.ts';
import type { Stroke } from '#trace/generate.ts';
import type { OverheadKind, StrokeStructureKind } from './calibration.ts';

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

/**
 * ステップ `i` が続け打ちか。ステップ `i` と `i-1` がどちらも押下を1つだけ持ち、その指とキーが同じ時に真。
 * 保持を続けるストロークの層キーは押下に入らず、保持を始めるストロークでは層キーも押下に入る。
 * 押下を複数持つストロークは、同じ形で続けても続け打ちにしない。
 */
export function isRepeatStroke(stroke: Pick<Stroke, 'presses'> | undefined, previous: Pick<Stroke, 'presses'> | undefined): boolean {
  if (stroke === undefined || previous === undefined) return false;
  if (stroke.presses.length !== 1 || previous.presses.length !== 1) return false;
  const [press] = stroke.presses;
  const [before] = previous.presses;
  return press.finger === before.finger
    && press.keys.length === before.keys.length
    && press.keys.every((key) => before.keys.some((other) => other.id === key.id));
}

const overheadKindsCache = new WeakMap<object, readonly OverheadKind[]>();

/**
 * 各ステップの差の種類を返す。同指連続（`sfb`）の押下を持つステップは同指連続、続け打ちのステップは続け打ち、
 * それ以外は構造の種類。解析設定の`sameFingerDelay`は見ない（偽の時に同指連続のステップが構造の種類の値を使うのは、時間を決める側で選ぶ）。
 * 同じ解析結果には同じ配列を返す。
 */
export function strokeOverheadKinds(analysis: StrokeStructureInput): readonly OverheadKind[] {
  const cached = overheadKindsCache.get(analysis);
  if (cached !== undefined) return cached;
  const structure = strokeStructureKinds(analysis);
  const kinds = analysis.strokes.map((stroke, index): OverheadKind =>
    stroke.presses.some((press) => press.sfb)
      ? 'sfb'
      : isRepeatStroke(stroke, analysis.strokes[index - 1]) ? 'repeat' : structure[index]);
  overheadKindsCache.set(analysis, kinds);
  return kinds;
}
