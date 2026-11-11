import { CHAIN_SEED_COUNT } from './chain-comparison.ts';
import { PRNG_NAME } from './prng.ts';
import { DEFAULT_SEED_START } from './segments.ts';

/**
 * 実文と対照テキスト（順序破壊・一様ランダム）を同じ条件で測った値を並べるための、種の組と集計の定義
 * （定義は`docs/kana-chain-comparison.md`「対照テキストとの比較」）。
 * 測る側（Traceの生成と指標の計算）は呼び出し側が持ち、ここは測った値を集計するだけの純粋な関数にする。
 */

/** 種の始まりの値`s`。Run Chartの解析設定`seedStart`の既定と同じ定義（`DEFAULT_SEED_START`）を使い、同じ種の組にする。 */
export const CONTROL_SEED_START = DEFAULT_SEED_START;

/** 種の数。生成文と対照テキストの数（`CHAIN_SEED_COUNT`）と同じ。 */
export const CONTROL_SEED_COUNT = CHAIN_SEED_COUNT;

/** 種の組`s, s+1, …, s+19`。順序破壊と一様ランダムは同じ種の組で作る。 */
export function controlSeeds(start: number = CONTROL_SEED_START, count: number = CONTROL_SEED_COUNT): number[] {
  return Array.from({ length: count }, (_, offset) => start + offset);
}

/** 対照テキストの値に付随する条件。値と一緒に持ち出す。 */
export interface ControlConditions {
  /** 対照テキストを作る乱数生成器の名前 */
  readonly prng: string;
  readonly seedStart: number;
  readonly seedCount: number;
  /** 標準偏差の分母。種ごとの値を全部として扱い、値の数で割る */
  readonly deviation: 'population';
}

export const CONTROL_CONDITIONS: ControlConditions = {
  prng: PRNG_NAME,
  seedStart: CONTROL_SEED_START,
  seedCount: CONTROL_SEED_COUNT,
  deviation: 'population',
};

/** 値の組の平均と標準偏差。 */
export interface MeanDeviation {
  readonly mean: number;
  readonly deviation: number;
}

/**
 * 算術平均と母標準偏差（分母は値の数）。文節ごとの統計の標準偏差（`bunsetsu-stats.ts`）と同じ定義にそろえる。
 * 値が0個なら両方とも0。
 */
export function meanDeviation(values: readonly number[]): MeanDeviation {
  if (values.length === 0) return { mean: 0, deviation: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { mean, deviation: Math.sqrt(variance) };
}
