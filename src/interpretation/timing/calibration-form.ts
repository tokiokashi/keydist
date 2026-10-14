import { ALL_FINGERS, type Finger } from '#input/shapes/geometry.ts';
import {
  CALIBRATION_OVERHEAD_MS_MAX,
  CALIBRATION_OVERHEAD_MS_MIN,
  OVERHEAD_KINDS,
  CALIBRATION_ACTIONS_PER_SECOND_MAX,
  CALIBRATION_ACTIONS_PER_SECOND_MIN,
  CALIBRATION_FINGER_SPEED_MAX,
  CALIBRATION_FINGER_SPEED_MIN,
  playbackCalibrationProblem,
  type HandDirection,
  type PlaybackCalibration,
  type OverheadKind,
} from './calibration.ts';
import { calibrationItemId } from './calibration-session.ts';

/**
 * 保存した個人速度を数値として編集する欄の値。欄は識別子で指し、値は入力欄の文字列で持つ。
 * 測る項目の欄の識別子は`calibrationItemId`と同じ。次の3つは測る項目に対応しない代表値の欄。
 */
export const CALIBRATION_SAME_HAND_FIELD = 'same-hand';
export const CALIBRATION_FALLBACK_FINGER_FIELD = 'fallback-finger';
const ACTIONS_FIELD = 'actions';
/** 同じキーを続けて打つ速さの欄の識別子。 */
export const CALIBRATION_SAME_KEY_FIELD = 'same-key';

/** 差の種類ごとの打鍵の上乗せの欄の識別子。 */
export function calibrationOverheadFieldId(kind: OverheadKind): string {
  return `overhead:${kind}`;
}

export type CalibrationFormValues = Readonly<Record<string, string>>;

function formatted(value: number): string {
  return value.toFixed(2);
}

/** 保存値を、編集する欄の値にする。持たない項目の欄は含めない。 */
export function calibrationFormValues(calibration: PlaybackCalibration): CalibrationFormValues {
  const values: Record<string, string> = {
    [ACTIONS_FIELD]: formatted(calibration.actionsPerSecond),
    [CALIBRATION_SAME_HAND_FIELD]: formatted(calibration.sameHandDifferentFingerActionsPerSecond),
    [CALIBRATION_FALLBACK_FINGER_FIELD]: formatted(calibration.fallbackFingerSpeedUnitsPerSecond),
  };
  if (calibration.sameKeyActionsPerSecond !== undefined) {
    values[CALIBRATION_SAME_KEY_FIELD] = formatted(calibration.sameKeyActionsPerSecond);
  }
  for (const [direction, speed] of Object.entries(calibration.actionsPerSecondByDirection ?? {})) {
    values[calibrationItemId({ kind: 'direction', direction: direction as HandDirection })] = formatted(speed);
  }
  for (const [pair, speed] of Object.entries(calibration.sameHandDifferentFingerActionsPerSecondByPair)) {
    values[calibrationItemId({ kind: 'same-hand-pair', pair })] = formatted(speed);
  }
  for (const [pair, speed] of Object.entries(calibration.sameHandDifferentFingerActionsPerDirectedPair ?? {})) {
    values[calibrationItemId({ kind: 'directed-pair', pair })] = formatted(speed);
  }
  for (const [finger, speed] of Object.entries(calibration.fingerSpeedUnitsPerSecond)) {
    values[calibrationItemId({ kind: 'finger', finger: finger as Finger })] = formatted(speed);
  }
  for (const [kind, overhead] of Object.entries(calibration.keystrokeOverheadMs ?? {})) {
    values[calibrationOverheadFieldId(kind as OverheadKind)] = overhead.toFixed(1);
  }
  return values;
}

export type ApplyCalibrationFieldResult =
  | { readonly ok: true; readonly calibration: PlaybackCalibration }
  | {
      readonly ok: false;
      /** 直す欄。 */
      readonly fieldId: string;
      /** `empty`は必須の欄が空、`invalid`は数値でない、または範囲の外。 */
      readonly problem: 'empty' | 'invalid';
      readonly min: number;
      readonly max: number;
    };

const DECIMAL = /^(\d+\.?\d*|\.\d+)$/;

function parseValue(raw: string): number | undefined {
  const text = raw.trim();
  return DECIMAL.test(text) ? Number(text) : undefined;
}

const RATE_RANGE = { min: CALIBRATION_ACTIONS_PER_SECOND_MIN, max: CALIBRATION_ACTIONS_PER_SECOND_MAX };
const SPEED_RANGE = { min: CALIBRATION_FINGER_SPEED_MIN, max: CALIBRATION_FINGER_SPEED_MAX };
const OVERHEAD_RANGE = { min: CALIBRATION_OVERHEAD_MS_MIN, max: CALIBRATION_OVERHEAD_MS_MAX };

/** 欄の値の範囲と、空にできるか。保存値の欄でなければ`undefined`。 */
function fieldSpec(fieldId: string): { range: { min: number; max: number }; required: boolean } | undefined {
  if (fieldId === ACTIONS_FIELD || fieldId === CALIBRATION_SAME_HAND_FIELD) return { range: RATE_RANGE, required: true };
  if (fieldId === CALIBRATION_FALLBACK_FINGER_FIELD) return { range: SPEED_RANGE, required: true };
  if (fieldId === CALIBRATION_SAME_KEY_FIELD) return { range: RATE_RANGE, required: false };
  const [kind, ...rest] = fieldId.split(':');
  const name = rest.join(':');
  if (kind === 'overhead' && (OVERHEAD_KINDS as readonly string[]).includes(name)) return { range: OVERHEAD_RANGE, required: false };
  if (kind === 'direction' && (name === 'L→R' || name === 'R→L')) return { range: RATE_RANGE, required: false };
  if (kind === 'same-hand-pair' || kind === 'directed-pair') return { range: RATE_RANGE, required: false };
  if (kind === 'finger' && ALL_FINGERS.includes(name as Finger)) return { range: SPEED_RANGE, required: false };
  return undefined;
}

/** 保存値の1つの欄を、値に置き換える（`value`が無ければ項目を無くす）。欄は`fieldSpec`を通ったものだけ。 */
function withField(base: PlaybackCalibration, fieldId: string, value: number | undefined): PlaybackCalibration {
  const [kind, ...rest] = fieldId.split(':');
  const name = rest.join(':');
  const next: Record<string, unknown> = { ...base };
  /** 表の1キーを入れ替える。任意の表は、空になったら項目ごと無くす。 */
  const setEntry = (table: string, optional: boolean) => {
    const entries: Record<string, number> = { ...(next[table] as Record<string, number> | undefined) };
    if (value === undefined) delete entries[name];
    else entries[name] = value;
    if (optional && Object.keys(entries).length === 0) delete next[table];
    else next[table] = entries;
  };
  const setScalar = (property: string) => {
    if (value === undefined) delete next[property];
    else next[property] = value;
  };
  if (fieldId === ACTIONS_FIELD) setScalar('actionsPerSecond');
  else if (fieldId === CALIBRATION_SAME_HAND_FIELD) setScalar('sameHandDifferentFingerActionsPerSecond');
  else if (fieldId === CALIBRATION_FALLBACK_FINGER_FIELD) setScalar('fallbackFingerSpeedUnitsPerSecond');
  else if (fieldId === CALIBRATION_SAME_KEY_FIELD) setScalar('sameKeyActionsPerSecond');
  else if (kind === 'direction') setEntry('actionsPerSecondByDirection', true);
  else if (kind === 'directed-pair') setEntry('sameHandDifferentFingerActionsPerDirectedPair', true);
  else if (kind === 'overhead') setEntry('keystrokeOverheadMs', true);
  else if (kind === 'same-hand-pair') setEntry('sameHandDifferentFingerActionsPerSecondByPair', false);
  else setEntry('fingerSpeedUnitsPerSecond', false);
  return next as unknown as PlaybackCalibration;
}

/**
 * 編集した1つの欄の値を、保存値に重ねる。他の欄は保存値のまま変えない（欄の表示の丸めも持ち込まない）。
 * 空欄の任意の項目は項目ごと無くし、必須の欄が空、または数値でない・範囲の外なら、その欄と範囲を返して保存値は作らない。
 */
export function applyCalibrationField(
  base: PlaybackCalibration,
  fieldId: string,
  raw: string,
  measuredAtMs: number,
): ApplyCalibrationFieldResult {
  const spec = fieldSpec(fieldId);
  if (spec === undefined) return { ok: false, fieldId, problem: 'invalid', ...RATE_RANGE };
  const { range, required } = spec;
  let value: number | undefined;
  if (raw.trim() === '') {
    if (required) return { ok: false, fieldId, problem: 'empty', ...range };
  } else {
    value = parseValue(raw);
    if (value === undefined || value < range.min || value > range.max) return { ok: false, fieldId, problem: 'invalid', ...range };
  }
  const calibration: PlaybackCalibration = { ...withField(base, fieldId, value), measuredAt: measuredAtMs };
  // 組のキーが指の組として成り立たない欄などは、保存値の検証で落とす。
  if (playbackCalibrationProblem(calibration) !== undefined) return { ok: false, fieldId, problem: 'invalid', ...range };
  return { ok: true, calibration };
}
