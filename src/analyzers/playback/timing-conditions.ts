import type { ExtractionAssets } from '#analyzers/contract.ts';
import type { PlaybackCalibration } from '#interpretation/timing/calibration.ts';
import type { PlaybackOptions } from './options.ts';

/**
 * 再生の時間を求める処理が読む値（`spec/playback-timing.md` §2）。解析設定の項目から、
 * 個人速度の適用の設定と保存値を合わせて、実際に使う個人速度だけを残した形にする。
 */
export interface PlaybackTimingConditions {
  /** 基準速度 [ステップ/秒] */
  readonly stepsPerSecond: number;
  /** 再生倍率 */
  readonly speedMultiplier: number;
  /** 指の移動速度を考慮するか */
  readonly sameFingerDelay: boolean;
  /** 全指の移動時間で律速するか */
  readonly allFingerMovementDelay: boolean;
  /** 実際に使う個人速度。適用しない設定か保存値が無ければ`undefined` */
  readonly calibration: PlaybackCalibration | undefined;
}

type TimingOptions = Pick<
  PlaybackOptions,
  'stepsPerSecond' | 'speedMultiplier' | 'sameFingerDelay' | 'allFingerMovementDelay' | 'applyPersonalSpeed'
>;

export function playbackTimingConditions(options: TimingOptions, assets: ExtractionAssets): PlaybackTimingConditions {
  return {
    stepsPerSecond: options.stepsPerSecond,
    speedMultiplier: options.speedMultiplier,
    sameFingerDelay: options.sameFingerDelay,
    allFingerMovementDelay: options.allFingerMovementDelay,
    calibration: options.applyPersonalSpeed ? assets.personalSpeed : undefined,
  };
}

/** 個人速度の扱いの状態。再生のペインが、保存値が無いことを知らせるかの判定に使う。 */
export type PersonalSpeedUse = 'applied' | 'not-applied' | 'missing';

export function personalSpeedUseOf(options: Pick<PlaybackOptions, 'applyPersonalSpeed'>, assets: ExtractionAssets): PersonalSpeedUse {
  if (!options.applyPersonalSpeed) return 'not-applied';
  return assets.personalSpeed === undefined ? 'missing' : 'applied';
}

/**
 * 抽出のキーに入れる資産。個人速度を適用する設定の時だけ保存値を入れる（保存値が無い時は`null`）。
 * 適用しない設定の時は保存値を読まないので、保存値が変わっても抽出を作り直さない。
 */
export function playbackAssetsKeyOf(options: Pick<PlaybackOptions, 'applyPersonalSpeed'>, assets: ExtractionAssets): unknown {
  return options.applyPersonalSpeed ? { personalSpeed: assets.personalSpeed ?? null } : null;
}
