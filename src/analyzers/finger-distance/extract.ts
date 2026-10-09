import { defineSingleAnalyzer, type SingleAnalyzerDefinition, type SingleAnalyzerExtractContext } from '#analyzers/contract.ts';
import { plainDisciplineContext } from '#analyzers/discipline-material.ts';
import type { Metrics } from '#interpretation/metrics.ts';
import { ALL_FINGERS, type Finger } from '#input/shapes/geometry.ts';
import {
  ALTERNATE_FINGER_DISTANCE_OPTIONS,
  DEFAULT_FINGER_DISTANCE_OPTIONS,
  fingerDistanceOptions,
  type FingerDistanceOptions,
} from './options.ts';

/**
 * 指ごとの距離の抽出（仕様 §11.1・§11.2・§11.6）。
 *
 * `Metrics` が持つ指ごとの総移動距離・押下数・隣接指間距離の統計を、画面がそのまま描ける形に
 * 並べ直すだけで、新しい指標や合成スコアは作らない。割合と手ごとの小計は同じ値の割り算と足し算。
 */

export type FingerDistanceHand = 'left' | 'right';

/** 指1本ぶん。親指を含む10本を、左手の小指から右手の小指までの並びで持つ。 */
export interface FingerDistanceFinger {
  readonly finger: Finger;
  readonly hand: FingerDistanceHand;
  /** 総移動距離 `D_f` [u]（仕様 §11.1） */
  readonly distance: number;
  /** `D_f / D`。`D` が0の時は0（0〜1） */
  readonly distanceShare: number;
  /** 押下数 `Q_f`（仕様 §11.2） */
  readonly presses: number;
  /** `Q_f / Σ Q`。押下が無い時は0（0〜1） */
  readonly pressShare: number;
}

/** 手ごとの小計。 */
export interface FingerDistanceHandTotal {
  readonly hand: FingerDistanceHand;
  readonly distance: number;
  readonly distanceShare: number;
  readonly presses: number;
  readonly pressShare: number;
}

/** 隣り合う指の1組。値は仕様 §11.6の「ホーム間隔からの超過」。 */
export interface FingerDistanceAdjacent {
  readonly pair: readonly [Finger, Finger];
  readonly hand: FingerDistanceHand;
  /** 超過の母標準偏差 [u] */
  readonly stdDev: number;
  /** 超過の平均 [u]。負になりうる */
  readonly meanExcess: number;
  /** 超過の実測最大値 [u] */
  readonly maxExcess: number;
}

export interface FingerDistanceExtracted {
  readonly fingers: readonly FingerDistanceFinger[];
  readonly hands: Readonly<Record<FingerDistanceHand, FingerDistanceHandTotal>>;
  /** 総移動距離 `D` [u]。比較表の総移動距離と同じ値（`Metrics.totalUnits`） */
  readonly totalDistance: number;
  /** 全押下キー数 */
  readonly totalPresses: number;
  readonly adjacent: readonly FingerDistanceAdjacent[];
}

const handOf = (finger: Finger): FingerDistanceHand => (finger.startsWith('L') ? 'left' : 'right');

const ratio = (part: number, whole: number): number => (whole === 0 ? 0 : part / whole);

export function computeFingerDistanceExtraction(metrics: Metrics): FingerDistanceExtracted {
  const totalDistance = metrics.totalUnits;
  const totalPresses = ALL_FINGERS.reduce((sum, finger) => sum + metrics.perFingerPresses[finger], 0);

  const fingers = ALL_FINGERS.map((finger): FingerDistanceFinger => ({
    finger,
    hand: handOf(finger),
    distance: metrics.perFinger[finger],
    distanceShare: ratio(metrics.perFinger[finger], totalDistance),
    presses: metrics.perFingerPresses[finger],
    pressShare: ratio(metrics.perFingerPresses[finger], totalPresses),
  }));

  const handTotal = (hand: FingerDistanceHand): FingerDistanceHandTotal => {
    const members = fingers.filter((item) => item.hand === hand);
    const distance = members.reduce((sum, item) => sum + item.distance, 0);
    const presses = members.reduce((sum, item) => sum + item.presses, 0);
    return { hand, distance, distanceShare: ratio(distance, totalDistance), presses, pressShare: ratio(presses, totalPresses) };
  };

  return {
    fingers,
    hands: { left: handTotal('left'), right: handTotal('right') },
    totalDistance,
    totalPresses,
    adjacent: metrics.adjacent.map((item) => ({
      pair: item.pair,
      hand: handOf(item.pair[0]),
      stdDev: item.stdDev,
      meanExcess: item.meanExcess,
      maxExcess: item.maxExcess,
    })),
  };
}

/**
 * engine（`engine/cache.ts` の `getExtraction`）が呼ぶ、Analyzer契約の実体。
 * 解析設定の項目は無い。
 */
export const fingerDistanceDefinition: SingleAnalyzerDefinition<FingerDistanceOptions, FingerDistanceExtracted> = defineSingleAnalyzer({
  id: 'finger-distance',
  options: fingerDistanceOptions,
  extract(context: SingleAnalyzerExtractContext<FingerDistanceOptions>): FingerDistanceExtracted {
    return computeFingerDistanceExtraction(context.metrics);
  },
  optionsDiscipline: {
    sample: DEFAULT_FINGER_DISTANCE_OPTIONS,
    alternates: ALTERNATE_FINGER_DISTANCE_OPTIONS,
    context: plainDisciplineContext,
  },
});
