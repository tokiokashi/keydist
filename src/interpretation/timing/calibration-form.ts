import { ALL_FINGERS, type Finger } from '#input/shapes/geometry.ts';
import {
  CALIBRATION_OVERHEAD_MS_MAX,
  CALIBRATION_OVERHEAD_MS_MIN,
  STROKE_STRUCTURE_KINDS,
  CALIBRATION_ACTIONS_PER_SECOND_MAX,
  CALIBRATION_ACTIONS_PER_SECOND_MIN,
  CALIBRATION_FINGER_SPEED_MAX,
  CALIBRATION_FINGER_SPEED_MIN,
  playbackCalibrationProblem,
  type HandDirection,
  type PlaybackCalibration,
  type StrokeStructureKind,
} from './calibration.ts';
import { calibrationItemId } from './calibration-session.ts';

/**
 * 保存した個人速度を数値として編集する欄の値。欄は識別子で指し、値は入力欄の文字列で持つ。
 * 測る項目の欄の識別子は`calibrationItemId`と同じ。次の3つは測る項目に対応しない代表値の欄。
 */
export const CALIBRATION_SAME_HAND_FIELD = 'same-hand';
export const CALIBRATION_FALLBACK_FINGER_FIELD = 'fallback-finger';
const ACTIONS_FIELD = 'actions';

/** 構造の種類ごとの連打との差の欄の識別子。 */
export function calibrationOverheadFieldId(kind: StrokeStructureKind): string {
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
    values[calibrationOverheadFieldId(kind as StrokeStructureKind)] = overhead.toFixed(1);
  }
  return values;
}

export function sameCalibrationFormValues(a: CalibrationFormValues, b: CalibrationFormValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? '') !== (b[key] ?? '')) return false;
  }
  return true;
}

export type ParseCalibrationFormResult =
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

function parseValue(raw: string | undefined): number | undefined {
  const text = (raw ?? '').trim();
  return DECIMAL.test(text) ? Number(text) : undefined;
}

/**
 * 編集した欄の値を保存値にする。空欄の任意の項目は項目ごと無くし、必須の欄が空、または
 * 数値でない・範囲の外の欄があれば、最初のその欄を返して保存値は作らない。
 */
export function parseCalibrationForm(values: CalibrationFormValues, measuredAtMs: number): ParseCalibrationFormResult {
  const rateRange = { min: CALIBRATION_ACTIONS_PER_SECOND_MIN, max: CALIBRATION_ACTIONS_PER_SECOND_MAX };
  const speedRange = { min: CALIBRATION_FINGER_SPEED_MIN, max: CALIBRATION_FINGER_SPEED_MAX };
  const overheadRange = { min: CALIBRATION_OVERHEAD_MS_MIN, max: CALIBRATION_OVERHEAD_MS_MAX };
  let failure: Extract<ParseCalibrationFormResult, { ok: false }> | undefined;

  /** 欄を読む。欄が空なら`undefined`、不正なら失敗を記録して`undefined`。 */
  const read = (fieldId: string, range: { min: number; max: number }, required: boolean): number | undefined => {
    const raw = values[fieldId];
    if ((raw ?? '').trim() === '') {
      if (required) failure ??= { ok: false, fieldId, problem: 'empty', ...range };
      return undefined;
    }
    const value = parseValue(raw);
    if (value === undefined || value < range.min || value > range.max) {
      failure ??= { ok: false, fieldId, problem: 'invalid', ...range };
      return undefined;
    }
    return value;
  };

  const actionsPerSecond = read(ACTIONS_FIELD, rateRange, true);
  const sameHand = read(CALIBRATION_SAME_HAND_FIELD, rateRange, true);
  const fallback = read(CALIBRATION_FALLBACK_FINGER_FIELD, speedRange, true);

  const byDirection: Partial<Record<HandDirection, number>> = {};
  for (const direction of ['L→R', 'R→L'] as const) {
    const speed = read(calibrationItemId({ kind: 'direction', direction }), rateRange, false);
    if (speed !== undefined) byDirection[direction] = speed;
  }
  const overheads: Partial<Record<StrokeStructureKind, number>> = {};
  for (const kind of STROKE_STRUCTURE_KINDS) {
    const overhead = read(calibrationOverheadFieldId(kind), overheadRange, false);
    if (overhead !== undefined) overheads[kind] = overhead;
  }
  const byPair: Record<string, number> = {};
  const directed: Record<string, number> = {};
  const fingers: Partial<Record<Finger, number>> = {};
  for (const fieldId of Object.keys(values)) {
    const [kind, ...rest] = fieldId.split(':');
    const name = rest.join(':');
    if (kind === 'same-hand-pair') {
      const speed = read(fieldId, rateRange, false);
      if (speed !== undefined) byPair[name] = speed;
    } else if (kind === 'directed-pair') {
      const speed = read(fieldId, rateRange, false);
      if (speed !== undefined) directed[name] = speed;
    } else if (kind === 'finger' && ALL_FINGERS.includes(name as Finger)) {
      const speed = read(fieldId, speedRange, false);
      if (speed !== undefined) fingers[name as Finger] = speed;
    }
  }

  if (failure !== undefined) return failure;
  if (actionsPerSecond === undefined || sameHand === undefined || fallback === undefined) {
    return { ok: false, fieldId: ACTIONS_FIELD, problem: 'empty', ...rateRange };
  }
  const calibration: PlaybackCalibration = {
    actionsPerSecond,
    ...(Object.keys(byDirection).length === 0 ? {} : { actionsPerSecondByDirection: byDirection }),
    sameHandDifferentFingerActionsPerSecond: sameHand,
    sameHandDifferentFingerActionsPerSecondByPair: byPair,
    ...(Object.keys(directed).length === 0 ? {} : { sameHandDifferentFingerActionsPerDirectedPair: directed }),
    fingerSpeedUnitsPerSecond: fingers,
    fallbackFingerSpeedUnitsPerSecond: fallback,
    ...(Object.keys(overheads).length === 0 ? {} : { keystrokeOverheadMs: overheads }),
    measuredAt: measuredAtMs,
  };
  // 組のキーが指の組として成り立たない欄などは、保存値の検証で落とす。
  if (playbackCalibrationProblem(calibration) !== undefined) {
    return { ok: false, fieldId: ACTIONS_FIELD, problem: 'invalid', ...rateRange };
  }
  return { ok: true, calibration };
}
