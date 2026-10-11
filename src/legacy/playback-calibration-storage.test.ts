import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlaybackCalibration } from '#interpretation/timing/calibration.ts';
import {
  clearPlaybackCalibration,
  loadPlaybackCalibration,
  PLAYBACK_CALIBRATION_STORAGE_KEY,
  savePlaybackCalibration,
} from './playback-calibration-storage.ts';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    storage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
    },
  };
}

const CALIBRATION: PlaybackCalibration = {
  actionsPerSecond: 40,
  sameHandDifferentFingerActionsPerSecond: 2.5,
  sameHandDifferentFingerActionsPerSecondByPair: { 'LP:LR': 2 },
  fingerSpeedUnitsPerSecond: { LI: 12 },
  fallbackFingerSpeedUnitsPerSecond: 12,
  measuredAt: 4,
};

test('旧画面の個人速度は保存して読み直せ、壊れたJSONや範囲外の値は無視する', () => {
  const { data, storage } = memoryStorage();
  savePlaybackCalibration(storage, CALIBRATION);
  assert.deepEqual(loadPlaybackCalibration(storage), CALIBRATION);
  data.set(PLAYBACK_CALIBRATION_STORAGE_KEY, '{broken');
  assert.equal(loadPlaybackCalibration(storage), undefined);
  data.set(PLAYBACK_CALIBRATION_STORAGE_KEY, JSON.stringify({ ...CALIBRATION, actionsPerSecond: 41 }));
  assert.equal(loadPlaybackCalibration(storage), undefined);
  assert.equal(loadPlaybackCalibration(undefined), undefined);
});

test('旧画面は新しい画面の保存先と、これより古い版の保存先を読まない', () => {
  const { data, storage } = memoryStorage();
  data.set('keydist.playback-calibration.v2', JSON.stringify(CALIBRATION));
  data.set('keydist:personal-speed', JSON.stringify({ version: 1, calibration: CALIBRATION }));
  assert.equal(loadPlaybackCalibration(storage), undefined);
});

test('旧画面の個人速度を破棄すると保存先が空になる', () => {
  const { data, storage } = memoryStorage();
  savePlaybackCalibration(storage, CALIBRATION);
  clearPlaybackCalibration(storage);
  assert.equal(data.size, 0);
});
