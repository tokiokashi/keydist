import { countBigramCombinations } from '#interpretation/bigram-combinations.ts';
import { analyzeHandRhythm, type HandRhythmAggregate } from '#interpretation/structure/hand-rhythm.ts';
import { adjacentMeanStdDev, rightHandShare, sameFingerRate, type Metrics } from '#interpretation/metrics.ts';
import type { Trace } from '#trace/generate.ts';
import type { ComparisonColumnId } from './comparison-column-text.ts';

/**
 * 比較表の列の値。比較表（`comparison/`）と、同じ列を軸に取る散布図（`scatter/`）が読む。
 * Analyzerどうしは互いをimportできないので、`analyzers/`直下に置く。
 * `Metrics`と`Trace`から読み出すだけの写像で、独自の派生指標・合成スコアは作らない。
 */

/** 1行（1 Setup）ぶんの、全列の生値。値が無い列（連続が0件の平均と最長の長さ）は`NaN`。 */
export type ComparisonRowValues = Readonly<Record<ComparisonColumnId, number>>;

/** 両手の打鍵を含む組の割合（%）。分母は手の切り替え + 同じ手の継続 + 両手の打鍵を含む組で、押す手が無い打鍵を含む組は入れない。分母が0なら0。 */
function bothHandPairShare(handRhythm: HandRhythmAggregate): number {
  const pairs = handRhythm.switches + handRhythm.continuations + handRhythm.bothHandPairs;
  return pairs === 0 ? 0 : (handRhythm.bothHandPairs / pairs) * 100;
}

/** `Metrics`と`Trace`から全列を読み出す純関数。Bigramの組の種類数の2列とHand Rhythmの9列だけ`Trace`から数え、他の列は`Metrics`を写す。 */
export function computeComparisonRowValues(metrics: Metrics, trace: Trace): ComparisonRowValues {
  const bigrams = countBigramCombinations(trace);
  // Hand Rhythmの値は`Trace`だけで決まる。集計が持つ条件のスナップショットには、`Trace`を生成したTrigger realizationとAction realizationのPolicyを渡す。
  const handRhythm = analyzeHandRhythm(trace.strokes, metrics.conditions.triggerRealizationPolicy, metrics.conditions.actionRealizationPolicy).aggregate;
  const { mean: adjacentMean, stdDev: adjacentStdDev } = adjacentMeanStdDev(metrics.adjacent);
  return {
    actions: metrics.actions,
    totalUnits: metrics.totalUnits,
    meanPerStroke: metrics.meanPerStroke,
    perCharUnits: metrics.perCharUnits,
    perCharSteps: metrics.perCharSteps,
    perCharPresses: metrics.perCharPresses,
    perActionPresses: metrics.perActionPresses,
    perPressUnits: metrics.perPressUnits,
    singleTapLayerRate: metrics.singleTapLayerRate,
    singleTapRate: metrics.singleTapRate,
    singleKeyRate: metrics.singleKeyRate,
    sameFinger: metrics.sameFinger,
    sameFingerRate: sameFingerRate(metrics.sameFinger, metrics.strokes),
    adjacentMean,
    adjacentStdDev,
    rightHandDistanceShare: rightHandShare(metrics.perFinger),
    rightHandPressShare: rightHandShare(metrics.perFingerPresses),
    physicalBigramCombinations: bigrams.physical,
    logicalBigramCombinations: bigrams.withTriggers,
    alternationCoverage: handRhythm.alternation.coverage.rate * 100,
    sameHandContinuationRate: handRhythm.continuationRate * 100,
    handSwitches: handRhythm.switches,
    handContinuations: handRhythm.continuations,
    bothHandPairShare: bothHandPairShare(handRhythm),
    bothHandStrokes: handRhythm.bothHandStrokes.simultaneous + handRhythm.bothHandStrokes.mixed,
    alternationRuns: handRhythm.alternation.runs,
    // 連続が0件の時は平均も最長も値が無い。0を当てはめず、表では「—」、並び替えでは末尾に置く。
    alternationMeanLength: handRhythm.alternation.runs === 0 ? NaN : handRhythm.alternation.meanLength,
    alternationMaxLength: handRhythm.alternation.runs === 0 ? NaN : handRhythm.alternation.maxLength,
  };
}
