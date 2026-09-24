import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAnalyzerCalibrationModel,
} from '../src/analyzer-calibration-model.ts';
import {
  PLAYBACK_CALIBRATION_STORAGE_KEY,
  type PlaybackCalibration,
} from '../src/playback-calibration.ts';

test('calibration model edits, saves, and discards without DOM ownership', () => {
  const stored = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return stored.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      stored.set(key, value);
    },
    removeItem(key: string) {
      stored.delete(key);
    },
  };

  let calibration: PlaybackCalibration | undefined = {
    actionsPerSecond: 5,
    actionsPerSecondByDirection: { 'L→R': 5.5, 'R→L': 4.5 },
    sameHandDifferentFingerActionsPerSecond: 4,
    sameHandDifferentFingerActionsPerSecondByPair: { 'LM:LI': 3.5 },
    sameHandDifferentFingerActionsPerDirectedPair: { 'LM>LI': 3.2 },
    fingerSpeedUnitsPerSecond: { LI: 8 },
    fallbackFingerSpeedUnitsPerSecond: 7,
    measuredAt: 1,
  };
  let playbackCalibration = calibration;
  let useCalibration = false;

  const model = createAnalyzerCalibrationModel({
    storage,
    getUiState() {
      throw new Error('geometry state is not needed by this test');
    },
    updatePlaybackSetting(key, value) {
      if (key === 'useCalibration') useCalibration = value as boolean;
    },
    getPlaybackGeometry: () => undefined,
    getGeometrySettings() {
      throw new Error('geometry settings are not needed by this test');
    },
    getPlaybackLayout: () => undefined,
    getCalibration: () => calibration,
    setCalibration(value) {
      calibration = value;
    },
    setPlaybackCalibration(value) {
      playbackCalibration = value;
    },
  });

  assert.equal(model.open(true), true);
  assert.equal(model.getSnapshot().showingResult, true);
  assert.equal(model.getSnapshot().values.actions, '5.00');
  assert.equal(model.getSnapshot().values.directions['L→R'], '5.50');

  model.setBaseValue('actions', '6.25');
  model.setDirection('L→R', '6.50');
  model.setFinger('LI', '9.25');
  assert.equal(model.save(), true);

  assert.equal(calibration?.actionsPerSecond, 6.25);
  assert.equal(calibration?.actionsPerSecondByDirection?.['L→R'], 6.5);
  assert.equal(calibration?.fingerSpeedUnitsPerSecond.LI, 9.25);
  assert.equal(playbackCalibration?.actionsPerSecond, 6.25);
  assert.equal(useCalibration, true);
  assert.ok(stored.has(PLAYBACK_CALIBRATION_STORAGE_KEY));

  assert.equal(model.discard(), true);
  assert.equal(calibration, undefined);
  assert.equal(playbackCalibration, undefined);
  assert.equal(useCalibration, false);
  assert.equal(stored.has(PLAYBACK_CALIBRATION_STORAGE_KEY), false);
});
