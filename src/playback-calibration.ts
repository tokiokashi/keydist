import {
  ADJACENT_PAIRS,
  ALL_FINGERS,
  FINGERS,
  HOME_ROW,
  dist,
  type Finger,
  type Geometry,
  type Key,
} from './geometry.ts';

/** 再生へ反映する個人の打鍵・指移動速度。 */
export interface PlaybackCalibration {
  /** 通常の連続打鍵速度。 */
  actionsPerSecond: number;
  /** 異手の方向別連続打鍵速度。旧保存値では省略される。 */
  actionsPerSecondByDirection?: Readonly<Partial<Record<HandDirection, number>>>;
  /** 同じ手の別の指へ移る連続打鍵速度。 */
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

export interface CalibrationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CalibrationKeyPair {
  finger: Finger;
  fromKey: string;
  toKey: string;
  distance: number;
}

export const PLAYBACK_CALIBRATION_STORAGE_KEY = 'keydist.playback-calibration.v3';
const LEGACY_PLAYBACK_CALIBRATION_STORAGE_KEY = 'keydist.playback-calibration.v2';
export const CALIBRATION_ACTIONS_PER_SECOND_MIN = 0.1;
export const CALIBRATION_ACTIONS_PER_SECOND_MAX = 20;
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

function validCalibration(value: unknown): value is PlaybackCalibration {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PlaybackCalibration>;
  const fingerSpeeds = candidate.fingerSpeedUnitsPerSecond;
  const sameHandSpeed = candidate.sameHandDifferentFingerActionsPerSecond ?? candidate.actionsPerSecond;
  const sameHandPairSpeeds = candidate.sameHandDifferentFingerActionsPerSecondByPair;
  const directionalSpeeds = candidate.actionsPerSecondByDirection;
  const directedPairSpeeds = candidate.sameHandDifferentFingerActionsPerDirectedPair;
  const validFingerSpeeds = fingerSpeeds !== null
    && typeof fingerSpeeds === 'object'
    && !Array.isArray(fingerSpeeds)
    && Object.entries(fingerSpeeds).every(([finger, speed]) =>
      ALL_FINGERS.includes(finger as Finger)
      && Number.isFinite(speed)
      && speed >= CALIBRATION_FINGER_SPEED_MIN
      && speed <= CALIBRATION_FINGER_SPEED_MAX,
    );
  const validSameHandPairSpeeds = sameHandPairSpeeds === undefined
    || (sameHandPairSpeeds !== null
      && typeof sameHandPairSpeeds === 'object'
      && !Array.isArray(sameHandPairSpeeds)
      && Object.entries(sameHandPairSpeeds).every(([pair, speed]) => {
        const [first, second] = pair.split(':');
        return sameHandFingerPairKey(first as Finger, second as Finger) === pair
          && Number.isFinite(speed)
          && speed >= CALIBRATION_ACTIONS_PER_SECOND_MIN
          && speed <= CALIBRATION_ACTIONS_PER_SECOND_MAX;
      }));
  const validDirectionalSpeeds = directionalSpeeds === undefined
    || (directionalSpeeds !== null
      && typeof directionalSpeeds === 'object'
      && !Array.isArray(directionalSpeeds)
      && Object.entries(directionalSpeeds).every(([direction, speed]) =>
        (direction === 'L→R' || direction === 'R→L')
        && Number.isFinite(speed)
        && speed >= CALIBRATION_ACTIONS_PER_SECOND_MIN
        && speed <= CALIBRATION_ACTIONS_PER_SECOND_MAX,
      ));
  const validDirectedPairSpeeds = directedPairSpeeds === undefined
    || (directedPairSpeeds !== null
      && typeof directedPairSpeeds === 'object'
      && !Array.isArray(directedPairSpeeds)
      && Object.entries(directedPairSpeeds).every(([pair, speed]) => {
        const [from, to] = pair.split('>');
        return sameHandDirectedFingerPairKey(from as Finger, to as Finger) === pair
          && Number.isFinite(speed)
          && speed >= CALIBRATION_ACTIONS_PER_SECOND_MIN
          && speed <= CALIBRATION_ACTIONS_PER_SECOND_MAX;
      }));
  return Number.isFinite(candidate.actionsPerSecond)
    && candidate.actionsPerSecond! >= CALIBRATION_ACTIONS_PER_SECOND_MIN
    && candidate.actionsPerSecond! <= CALIBRATION_ACTIONS_PER_SECOND_MAX
    && Number.isFinite(sameHandSpeed)
    && sameHandSpeed! >= CALIBRATION_ACTIONS_PER_SECOND_MIN
    && sameHandSpeed! <= CALIBRATION_ACTIONS_PER_SECOND_MAX
    && validSameHandPairSpeeds
    && validDirectionalSpeeds
    && validDirectedPairSpeeds
    && validFingerSpeeds
    && Number.isFinite(candidate.fallbackFingerSpeedUnitsPerSecond)
    && candidate.fallbackFingerSpeedUnitsPerSecond! >= CALIBRATION_FINGER_SPEED_MIN
    && candidate.fallbackFingerSpeedUnitsPerSecond! <= CALIBRATION_FINGER_SPEED_MAX
    && Number.isFinite(candidate.measuredAt);
}

export function loadPlaybackCalibration(storage?: CalibrationStorage): PlaybackCalibration | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(PLAYBACK_CALIBRATION_STORAGE_KEY)
      ?? storage.getItem(LEGACY_PLAYBACK_CALIBRATION_STORAGE_KEY);
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!validCalibration(value)) return undefined;
    return {
      ...value,
      // v2で保存された旧値は通常速度を同手・別指速度の初期値にする。
      sameHandDifferentFingerActionsPerSecond:
        value.sameHandDifferentFingerActionsPerSecond ?? value.actionsPerSecond,
      sameHandDifferentFingerActionsPerSecondByPair:
        value.sameHandDifferentFingerActionsPerSecondByPair ?? {},
    };
  } catch {
    return undefined;
  }
}

export function savePlaybackCalibration(
  storage: CalibrationStorage,
  calibration: PlaybackCalibration,
): void {
  storage.setItem(PLAYBACK_CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
}

const CALIBRATION_KEY_LABEL_PATTERN = /\p{L}|\p{P}/u;

/** 選択中の配列で文字・ピリオド・コンマが刻印された物理キーだけを候補にする。 */
export function calibrationEligibleKeyIds(
  geometry: Geometry,
  legends?: ReadonlyMap<string, string>,
): ReadonlySet<string> {
  if (!legends) return new Set(geometry.keys.keys());
  return new Set(
    [...geometry.keys.keys()].filter((keyId) => {
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

/** アルペジオ用の同手・隣接指の片方向キー組を、往復分作る。 */
export function calibrationAdjacentSameHandPairs(
  geometry: Geometry,
  eligibleKeyIds = calibrationEligibleKeyIds(geometry),
): [string, string][] {
  const pairs: [string, string][] = [];
  for (const [firstFinger, secondFinger] of ADJACENT_PAIRS) {
    const first = geometry.assignment.homeKey[firstFinger];
    const second = geometry.assignment.homeKey[secondFinger];
    if (!first || !second || first === second
      || !eligibleKeyIds.has(first) || !eligibleKeyIds.has(second)) continue;
    pairs.push([first, second], [second, first]);
  }
  return pairs;
}

export function calibrationKeyMatches(event: KeyboardEvent, keyId: string, keyLabel = keyId): boolean {
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
