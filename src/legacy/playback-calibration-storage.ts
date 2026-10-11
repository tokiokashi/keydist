import { isPlaybackCalibration, type PlaybackCalibration } from '#interpretation/timing/calibration.ts';

/**
 * 旧画面が個人速度を保存する先。新しい画面の資産（`keydist:personal-speed`）とは別のキーと形で、
 * 互いの値を読まない。旧画面と一緒に消える。
 */
export interface CalibrationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PLAYBACK_CALIBRATION_STORAGE_KEY = 'keydist.playback-calibration.v3';

export function loadPlaybackCalibration(storage?: CalibrationStorage): PlaybackCalibration | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(PLAYBACK_CALIBRATION_STORAGE_KEY);
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    return isPlaybackCalibration(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function savePlaybackCalibration(storage: CalibrationStorage, calibration: PlaybackCalibration): void {
  storage.setItem(PLAYBACK_CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
}

export function clearPlaybackCalibration(storage: CalibrationStorage): void {
  storage.removeItem(PLAYBACK_CALIBRATION_STORAGE_KEY);
}
