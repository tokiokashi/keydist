import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONDITION_DEFAULTS, createDefaultUiState } from '../src/ui-state.ts';
import { createAnalysisSessionStore } from '../src/features/analyzer-next/session-store.ts';

function store() {
  const ui = createDefaultUiState({
    textPanelOpen: true,
    usePlaybackCalibration: false,
    selectedLayouts: { en: ['qwerty'], ja: ['qwerty', 'naginata-v18'] },
  });
  const {
    playbackRateAverage,
    playbackRateWindow,
    playbackRateHalfLifeSeconds,
    ...distanceDefaults
  } = DEFAULT_CONDITION_DEFAULTS;
  return createAnalysisSessionStore({
    mode: 'ja',
    text: 'かな',
    selectedLayoutIds: ['qwerty', 'naginata-v18'],
    focusLayoutId: 'qwerty',
    distance: { defaults: distanceDefaults, perLayout: {} },
    timing: {
      defaults: {
        playbackRateAverage,
        playbackRateWindow,
        playbackRateHalfLifeSeconds,
        stepsPerSecond: ui.ui.playback.stepsPerSecond,
        speedMultiplier: ui.ui.playback.speedMultiplier,
        sameFingerDelay: ui.ui.playback.sameFingerDelay,
        allFingerMovementDelay: ui.ui.playback.allFingerMovementDelay,
        useCalibration: ui.ui.playback.useCalibration,
      },
      perLayout: {},
    },
  });
}

test('target, distance, timing and focus revisions are independent', () => {
  const value = store();
  value.setFocus('naginata-v18');
  assert.deepEqual(value.getSnapshot().revisions, {
    target: 0, distance: 0, timing: 0, focus: 1,
  });

  value.setTimingDefault('speedMultiplier', 1.25);
  assert.deepEqual(value.getSnapshot().revisions, {
    target: 0, distance: 0, timing: 1, focus: 1,
  });

  value.setDistanceDefault('windowSize', 3);
  assert.deepEqual(value.getSnapshot().revisions, {
    target: 0, distance: 1, timing: 1, focus: 1,
  });

  value.setText('別の本文');
  assert.deepEqual(value.getSnapshot().revisions, {
    target: 1, distance: 1, timing: 1, focus: 1,
  });
});

test('selection change normalizes focus but pinned state is not stored in Session', () => {
  const value = store();
  value.setSelectedLayouts(['naginata-v18']);
  assert.equal(value.getSnapshot().focusLayoutId, 'naginata-v18');
  assert.equal(value.getSnapshot().revisions.target, 1);
  assert.equal(value.getSnapshot().revisions.focus, 1);
});

test('per-layout override commands change only their explicit scope', () => {
  const value = store();
  value.setDistanceOverride('qwerty', 'windowSize', 7);
  value.setTimingOverride('naginata-v18', 'speedMultiplier', 1.5);
  const snapshot = value.getSnapshot();
  assert.equal(snapshot.distance.perLayout.qwerty?.windowSize, 7);
  assert.equal(snapshot.distance.perLayout['naginata-v18'], undefined);
  assert.equal(snapshot.timing.perLayout['naginata-v18']?.speedMultiplier, 1.5);
  assert.equal(snapshot.timing.perLayout.qwerty, undefined);
});
