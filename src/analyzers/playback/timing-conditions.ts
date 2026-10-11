import {
  DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  DEFAULT_PLAYBACK_STEPS_PER_SECOND,
} from '#interpretation/timing/playback.ts';
import type { PlaybackCalibration } from '#interpretation/timing/calibration.ts';

/**
 * 再生の時間を決める条件（`spec/playback-timing.md` §2）。再生の時間を求める処理は、この関数が返す値だけを読む。
 * 条件の読み先をここ1か所にまとめてあるので、条件の実効値から読む形へ替える時の変更はこの関数に閉じる。
 *
 * 今は仕様の既定値を返す。個人速度は適用しない。
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
  /** 個人速度。無ければ`undefined` */
  readonly calibration: PlaybackCalibration | undefined;
}

export function playbackTimingConditions(): PlaybackTimingConditions {
  return {
    stepsPerSecond: DEFAULT_PLAYBACK_STEPS_PER_SECOND,
    speedMultiplier: DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
    sameFingerDelay: true,
    allFingerMovementDelay: false,
    calibration: undefined,
  };
}
