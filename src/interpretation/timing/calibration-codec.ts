import { defineAssetCodec, isRecord, type AssetCodec } from '#input/codec/index.ts';
import { playbackCalibrationProblem, SIMULTANEOUS_KINDS, type PlaybackCalibration } from './calibration.ts';

/**
 * 個人速度の資産。保存した測定値を1つだけ持つ。配列・物理配列・指の割り当てには紐づけず、
 * どの条件で測ったかも残さない（`spec/playback-timing.md` §7.6）。
 */
export interface PersonalSpeed {
  /** 保存した個人速度。測定していない、または破棄した時は無い。 */
  readonly calibration: PlaybackCalibration | undefined;
}

export const EMPTY_PERSONAL_SPEED: PersonalSpeed = { calibration: undefined };

function copyRecord<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(Object.entries(record));
}

/** 検証済みの値から、保存形式に載せる項目だけを写す。知らない項目は持ち越さない。 */
function copyCalibration(value: PlaybackCalibration): PlaybackCalibration {
  return {
    actionsPerSecond: value.actionsPerSecond,
    ...(value.actionsPerSecondByDirection === undefined
      ? {}
      : { actionsPerSecondByDirection: copyRecord(value.actionsPerSecondByDirection) }),
    sameHandDifferentFingerActionsPerSecond: value.sameHandDifferentFingerActionsPerSecond,
    sameHandDifferentFingerActionsPerSecondByPair: copyRecord(value.sameHandDifferentFingerActionsPerSecondByPair),
    ...(value.sameHandDifferentFingerActionsPerDirectedPair === undefined
      ? {}
      : { sameHandDifferentFingerActionsPerDirectedPair: copyRecord(value.sameHandDifferentFingerActionsPerDirectedPair) }),
    fingerRepeatMs: copyRecord(value.fingerRepeatMs),
    fingerMoveMsPerUnit: copyRecord(value.fingerMoveMsPerUnit),
    fallbackRepeatMs: value.fallbackRepeatMs,
    fallbackMoveMsPerUnit: value.fallbackMoveMsPerUnit,
    ...(value.keystrokeOverheadMs === undefined
      ? {}
      : { keystrokeOverheadMs: copyRecord(value.keystrokeOverheadMs) }),
    ...(value.simultaneousOverheadMs === undefined
      ? {}
      : { simultaneousOverheadMs: copyRecord(value.simultaneousOverheadMs) }),
    ...(value.sentenceSimultaneousKinds === undefined
      ? {}
      : { sentenceSimultaneousKinds: SIMULTANEOUS_KINDS.filter((kind) => value.sentenceSimultaneousKinds?.includes(kind)) }),
    measuredAt: value.measuredAt,
  };
}

/**
 * 個人速度のcodec。payloadは`{ calibration? }`。
 *
 * 保存された測定値が範囲外・必須項目の欠け・知らない指や組のキーを持つ時は、一部だけを残さず
 * 測定値ごと捨てて「個人速度無し」にし、理由を診断に積む。指ごとの移動速度と同じキーを続けて打つ速さを持つ旧い形も、
 * 必須項目の欠けとして同じく捨てる（変換しない）（一部の項目だけ残すと、測定した
 * 組み合わせと違う値の組が再生に使われるため）。
 */
export const PERSONAL_SPEED_CODEC: AssetCodec<PersonalSpeed> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    if (payload.calibration === undefined) return EMPTY_PERSONAL_SPEED;
    const problem = playbackCalibrationProblem(payload.calibration);
    if (problem !== undefined) {
      diagnostics.push({ path: 'calibration', message: `${problem}。個人速度を捨てました` });
      return EMPTY_PERSONAL_SPEED;
    }
    return { calibration: copyCalibration(payload.calibration as PlaybackCalibration) };
  },
  encodePayload: (value) => (
    value.calibration === undefined ? {} : { calibration: copyCalibration(value.calibration) }
  ),
});
