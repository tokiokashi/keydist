import type { AggregatedAnalysisResult } from '../structure/aggregate.ts';
import type { Stroke } from '#trace/generate.ts';
import { isThumb, type Finger } from '#input/shapes/geometry.ts';
import type { OverheadSide, SimultaneousKind, StepOverheadKind, StrokeStructureKind } from './calibration.ts';

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

/** ストロークの押下のうち、指とキーだけを読む部分。基準の速さと同時押しの分け方を、押下の指の並びだけから決められるようにする。 */
export interface StrokePressFingers {
  readonly presses: readonly {
    readonly finger: Finger;
    readonly keys: readonly { readonly id: string }[];
  }[];
}

/**
 * ステップ `i` が続け打ちか。ステップ `i` と `i-1` がどちらも押下を1つだけ持ち、その指とキーが同じ時に真。
 * 保持を続けるストロークの層キーは押下に入らず、保持を始めるストロークでは層キーも押下に入る。
 * 押下を複数持つストロークは、同じ形で続けても続け打ちにしない。
 */
export function isRepeatStroke(stroke: StrokePressFingers | undefined, previous: StrokePressFingers | undefined): boolean {
  if (stroke === undefined || previous === undefined) return false;
  if (stroke.presses.length !== 1 || previous.presses.length !== 1) return false;
  const [press] = stroke.presses;
  const [before] = previous.presses;
  return press.finger === before.finger
    && press.keys.length === before.keys.length
    && press.keys.every((key) => before.keys.some((other) => other.id === key.id));
}

/**
 * ストローク`index`が、かなの中か、かなの境目か。直前のストロークと同じ入力単位（`inputIndex`）を打てばかなの中、
 * 違えばかなの境目。直前のストロークが無い最初のストロークはかなの境目。
 */
export function strokeOverheadSide(strokes: readonly Pick<Stroke, 'inputIndex'>[], index: number): OverheadSide {
  const stroke = strokes[index];
  const previous = strokes[index - 1];
  return stroke !== undefined && previous !== undefined && stroke.inputIndex === previous.inputIndex ? 'within' : 'boundary';
}

/**
 * ストロークの同時押しの分け方（`spec/playback-timing.md` §3.1.2）。押下が2本以上の指にまたがらないストロークは`undefined`。
 * 押下の指に親指を含めば`thumb`、含まず左右の手にまたがれば`both-hands`、含まず全部同じ手なら`one-hand`。
 * 保持を続けるストロークの層キーは押下に入らず、保持を始めるストロークでは層キーも押下に入る。
 * 1本の指で複数のキーを押す押下は、指が1つなので同時押しに入れない。
 */
export function strokeSimultaneousKind(stroke: StrokePressFingers | undefined): SimultaneousKind | undefined {
  if (stroke === undefined) return undefined;
  const fingers = new Set(stroke.presses.map((press) => press.finger));
  if (fingers.size < 2) return undefined;
  if ([...fingers].some(isThumb)) return 'thumb';
  return new Set([...fingers].map((finger) => finger[0])).size > 1 ? 'both-hands' : 'one-hand';
}

const overheadKindsCache = new WeakMap<object, readonly StepOverheadKind[]>();

/**
 * 各ステップの差の種類を返す。同指連続（`sfb`）の押下を持つステップは同指連続、続け打ちのステップは続け打ち、
 * それ以外は構造の種類。解析設定の`sameFingerDelay`は見ない（偽の時に同指連続のステップが構造の種類の値を使うのは、時間を決める側で選ぶ）。
 * 同じ解析結果には同じ配列を返す。
 */
export function strokeOverheadKinds(analysis: StrokeStructureInput): readonly StepOverheadKind[] {
  const cached = overheadKindsCache.get(analysis);
  if (cached !== undefined) return cached;
  const structure = strokeStructureKinds(analysis);
  const kinds = analysis.strokes.map((stroke, index): StepOverheadKind =>
    stroke.presses.some((press) => press.sfb)
      ? 'sfb'
      : isRepeatStroke(stroke, analysis.strokes[index - 1]) ? 'repeat' : structure[index]);
  overheadKindsCache.set(analysis, kinds);
  return kinds;
}
