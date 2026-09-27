import type { SingleAnalyzerDefinition, SingleAnalyzerExtractContext } from '#analyzers/contract.ts';
import type { Trace } from '#trace/generate.ts';
import {
  aggregateBigramVectors,
  buildBigramVectors,
  directionDensity,
  directionSummary,
  filterBigramVectors,
  meanDisplacement,
  relativeVectors,
  repeatCountsByKey,
  type BigramVector,
  type DirectionDensity,
  type DirectionSummary,
  type MeanDisplacement,
  type RelativeVector,
} from './bigram-vectors.ts';
import {
  DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG,
  bigramFlowExtractKeyOf,
  decodeBigramFlowOptions,
  nonStationaryVectors,
  type BigramFlowOptions,
} from './options.ts';

/**
 * Bigram Flowの抽出（`extract`）。#544 §7・docs/architecture.md「抽出」の実装。
 *
 * 可視化（`definition.tsx`）が必要とする計算済みデータをすべてここへ集める。
 * 可視化側は受け取った値をそのまま描くだけで、`bigram-vectors.ts`の関数を
 * 呼び返さない（「可視化は計算しない」docs/architecture.md）。
 *
 * ここに含めるのは「抽出に効く設定（`source` `selectedFingers` `polarBandwidth`。
 * `options.ts`の`bigramFlowExtractKeyOf`のコメント参照）で値が変わる計算」だけ。
 * 見た目だけの設定（`lineScale` `layerOrder` `hoverScale` `movementScaleMode`
 * `polarGain`）は、この抽出結果を画面のpixel/scaleへ変換する側（`definition.tsx`の
 * 可視化component）が担う。
 */

const POLAR_SAMPLE_COUNT = 192;

/** 片手分の、Movement profileプロットが必要とする計算済みデータ。 */
export interface BigramFlowHandProfile {
  readonly relative: readonly RelativeVector[];
  readonly summary: DirectionSummary;
  readonly mean: MeanDisplacement;
  readonly density: DirectionDensity;
}

export interface BigramFlowExtracted {
  readonly keyboardFlow: {
    /** Keyboard Flowが描く集約済みvector（重ね順は可視化側が`layerOrder`で決める）。 */
    readonly vectors: readonly BigramVector[];
    /** 同一キー連続打鍵の回数。repeatバッジが使う。 */
    readonly repeatCounts: ReadonlyMap<string, number>;
    /** repeatを除いた線の中での最大weight。線の太さのスケール計算の分母。 */
    readonly maxWeight: number;
  };
  /** 指フィルタ後・集約前のvector数（重み総和）。ステータス表示の「n vectors」。 */
  readonly rawCount: number;
  readonly hands: {
    readonly left: BigramFlowHandProfile;
    readonly right: BigramFlowHandProfile;
  };
  /** 左右共通のスケールで揃えるための、相対vectorの最大距離・最大weight。 */
  readonly relativeMaxDistance: number;
  readonly relativeMaxWeight: number;
  /** 左右で個別正規化せず共通のextentを取るための、KDE密度の最大値。 */
  readonly sharedMaxDensity: number;
  /** Cross-hand bigramがMovement profile対象（analysisVectors）に含まれるか。脚注の出し分けに使う。 */
  readonly hasCrossHandInAnalysis: boolean;
}

/**
 * `SingleAnalyzerDefinition.extract`の中身。engineの`SingleAnalyzerExtractContext`からは
 * `trace`と`options`しか使わない（`analysis` `metrics` `requestTrace`は現状のBigram Flowには
 * 不要）ので、legacy側（engineを経由しない`src/legacy/analyzer-bigram-flow.tsx`・
 * `src/features/analyzer-next/`）もこの関数を直接呼べるよう、契約の型を経由せず
 * `Trace`と`options`だけを引数に取る形で外へ公開する。
 */
export function computeBigramFlowExtraction(
  trace: Trace,
  options: BigramFlowOptions,
): BigramFlowExtracted {
  const vectors = buildBigramVectors(trace.strokes, options.source);
  const filtered = filterBigramVectors(vectors, options.selectedFingers);
  const aggregated = aggregateBigramVectors(filtered);

  // 1指選択だけ特別扱い: 「その指自身のキー間移動」だけを見たいので、
  // 通常のfilter（その指が絡む全vector）ではなく、from/toとも同じ指のvectorだけを
  // 集める（bigram-flow-view.tsxの旧実装から移設。挙動は変えない）。
  const analysisVectors = options.selectedFingers.length === 1
    ? aggregateBigramVectors(vectors.filter((vector) =>
      vector.fromFingerClass === options.selectedFingers[0]
      && vector.toFingerClass === options.selectedFingers[0]))
    : aggregated;

  const rawCount = filtered.reduce((sum, vector) => sum + vector.weight, 0);

  const leftRelative = relativeVectors(analysisVectors, 'left');
  const rightRelative = relativeVectors(analysisVectors, 'right');
  const allRelative = [...leftRelative, ...rightRelative];
  const relativeMaxDistance = Math.ceil(Math.max(
    1,
    ...allRelative.map((vector) => Math.hypot(vector.dx, vector.dy)),
  ));
  const relativeMaxWeight = Math.max(1, ...allRelative.map((vector) => vector.weight));

  const leftDensity = directionDensity(analysisVectors, 'left', options.polarBandwidth, POLAR_SAMPLE_COUNT);
  const rightDensity = directionDensity(analysisVectors, 'right', options.polarBandwidth, POLAR_SAMPLE_COUNT);
  const sharedMaxDensity = Math.max(
    0,
    ...leftDensity.samples.map((sample) => sample.density),
    ...rightDensity.samples.map((sample) => sample.density),
  );

  const movingVectors = nonStationaryVectors(aggregated);
  const maxWeight = Math.max(1, ...movingVectors.map((vector) => vector.weight));
  const repeatCounts = repeatCountsByKey(aggregated);

  const hasCrossHandInAnalysis = options.source === 'actual'
    && analysisVectors.some((vector) => vector.hand === 'cross');

  return {
    keyboardFlow: { vectors: aggregated, repeatCounts, maxWeight },
    rawCount,
    hands: {
      left: {
        relative: leftRelative,
        summary: directionSummary(analysisVectors, 'left'),
        mean: meanDisplacement(analysisVectors, 'left'),
        density: leftDensity,
      },
      right: {
        relative: rightRelative,
        summary: directionSummary(analysisVectors, 'right'),
        mean: meanDisplacement(analysisVectors, 'right'),
        density: rightDensity,
      },
    },
    relativeMaxDistance,
    relativeMaxWeight,
    sharedMaxDensity,
    hasCrossHandInAnalysis,
  };
}

/** engine（`engine/cache.ts`の`getExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const bigramFlowDefinition: SingleAnalyzerDefinition<BigramFlowOptions, BigramFlowExtracted> = {
  id: 'bigram-flow',
  cardinality: 'single',
  defaultOptions: DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG,
  decodeOptions: decodeBigramFlowOptions,
  extractKeyOf: bigramFlowExtractKeyOf,
  extract(context: SingleAnalyzerExtractContext<BigramFlowOptions>): BigramFlowExtracted {
    return computeBigramFlowExtraction(context.trace, context.options);
  },
};
