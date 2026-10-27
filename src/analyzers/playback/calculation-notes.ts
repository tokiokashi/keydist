import type { PlaybackCalibration } from '#interpretation/timing/calibration.ts';
import type { PlaybackOverheadUse } from '#interpretation/timing/playback.ts';
import type { PunctuationWaitUse } from '#interpretation/timing/punctuation-wait.ts';
import { DEFAULT_PLAYBACK_OPTIONS, type PlaybackOptions } from './options.ts';
import { calibrationPartChanges, keystrokeOverheadAdds, simultaneousOverheadAdds, type PersonalSpeedUse } from './timing-conditions.ts';

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
  /** 個人速度で計算していて、保存値の、文章を打つ速さで測った打鍵の上乗せを時間に足しているか */
  readonly keystrokeOverheadInUse: boolean;
  /** 個人速度で計算していて、保存値の、同時押しの上乗せを時間に足しているか */
  readonly simultaneousOverheadInUse: boolean;
  /** 既定と違い、数値に入っている項目の名前と値 */
  readonly changes: readonly string[];
}

const NO_WAIT_USE: PunctuationWaitUse = {
  commaBeforeMs: false,
  commaAfterMs: false,
  periodBeforeMs: false,
  periodAfterMs: false,
};

export function playbackCalculationNotes(
  options: PlaybackOptions,
  personalSpeedUse: PersonalSpeedUse,
  /** 実際に使う個人速度（`PlaybackTimingConditions.calibration`）。 */
  calibration: PlaybackCalibration | undefined,
  /** 部分の設定で外す前の保存値（`PlaybackExtracted.savedCalibration`）。 */
  savedCalibration: PlaybackCalibration | undefined,
  /** 再生するステップの列に上乗せを入れるステップがあるか（`PlaybackExtracted.overheadUse`）。 */
  overheadUse: PlaybackOverheadUse,
  /** 読点・句点の前後の待機のうち、0でなくテキストに足す位置がある項目（`PlaybackExtracted.waitUse`）。省略した時はどれも足さない。 */
  waitUse: PunctuationWaitUse = NO_WAIT_USE,
  /** 文節の区切りの待機を時間に足しているか（`PlaybackExtracted.bunsetsuUse`が有るか）。省略した時は足していない。 */
  bunsetsuWaitInUse = false,
): PlaybackCalculationNotes {
  const defaults = DEFAULT_PLAYBACK_OPTIONS;
  const personalSpeedInUse = personalSpeedUse === 'applied';
  // 「足している」は、保存値が0でない上乗せを持ち、かつ再生するステップの中にその上乗せを式に入れるステップがある時。
  // 時間に入る種類は、続け打ちと構造の種類が常に、同指連続が同じ指の移動時間を考慮する時だけ。
  const keystrokeOverheadInUse = personalSpeedInUse && keystrokeOverheadAdds(calibration, options.sameFingerDelay) && overheadUse.keystroke;
  const simultaneousOverheadInUse = personalSpeedInUse && simultaneousOverheadAdds(calibration) && overheadUse.simultaneous;
  const changes: string[] = [];
  if (!personalSpeedInUse && options.stepsPerSecond !== defaults.stepsPerSecond) {
    changes.push(`基準速度: ${options.stepsPerSecond}ステップ/秒`);
  }
  if (options.speedMultiplier !== defaults.speedMultiplier) changes.push(`再生倍率: ${options.speedMultiplier}倍`);
  if (options.sameFingerDelay !== defaults.sameFingerDelay) {
    changes.push(options.sameFingerDelay ? '同じ指の移動時間を考慮する' : '同じ指の移動時間を考慮しない');
  }
  if (options.allFingerMovementDelay !== defaults.allFingerMovementDelay) {
    changes.push(options.allFingerMovementDelay ? '全指の移動時間で律速する' : '全指の移動時間で律速しない');
  }
  if (options.applyPersonalSpeed !== defaults.applyPersonalSpeed) {
    changes.push(options.applyPersonalSpeed ? '個人速度を適用する' : '個人速度を適用しない');
  }
  changes.push(...calibrationPartChanges(options, savedCalibration));
  if (waitUse.commaBeforeMs) changes.push(`読点の前の待機: ${options.commaBeforeMs}ミリ秒`);
  if (waitUse.commaAfterMs) changes.push(`読点の後の待機: ${options.commaAfterMs}ミリ秒`);
  if (waitUse.periodBeforeMs) changes.push(`句点の前の待機: ${options.periodBeforeMs}ミリ秒`);
  if (waitUse.periodAfterMs) changes.push(`句点の後の待機: ${options.periodAfterMs}ミリ秒`);
  if (bunsetsuWaitInUse) changes.push(`文節の区切りの待機: ${options.bunsetsuWaitMs}ミリ秒`);
  if (options.rateAverage !== defaults.rateAverage) {
    changes.push(`平均の方式: ${options.rateAverage === 'ewma' ? 'EWMA' : 'SMA'}`);
  }
  if (options.rateAverage === 'sma' && options.rateWindow !== defaults.rateWindow) {
    changes.push(`平均の窓幅: ${options.rateWindow}打鍵`);
  }
  if (options.rateAverage === 'ewma' && options.rateHalfLifeSeconds !== defaults.rateHalfLifeSeconds) {
    changes.push(`平均の半減時間: ${options.rateHalfLifeSeconds}秒`);
  }
  return { personalSpeedInUse, keystrokeOverheadInUse, simultaneousOverheadInUse, changes };
}
