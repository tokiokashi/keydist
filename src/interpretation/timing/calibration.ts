import { isRecord } from '#input/codec/index.ts';
import {
  ALL_FINGERS,
  FINGERS,
  HOME_ROW,
  dist,
  type Finger,
  type Geometry,
  type Key,
} from '#input/shapes/geometry.ts';

/** 再生へ反映する個人の打鍵・指移動速度。 */
export interface PlaybackCalibration {
  /** 通常の連続打鍵速度。 */
  actionsPerSecond: number;
  /** 異手の方向別連続打鍵速度。測っていない方向は持たない。 */
  actionsPerSecondByDirection?: Readonly<Partial<Record<HandDirection, number>>>;
  /** 同じ手の別の指へ移る連続打鍵速度の代表値。 */
  sameHandDifferentFingerActionsPerSecond: number;
  /** 同じ手の別指の組ごとの測定速度。キーは正規化した指ペア（例: `LM:LI`）。 */
  sameHandDifferentFingerActionsPerSecondByPair: Readonly<Record<string, number>>;
  /** 同じ手の別指の方向別測定速度。キーは `LM>LI` 形式。 */
  sameHandDifferentFingerActionsPerDirectedPair?: Readonly<Record<string, number>>;
  /** 同指連続の指ごとの移動速度。測れなかった指は持たない。 */
  fingerSpeedUnitsPerSecond: Partial<Record<Finger, number>>;
  /** 指ごとの速度が無い場合に使う移動速度。単位は物理キーのu/秒。 */
  fallbackFingerSpeedUnitsPerSecond: number;
  measuredAt: number;
}

export interface CalibrationKeyPair {
  finger: Finger;
  fromKey: string;
  toKey: string;
  distance: number;
}

export const CALIBRATION_ACTIONS_PER_SECOND_MIN = 0.1;
export const CALIBRATION_ACTIONS_PER_SECOND_MAX = 40;
export const CALIBRATION_FINGER_SPEED_MIN = 0.1;
export const CALIBRATION_FINGER_SPEED_MAX = 100;
export const CALIBRATION_ACTION_SAMPLES = 9;
export const CALIBRATION_FINGER_SAMPLES = 6;
export const CALIBRATION_SAME_HAND_SAMPLES = 6;

export type HandDirection = 'L→R' | 'R→L';

function positiveFiniteValues(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value) && value > 0);
}

/** 外れ値の影響を抑えるための中央値。 */
export function median(values: readonly number[]): number | undefined {
  const sorted = positiveFiniteValues(values).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function actionsPerSecondFromIntervals(intervalsMs: readonly number[]): number | undefined {
  const typicalMs = median(intervalsMs);
  return typicalMs === undefined ? undefined : 1000 / typicalMs;
}

export interface FingerSpeedSample {
  finger: Finger;
  distance: number;
  durationMs: number;
}

function speedFromSample(sample: FingerSpeedSample): number | undefined {
  if (!Number.isFinite(sample.distance) || sample.distance <= 0) return undefined;
  if (!Number.isFinite(sample.durationMs) || sample.durationMs <= 0) return undefined;
  return sample.distance / (sample.durationMs / 1000);
}

/** 指ごとに中央値を取り、指ごとの速度を残す。 */
export function fingerSpeedFromSamples(
  samples: readonly FingerSpeedSample[],
): ReadonlyMap<Finger, number> {
  const grouped = new Map<Finger, number[]>();
  for (const sample of samples) {
    const speed = speedFromSample(sample);
    if (speed === undefined) continue;
    const values = grouped.get(sample.finger) ?? [];
    values.push(speed);
    grouped.set(sample.finger, values);
  }
  const speeds = new Map<Finger, number>();
  for (const [finger, values] of grouped) {
    const value = median(values);
    if (value !== undefined) speeds.set(finger, value);
  }
  return speeds;
}

/** 測定できなかった指へ適用する全サンプルの中央値。 */
export function fallbackFingerSpeedFromSamples(
  samples: readonly FingerSpeedSample[],
): number | undefined {
  return median(samples.map(speedFromSample).filter((value): value is number => value !== undefined));
}

/** 同じ手の別指を識別する、順序に依存しないキーを返す。 */
export function sameHandFingerPairKey(first: Finger, second: Finger): string | undefined {
  if (first === second || first[0] !== second[0]) return undefined;
  if (!FINGERS.includes(first as typeof FINGERS[number])
    || !FINGERS.includes(second as typeof FINGERS[number])) return undefined;
  const ordered = [first, second].sort((a, b) =>
    FINGERS.indexOf(a as typeof FINGERS[number]) - FINGERS.indexOf(b as typeof FINGERS[number]),
  );
  return `${ordered[0]}:${ordered[1]}`;
}

/** 異手の方向を、保存キーに使える記号へ正規化する。 */
export function handDirection(first: Finger, second: Finger): HandDirection | undefined {
  if (first[0] === second[0]) return undefined;
  return first[0] === 'L' ? 'L→R' : 'R→L';
}

/** 同手別指の順序を残した保存キーを返す。 */
export function sameHandDirectedFingerPairKey(from: Finger, to: Finger): string | undefined {
  if (from === to || from[0] !== to[0]) return undefined;
  if (!FINGERS.includes(from as typeof FINGERS[number])
    || !FINGERS.includes(to as typeof FINGERS[number])) return undefined;
  return `${from}>${to}`;
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isRateRecord(value: unknown, keyValid: (key: string) => boolean, min: number, max: number): boolean {
  return isRecord(value)
    && Object.entries(value).every(([key, speed]) => keyValid(key) && inRange(speed, min, max));
}

function isSameHandPairKey(key: string): boolean {
  const parts = key.split(':');
  return parts.length === 2 && sameHandFingerPairKey(parts[0] as Finger, parts[1] as Finger) === key;
}

function isDirectedPairKey(key: string): boolean {
  const parts = key.split('>');
  return parts.length === 2 && sameHandDirectedFingerPairKey(parts[0] as Finger, parts[1] as Finger) === key;
}

/**
 * 個人速度として保存できない理由。保存できる値なら `undefined`。
 * 必須の項目が欠けた値、範囲を外れた値、知らない指や組のキーを持つ値を保存できない値とする。
 */
export function playbackCalibrationProblem(value: unknown): string | undefined {
  if (!isRecord(value)) return '個人速度の形が正しくありません';
  const rateOk = (speed: unknown) => inRange(speed, CALIBRATION_ACTIONS_PER_SECOND_MIN, CALIBRATION_ACTIONS_PER_SECOND_MAX);
  const fingerSpeedOk = (speed: unknown) => inRange(speed, CALIBRATION_FINGER_SPEED_MIN, CALIBRATION_FINGER_SPEED_MAX);
  if (!rateOk(value.actionsPerSecond)) return '通常の打鍵速度が範囲外です';
  if (!rateOk(value.sameHandDifferentFingerActionsPerSecond)) return '同手・別指の代表の速度が範囲外です';
  if (!fingerSpeedOk(value.fallbackFingerSpeedUnitsPerSecond)) return '測定できなかった指の移動速度が範囲外です';
  if (typeof value.measuredAt !== 'number' || !Number.isFinite(value.measuredAt)) return '測定した時刻が正しくありません';
  if (!isRateRecord(
    value.sameHandDifferentFingerActionsPerSecondByPair,
    isSameHandPairKey,
    CALIBRATION_ACTIONS_PER_SECOND_MIN,
    CALIBRATION_ACTIONS_PER_SECOND_MAX,
  )) return '同手・別指の組ごとの速度が正しくありません';
  if (!isRateRecord(
    value.fingerSpeedUnitsPerSecond,
    (finger) => ALL_FINGERS.includes(finger as Finger),
    CALIBRATION_FINGER_SPEED_MIN,
    CALIBRATION_FINGER_SPEED_MAX,
  )) return '指ごとの移動速度が正しくありません';
  if (value.actionsPerSecondByDirection !== undefined && !isRateRecord(
    value.actionsPerSecondByDirection,
    (direction) => direction === 'L→R' || direction === 'R→L',
    CALIBRATION_ACTIONS_PER_SECOND_MIN,
    CALIBRATION_ACTIONS_PER_SECOND_MAX,
  )) return '異手の方向別の速度が正しくありません';
  if (value.sameHandDifferentFingerActionsPerDirectedPair !== undefined && !isRateRecord(
    value.sameHandDifferentFingerActionsPerDirectedPair,
    isDirectedPairKey,
    CALIBRATION_ACTIONS_PER_SECOND_MIN,
    CALIBRATION_ACTIONS_PER_SECOND_MAX,
  )) return '同手・別指の方向別の速度が正しくありません';
  return undefined;
}

export function isPlaybackCalibration(value: unknown): value is PlaybackCalibration {
  return playbackCalibrationProblem(value) === undefined;
}

const CALIBRATION_KEY_LABEL_PATTERN = /\p{L}|\p{P}/u;

/** 選択中の配列で文字・ピリオド・コンマが刻印された物理キーだけを候補にする。 */
export function calibrationEligibleKeyIds(
  geometry: Geometry,
  legends?: ReadonlyMap<string, string>,
): ReadonlySet<string> {
  const gridKeyIds = new Set(geometry.grid.flat().map((key) => key.id));
  if (!legends) return gridKeyIds;
  return new Set(
    [...gridKeyIds].filter((keyId) => {
      const label = legends.get(keyId);
      return label !== undefined && CALIBRATION_KEY_LABEL_PATTERN.test(label);
    }),
  );
}

/** 数字段を避け、全指でホーム段から下段のキーを選ぶ。 */
function farthestKeyFromHome(
  geometry: Geometry,
  finger: typeof FINGERS[number],
  home: Key,
  eligibleKeyIds: ReadonlySet<string>,
): Key | undefined {
  return [...geometry.keys.values()]
    .filter((key) => key.finger === finger
      && key.id !== home.id
      && key.row === HOME_ROW + 1
      && eligibleKeyIds.has(key.id))
    .sort((a, b) => dist(home, b) - dist(home, a))[0];
}

/** 各指のホームと、同じ指の下段キーを測定用の組にする。 */
export function calibrationKeyPairs(
  geometry: Geometry,
  eligibleKeyIds = calibrationEligibleKeyIds(geometry),
): CalibrationKeyPair[] {
  const pairs: CalibrationKeyPair[] = [];
  for (const finger of FINGERS) {
    const homeId = geometry.assignment.homeKey[finger];
    const home = geometry.keys.get(homeId);
    if (!home) continue;
    if (!eligibleKeyIds.has(home.id)) continue;
    const target = farthestKeyFromHome(geometry, finger, home, eligibleKeyIds);
    if (!target) continue;
    const distance = dist(home, target);
    if (distance <= 0) continue;
    pairs.push({ finger, fromKey: home.id, toKey: target.id, distance });
  }
  return pairs;
}

/** 通常の打鍵速度の測定に使う、左右人差し指のホームキー。 */
export function calibrationActionPair(
  geometry: Geometry,
  eligibleKeyIds = calibrationEligibleKeyIds(geometry),
): [string, string] | undefined {
  const left = geometry.assignment.homeKey.LI;
  const right = geometry.assignment.homeKey.RI;
  return left && right && left !== right && eligibleKeyIds.has(left) && eligibleKeyIds.has(right)
    ? [left, right]
    : undefined;
}

/** 同じ手の別指を交互に打つ測定用のホームキー組。候補キーだけで全組合せを作る。 */
export function calibrationSameHandPairs(
  geometry: Geometry,
  eligibleKeyIds = calibrationEligibleKeyIds(geometry),
): [string, string][] {
  const pairs: [string, string][] = [];
  for (const hand of ['L', 'R'] as const) {
    const fingers = FINGERS.filter((finger) => finger.startsWith(hand));
    for (let leftIndex = 0; leftIndex < fingers.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < fingers.length; rightIndex++) {
        const left = geometry.assignment.homeKey[fingers[leftIndex]];
        const right = geometry.assignment.homeKey[fingers[rightIndex]];
        if (left && right && left !== right && eligibleKeyIds.has(left) && eligibleKeyIds.has(right)) {
          pairs.push([left, right]);
        }
      }
    }
  }
  return pairs;
}

/** アルペジオ用の同手・別指の全方向キー組を作る。 */
export function calibrationDirectedSameHandPairs(
  geometry: Geometry,
  eligibleKeyIds = calibrationEligibleKeyIds(geometry),
): [string, string][] {
  const pairs: [string, string][] = [];
  for (const [first, second] of calibrationSameHandPairs(geometry, eligibleKeyIds)) {
    pairs.push([first, second], [second, first]);
  }
  return pairs;
}

export function calibrationKeyMatches(event: { readonly key: string; readonly code: string }, keyId: string, keyLabel = keyId): boolean {
  const eventKey = event.key.toLowerCase();
  if (eventKey === keyId.toLowerCase() || eventKey === keyLabel.toLowerCase()) return true;

  const codeToKey: Record<string, string> = {
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=',
  };
  const code = event.code;
  const physicalKey = code.startsWith('Key')
    ? code.slice(3).toLowerCase()
    : code.startsWith('Digit')
      ? code.slice(5)
      : codeToKey[code];
  return physicalKey !== undefined && physicalKey === keyId.toLowerCase();
}
