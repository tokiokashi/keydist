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
  /** 同じ指の移動時間を考慮するか */
  readonly sameFingerDelay: boolean;
  /** 全指の移動時間で律速するか */
  readonly allFingerMovementDelay: boolean;
  /** 実際に使う個人速度。適用しない設定か保存値が無ければ`undefined` */
  readonly calibration: PlaybackCalibration | undefined;
}

/** 保存値の部分ごとに使うかの設定（`spec/playback-timing.md` §2.1）。 */
export type CalibrationPartOptions = Pick<
  PlaybackOptions,
  'sameHandSpeed' | 'useCrossHandDirection' | 'useFingerValues' | 'useSimultaneousOverhead' | 'useKeystrokeOverhead'
>;

type TimingOptions = CalibrationPartOptions &
  Pick<PlaybackOptions, 'stepsPerSecond' | 'speedMultiplier' | 'sameFingerDelay' | 'allFingerMovementDelay' | 'applyPersonalSpeed'>;

/**
 * 保存値から、使わない設定の部分の項目を外した個人速度を返す。外した項目は、持たないもの
 * （任意の項目）か空のレコード（必須の項目）にする。時間の計算は、値を持たない時の段をそのまま使う。
 * 全部使う設定なら、保存値をそのまま返す。
 */
export function calibrationWithParts(calibration: PlaybackCalibration, parts: CalibrationPartOptions): PlaybackCalibration {
  if (
    parts.sameHandSpeed === 'directed' &&
    parts.useCrossHandDirection &&
    parts.useFingerValues &&
    parts.useSimultaneousOverhead &&
    parts.useKeystrokeOverhead
  )
    return calibration;
  const { actionsPerSecondByDirection, sameHandDifferentFingerActionsPerDirectedPair, keystrokeOverheadMs, simultaneousOverheadMs, ...kept } =
    calibration;
  const next: PlaybackCalibration = { ...kept };
  if (parts.useCrossHandDirection && actionsPerSecondByDirection !== undefined) {
    next.actionsPerSecondByDirection = actionsPerSecondByDirection;
  }
  if (parts.sameHandSpeed === 'directed' && sameHandDifferentFingerActionsPerDirectedPair !== undefined) {
    next.sameHandDifferentFingerActionsPerDirectedPair = sameHandDifferentFingerActionsPerDirectedPair;
  }
  if (parts.sameHandSpeed === 'representative') next.sameHandDifferentFingerActionsPerSecondByPair = {};
  if (!parts.useFingerValues) {
    next.fingerRepeatMs = {};
    next.fingerMoveMsPerUnit = {};
  }
  if (parts.useSimultaneousOverhead && simultaneousOverheadMs !== undefined) {
    next.simultaneousOverheadMs = simultaneousOverheadMs;
  }
  if (parts.useKeystrokeOverhead && keystrokeOverheadMs !== undefined) next.keystrokeOverheadMs = keystrokeOverheadMs;
  return next;
}

/** 保存値の、文章を打つ速さで測った打鍵の上乗せが、時間に足されうるか（§2.2）。0でない値を持ち、同指連続の値は同じ指の移動時間を考慮する時だけ数える。 */
export function keystrokeOverheadAdds(calibration: PlaybackCalibration | undefined, sameFingerDelay: boolean): boolean {
  return Object.entries(calibration?.keystrokeOverheadMs ?? {}).some(([kind, ms]) => ms !== 0 && (kind !== 'sfb' || sameFingerDelay));
}

/** 保存値の同時押しの上乗せが、時間に足されうるか（§2.2）。0でない値を持つ。 */
export function simultaneousOverheadAdds(calibration: PlaybackCalibration | undefined): boolean {
  return Object.values(calibration?.simultaneousOverheadMs ?? {}).some((ms) => ms !== 0);
}

/**
 * 既定と違う部分の設定のうち、外した後の保存値で求めた時間が外す前と違いうるものの、名前と値（§2.2）。
 * 個人速度を適用しない時と保存値が無い時は空。設定が使う項目を保存値が持つかで決め、値の比較はしない。
 */
export function calibrationPartChanges(
  options: CalibrationPartOptions & Pick<PlaybackOptions, 'sameFingerDelay' | 'applyPersonalSpeed'>,
  saved: PlaybackCalibration | undefined,
): string[] {
  const changes: string[] = [];
  if (!options.applyPersonalSpeed || saved === undefined) return changes;
  const hasKeys = (record: object | undefined) => record !== undefined && Object.keys(record).length > 0;
  const hasDirected = hasKeys(saved.sameHandDifferentFingerActionsPerDirectedPair);
  const hasPair = hasKeys(saved.sameHandDifferentFingerActionsPerSecondByPair);
  if (options.sameHandSpeed === 'pair' && hasDirected) changes.push('同手・別指の速度: 組ごと');
  if (options.sameHandSpeed === 'representative' && (hasDirected || hasPair)) {
    changes.push('同手・別指の速度: 代表値だけ');
  }
  if (!options.useCrossHandDirection && hasKeys(saved.actionsPerSecondByDirection)) {
    changes.push('異手の方向別の速度を使わない');
  }
  if (!options.useFingerValues && (hasKeys(saved.fingerRepeatMs) || hasKeys(saved.fingerMoveMsPerUnit))) {
    changes.push('指ごとの値を使わない');
  }
  if (!options.useSimultaneousOverhead && simultaneousOverheadAdds(saved)) changes.push('同時押しの上乗せを使わない');
  if (!options.useKeystrokeOverhead && keystrokeOverheadAdds(saved, options.sameFingerDelay)) {
    changes.push('打鍵の上乗せを使わない');
  }
  return changes;
}

export function playbackTimingConditions(options: TimingOptions, assets: ExtractionAssets): PlaybackTimingConditions {
  return {
    stepsPerSecond: options.stepsPerSecond,
    speedMultiplier: options.speedMultiplier,
    sameFingerDelay: options.sameFingerDelay,
    allFingerMovementDelay: options.allFingerMovementDelay,
    calibration: options.applyPersonalSpeed && assets.personalSpeed !== undefined ? calibrationWithParts(assets.personalSpeed, options) : undefined,
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
export function playbackAssetsKeyOf(options: Pick<PlaybackOptions, 'applyPersonalSpeed' | 'bunsetsuWaitMs'>, assets: ExtractionAssets): unknown {
  // 読点・句点の待機と文節の区切りの待機は日本語のテキストにだけ足すので、テキストの言語はいつもキーに入れる。
  // 文節の区切りは、待機が0でない時だけキーに入れる（0の時は区切りを読まないので、区切りが変わっても抽出を作り直さない）
  return {
    textLanguage: assets.textLanguage,
    ...(options.bunsetsuWaitMs > 0 ? { segmentation: assets.segmentation ?? null } : {}),
    ...(options.applyPersonalSpeed ? { personalSpeed: assets.personalSpeed ?? null } : {}),
  };
}
