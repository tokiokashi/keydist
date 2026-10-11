import {
  DEFAULT_PLAYBACK_TIMING_SETTINGS,
  type PlaybackTimingSettings,
} from '#interpretation/timing/playback.ts';
import type { PlaybackCalibration } from '#interpretation/timing/calibration.ts';

/**
 * 再生の時間を求める処理が読む値（`spec/playback-timing.md` §2）。条件の実効値（`PlaybackTimingSettings`）から、
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

export function playbackTimingConditions(
  settings: PlaybackTimingSettings = DEFAULT_PLAYBACK_TIMING_SETTINGS,
): PlaybackTimingConditions {
  return {
    stepsPerSecond: settings.stepsPerSecond,
    speedMultiplier: settings.speedMultiplier,
    sameFingerDelay: settings.sameFingerDelay,
    allFingerMovementDelay: settings.allFingerMovementDelay,
    calibration: settings.personalSpeed.apply ? settings.personalSpeed.calibration : undefined,
  };
}

/** 個人速度の扱いの状態。再生のペインが、保存値が無いことを知らせるかの判定に使う。 */
export type PersonalSpeedUse = 'applied' | 'not-applied' | 'missing';

export function personalSpeedUseOf(settings: PlaybackTimingSettings): PersonalSpeedUse {
  if (!settings.personalSpeed.apply) return 'not-applied';
  return settings.personalSpeed.calibration === undefined ? 'missing' : 'applied';
}
