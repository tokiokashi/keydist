import { FINGERS, dist, type Finger, type Geometry, type Key } from './geometry.ts';

/** 再生へ反映する個人の打鍵・指移動速度。 */
export interface PlaybackCalibration {
  /** 通常の連続打鍵速度。 */
  actionsPerSecond: number;
  /** 同指連続の移動速度。単位は物理キーのu/秒。 */
  fingerSpeedUnitsPerSecond: number;
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

export const PLAYBACK_CALIBRATION_STORAGE_KEY = 'keydist.playback-calibration.v1';
export const CALIBRATION_ACTIONS_PER_SECOND_MIN = 0.1;
export const CALIBRATION_ACTIONS_PER_SECOND_MAX = 20;
export const CALIBRATION_FINGER_SPEED_MIN = 0.1;
export const CALIBRATION_FINGER_SPEED_MAX = 100;
export const CALIBRATION_ACTION_SAMPLES = 9;
export const CALIBRATION_FINGER_SAMPLES = 6;

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
  distance: number;
  durationMs: number;
}

export function fingerSpeedFromSamples(samples: readonly FingerSpeedSample[]): number | undefined {
  const speeds = samples
    .filter((sample) => Number.isFinite(sample.distance) && sample.distance > 0)
    .map((sample) => sample.distance / (sample.durationMs / 1000));
  return median(speeds);
}

function validCalibration(value: unknown): value is PlaybackCalibration {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PlaybackCalibration>;
  return Number.isFinite(candidate.actionsPerSecond)
    && candidate.actionsPerSecond! >= CALIBRATION_ACTIONS_PER_SECOND_MIN
    && candidate.actionsPerSecond! <= CALIBRATION_ACTIONS_PER_SECOND_MAX
    && Number.isFinite(candidate.fingerSpeedUnitsPerSecond)
    && candidate.fingerSpeedUnitsPerSecond! >= CALIBRATION_FINGER_SPEED_MIN
    && candidate.fingerSpeedUnitsPerSecond! <= CALIBRATION_FINGER_SPEED_MAX
    && Number.isFinite(candidate.measuredAt);
}

export function loadPlaybackCalibration(storage?: CalibrationStorage): PlaybackCalibration | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(PLAYBACK_CALIBRATION_STORAGE_KEY);
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    return validCalibration(value) ? value : undefined;
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

function farthestKeyFromHome(geometry: Geometry, finger: typeof FINGERS[number], home: Key): Key | undefined {
  return [...geometry.keys.values()]
    .filter((key) => key.finger === finger && key.id !== home.id)
    .sort((a, b) => dist(home, b) - dist(home, a))[0];
}

/** 各指のホームと、ホームから最も離れた同じ指のキーを測定用の組にする。 */
export function calibrationKeyPairs(geometry: Geometry): CalibrationKeyPair[] {
  const pairs: CalibrationKeyPair[] = [];
  for (const finger of FINGERS) {
    const homeId = geometry.assignment.homeKey[finger];
    const home = geometry.keys.get(homeId);
    if (!home) continue;
    const target = farthestKeyFromHome(geometry, finger, home);
    if (!target) continue;
    const distance = dist(home, target);
    if (distance <= 0) continue;
    pairs.push({ finger, fromKey: home.id, toKey: target.id, distance });
  }
  return pairs;
}

/** 通常の打鍵速度の測定に使う、左右人差し指のホームキー。 */
export function calibrationActionPair(geometry: Geometry): [string, string] | undefined {
  const left = geometry.assignment.homeKey.LI;
  const right = geometry.assignment.homeKey.RI;
  return left && right && left !== right ? [left, right] : undefined;
}

export function calibrationKeyMatches(event: KeyboardEvent, keyId: string): boolean {
  const eventKey = event.key.toLowerCase();
  if (eventKey === keyId.toLowerCase()) return true;

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
