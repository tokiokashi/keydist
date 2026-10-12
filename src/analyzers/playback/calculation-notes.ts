import { DEFAULT_PLAYBACK_OPTIONS, type PlaybackOptions } from './options.ts';
import type { PersonalSpeedUse } from './timing-conditions.ts';

/**
 * 再生の時間と速度グラフが、既定の解析設定と違う計算になっている理由
 * （`spec/playback-timing.md` §2.2）。解析設定の小窓を開かなくても、ペインの中で読めるようにする。
 *
 * 使われていない項目は挙げない。個人速度で計算している間の基準速度、SMAの間の半減時間、
 * EWMAの間の窓幅は、値を変えても数値が動かないため。
 */
export interface PlaybackCalculationNotes {
  /** 保存した個人速度で計算しているか */
  readonly personalSpeedInUse: boolean;
  /** 既定と違い、数値に入っている項目の名前と値 */
  readonly changes: readonly string[];
}

export function playbackCalculationNotes(
  options: PlaybackOptions,
  personalSpeedUse: PersonalSpeedUse,
): PlaybackCalculationNotes {
  const defaults = DEFAULT_PLAYBACK_OPTIONS;
  const personalSpeedInUse = personalSpeedUse === 'applied';
  const changes: string[] = [];
  if (!personalSpeedInUse && options.stepsPerSecond !== defaults.stepsPerSecond) {
    changes.push(`基準速度: ${options.stepsPerSecond}ステップ/秒`);
  }
  if (options.speedMultiplier !== defaults.speedMultiplier) changes.push(`再生倍率: ${options.speedMultiplier}倍`);
  if (options.sameFingerDelay !== defaults.sameFingerDelay) {
    changes.push(options.sameFingerDelay ? '指の移動速度を考慮する' : '指の移動速度を考慮しない');
  }
  if (options.allFingerMovementDelay !== defaults.allFingerMovementDelay) {
    changes.push(options.allFingerMovementDelay ? '全指の移動時間で律速する' : '全指の移動時間で律速しない');
  }
  if (options.applyPersonalSpeed !== defaults.applyPersonalSpeed) {
    changes.push(options.applyPersonalSpeed ? '個人速度を適用する' : '個人速度を適用しない');
  }
  if (options.rateAverage !== defaults.rateAverage) {
    changes.push(`平均の方式: ${options.rateAverage === 'ewma' ? 'EWMA' : 'SMA'}`);
  }
  if (options.rateAverage === 'sma' && options.rateWindow !== defaults.rateWindow) {
    changes.push(`平均の窓幅: ${options.rateWindow}打鍵`);
  }
  if (options.rateAverage === 'ewma' && options.rateHalfLifeSeconds !== defaults.rateHalfLifeSeconds) {
    changes.push(`平均の半減時間: ${options.rateHalfLifeSeconds}秒`);
  }
  return { personalSpeedInUse, changes };
}
