import { ALL_FINGERS, type Finger } from '#input/shapes/geometry.ts';
import {
  CALIBRATION_OVERHEAD_MS_MAX,
  CALIBRATION_OVERHEAD_MS_MIN,
  OVERHEAD_KINDS,
  SIMULTANEOUS_KINDS,
  CALIBRATION_ACTIONS_PER_SECOND_MAX,
  CALIBRATION_ACTIONS_PER_SECOND_MIN,
  CALIBRATION_MOVE_MS_PER_UNIT_MAX,
  CALIBRATION_MOVE_MS_PER_UNIT_MIN,
  playbackCalibrationProblem,
  withoutOrphanedSentenceSimultaneous,
  type HandDirection,
  type PlaybackCalibration,
  type OverheadKind,
  type SimultaneousKind,
} from './calibration.ts';
import { calibrationItemId } from './calibration-session.ts';

/**
 * 保存した個人速度を数値として編集する欄の値。欄は識別子で指し、値は入力欄の文字列で持つ。
 * 測る項目の欄の識別子は`calibrationItemId`と同じ（指ごとの`r(f)`の欄は`finger-repeat:`、`m(f)`の欄は`finger:`）。
 * 次の4つは測る項目に対応しない代表値の欄。
 * 同じキーを続けて打つ時間は、画面ではほかの欄と同じアクション/秒（`1000 / r`）で編集し、保存はミリ秒で持つ。
 */
export const CALIBRATION_SAME_HAND_FIELD = 'same-hand';
export const CALIBRATION_FALLBACK_REPEAT_FIELD = 'fallback-repeat';
export const CALIBRATION_FALLBACK_MOVE_FIELD = 'fallback-move';
const ACTIONS_FIELD = 'actions';

/** 指ごとの`r(f)`の欄の識別子。 */
export function calibrationFingerRepeatFieldId(finger: Finger): string {
  return calibrationItemId({ kind: 'finger-repeat', finger });
}

/** 差の種類ごとの打鍵の上乗せの欄の識別子。 */
export function calibrationOverheadFieldId(kind: OverheadKind): string {
  return `overhead:${kind}`;
}

/** 同時押しの上乗せの欄の識別子。`calibrationItemId`の同時押しの項目と同じ。 */
export function calibrationSimultaneousFieldId(kind: SimultaneousKind): string {
  return `simultaneous:${kind}`;
}

export type CalibrationFormValues = Readonly<Record<string, string>>;

function formatted(value: number): string {
  return value.toFixed(2);
}

function moveFormatted(value: number): string {
  return value.toFixed(1);
}

/** 保存値を、編集する欄の値にする。持たない項目の欄は含めない。 */
export function calibrationFormValues(calibration: PlaybackCalibration): CalibrationFormValues {
  const values: Record<string, string> = {
    [ACTIONS_FIELD]: formatted(calibration.actionsPerSecond),
    [CALIBRATION_SAME_HAND_FIELD]: formatted(calibration.sameHandDifferentFingerActionsPerSecond),
    [CALIBRATION_FALLBACK_REPEAT_FIELD]: formatted(1000 / calibration.fallbackRepeatMs),
    [CALIBRATION_FALLBACK_MOVE_FIELD]: moveFormatted(calibration.fallbackMoveMsPerUnit),
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
  for (const [finger, repeatMs] of Object.entries(calibration.fingerRepeatMs)) {
    values[calibrationFingerRepeatFieldId(finger as Finger)] = formatted(1000 / repeatMs);
  }
  for (const [finger, moveMs] of Object.entries(calibration.fingerMoveMsPerUnit)) {
    values[calibrationItemId({ kind: 'finger', finger: finger as Finger })] = moveFormatted(moveMs);
  }
  for (const [kind, overhead] of Object.entries(calibration.keystrokeOverheadMs ?? {})) {
    values[calibrationOverheadFieldId(kind as OverheadKind)] = overhead.toFixed(1);
  }
  for (const [kind, overhead] of Object.entries(calibration.simultaneousOverheadMs ?? {})) {
    values[calibrationSimultaneousFieldId(kind as SimultaneousKind)] = overhead.toFixed(1);
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
/** 負の値を取れる欄は、先頭のマイナス記号（半角のハイフンマイナス、全角のマイナス）を受け付ける。 */
const SIGNED_DECIMAL = /^[-−]?(\d+\.?\d*|\.\d+)$/;

function parseValue(raw: string, range: { readonly min: number }): number | undefined {
  const text = raw.trim();
  if (range.min >= 0) return DECIMAL.test(text) ? Number(text) : undefined;
  return SIGNED_DECIMAL.test(text) ? Number(text.replace('−', '-')) : undefined;
}

const RATE_RANGE = { min: CALIBRATION_ACTIONS_PER_SECOND_MIN, max: CALIBRATION_ACTIONS_PER_SECOND_MAX };
const MOVE_RANGE = { min: CALIBRATION_MOVE_MS_PER_UNIT_MIN, max: CALIBRATION_MOVE_MS_PER_UNIT_MAX };
const OVERHEAD_RANGE = { min: CALIBRATION_OVERHEAD_MS_MIN, max: CALIBRATION_OVERHEAD_MS_MAX };

/** 欄の値の範囲と、空にできるか。保存値の欄でなければ`undefined`。 */
function fieldSpec(fieldId: string): { range: { min: number; max: number }; required: boolean } | undefined {
  if (fieldId === ACTIONS_FIELD || fieldId === CALIBRATION_SAME_HAND_FIELD) return { range: RATE_RANGE, required: true };
  if (fieldId === CALIBRATION_FALLBACK_REPEAT_FIELD) return { range: RATE_RANGE, required: true };
  if (fieldId === CALIBRATION_FALLBACK_MOVE_FIELD) return { range: MOVE_RANGE, required: true };
  const [kind, ...rest] = fieldId.split(':');
  const name = rest.join(':');
  if (kind === 'overhead' && (OVERHEAD_KINDS as readonly string[]).includes(name)) return { range: OVERHEAD_RANGE, required: false };
  if (kind === 'simultaneous' && (SIMULTANEOUS_KINDS as readonly string[]).includes(name)) return { range: OVERHEAD_RANGE, required: false };
  if (kind === 'direction' && (name === 'L→R' || name === 'R→L')) return { range: RATE_RANGE, required: false };
  if (kind === 'same-hand-pair' || kind === 'directed-pair') return { range: RATE_RANGE, required: false };
  if (kind === 'finger-repeat' && ALL_FINGERS.includes(name as Finger)) return { range: RATE_RANGE, required: false };
  if (kind === 'finger' && ALL_FINGERS.includes(name as Finger)) return { range: MOVE_RANGE, required: false };
  return undefined;
}

/**
 * 指の`r(f)`か`m(f)`を入れ替える。2つで1組の値なので、片方しか無い指にはもう片方の代表値を入れて1組にし、
 * 空欄にした時は2つとも無くす。`value`は欄の値（`r(f)`の欄はアクション/秒）。
 */
function setFingerPair(next: Record<string, unknown>, finger: Finger, which: 'repeat' | 'move', value: number | undefined): void {
  const repeat = { ...(next.fingerRepeatMs as Partial<Record<Finger, number>>) };
  const move = { ...(next.fingerMoveMsPerUnit as Partial<Record<Finger, number>>) };
  if (value === undefined) {
    delete repeat[finger];
    delete move[finger];
  } else if (which === 'repeat') {
    repeat[finger] = 1000 / value;
    move[finger] ??= next.fallbackMoveMsPerUnit as number;
  } else {
    move[finger] = value;
    repeat[finger] ??= next.fallbackRepeatMs as number;
  }
  next.fingerRepeatMs = repeat;
  next.fingerMoveMsPerUnit = move;
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
  else if (fieldId === CALIBRATION_FALLBACK_REPEAT_FIELD) {
    if (value !== undefined) next.fallbackRepeatMs = 1000 / value;
  } else if (fieldId === CALIBRATION_FALLBACK_MOVE_FIELD) setScalar('fallbackMoveMsPerUnit');
  else if (kind === 'direction') setEntry('actionsPerSecondByDirection', true);
  else if (kind === 'directed-pair') setEntry('sameHandDifferentFingerActionsPerDirectedPair', true);
  else if (kind === 'overhead') setEntry('keystrokeOverheadMs', true);
  else if (kind === 'simultaneous') setEntry('simultaneousOverheadMs', true);
  else if (kind === 'same-hand-pair') setEntry('sameHandDifferentFingerActionsPerSecondByPair', false);
  else setFingerPair(next, name as Finger, kind === 'finger-repeat' ? 'repeat' : 'move', value);
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
    value = parseValue(raw, range);
    if (value === undefined || value < range.min || value > range.max) return { ok: false, fieldId, problem: 'invalid', ...range };
  }
  const calibration = withoutOrphanedSentenceSimultaneous({ ...withField(base, fieldId, value), measuredAt: measuredAtMs });
  // 組のキーが指の組として成り立たない欄などは、保存値の検証で落とす。
  if (playbackCalibrationProblem(calibration) !== undefined) return { ok: false, fieldId, problem: 'invalid', ...range };
  return { ok: true, calibration };
}
