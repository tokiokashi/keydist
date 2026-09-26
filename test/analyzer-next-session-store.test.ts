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

  value.setDistanceDefault('windowSize', 5);
  assert.deepEqual(value.getSnapshot().revisions, {
    target: 0, distance: 1, timing: 1, focus: 1,
  });

  value.setText('別の本文');
  assert.deepEqual(value.getSnapshot().revisions, {
    target: 1, distance: 1, timing: 1, focus: 1,
  });
});

test('target change is atomic across mode, selection and focus', () => {
  const value = store();
  value.setTarget({
    mode: 'en',
    selectedLayoutIds: ['qwerty'],
    focusLayoutId: 'qwerty',
  });
  const snapshot = value.getSnapshot();
  assert.equal(snapshot.mode, 'en');
  assert.deepEqual(snapshot.selectedLayoutIds, ['qwerty']);
  assert.equal(snapshot.focusLayoutId, 'qwerty');
  assert.equal(snapshot.revisions.target, 1);
  assert.equal(snapshot.revisions.focus, 0);
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


test('global-only playback rate fields cannot be written as per-layout timing overrides', () => {
  const value = store();
  if (false) {
    // @ts-expect-error playbackRateAverage is global-only by contract
    value.setTimingOverride('qwerty', 'playbackRateAverage', 'ewma');
    // @ts-expect-error playbackRateWindow is global-only by contract
    value.setTimingOverride('qwerty', 'playbackRateWindow', 5);
    // @ts-expect-error playbackRateHalfLifeSeconds is global-only by contract
    value.setTimingOverride('qwerty', 'playbackRateHalfLifeSeconds', 2);
  }
  value.setTimingOverride('qwerty', 'speedMultiplier', 1.2);
  assert.equal(value.getSnapshot().timing.perLayout.qwerty?.speedMultiplier, 1.2);
});


test('public store methods remain valid when passed as bare callbacks', () => {
  const value = store();
  const { setSelectedLayouts, setTarget } = value;

  setSelectedLayouts(['naginata-v18']);
  assert.deepEqual(value.getSnapshot().selectedLayoutIds, ['naginata-v18']);
  assert.equal(value.getSnapshot().focusLayoutId, 'naginata-v18');

  setTarget({
    mode: 'en',
    selectedLayoutIds: ['qwerty'],
    focusLayoutId: 'qwerty',
  });
  assert.equal(value.getSnapshot().mode, 'en');
  assert.deepEqual(value.getSnapshot().selectedLayoutIds, ['qwerty']);
});


test('Session snapshots are deeply immutable and cannot bypass revisions or subscriptions', () => {
  const value = store();
  const snapshot = value.getSnapshot();
  let notifications = 0;
  const unsubscribe = value.subscribe(() => {
    notifications += 1;
  });

  if (false) {
    // @ts-expect-error Session snapshots are readonly outside the store.
    snapshot.text = 'tampered';
    // @ts-expect-error nested defaults are readonly outside the store.
    snapshot.distance.defaults.windowSize = 999;
    // @ts-expect-error policy fields are deeply readonly outside the store.
    snapshot.distance.defaults.chain.breakOnSameFinger = false;
    // @ts-expect-error policy collections are deeply readonly outside the store.
    snapshot.distance.defaults.actionRealization.triggerActivationOverrides?.push({
      selector: { triggerKeys: ['KeyA'] },
      grouping: 'combined',
    });
    // @ts-expect-error selected layout ids are readonly outside the store.
    snapshot.selectedLayoutIds.push('dvorak');
  }

  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.distance), true);
  assert.equal(Object.isFrozen(snapshot.distance.defaults), true);
  assert.equal(Object.isFrozen(snapshot.selectedLayoutIds), true);

  assert.throws(() => {
    (snapshot as unknown as { text: string }).text = 'tampered';
  }, TypeError);
  assert.throws(() => {
    (snapshot.distance.defaults as { windowSize: number }).windowSize = 999;
  }, TypeError);
  assert.throws(() => {
    (
      snapshot.distance.defaults.chain as { breakOnSameFinger: boolean }
    ).breakOnSameFinger = false;
  }, TypeError);
  assert.throws(() => {
    (snapshot.distance.defaults.actionRealization.triggerActivationOverrides as unknown as Array<{
      selector: { triggerKeys: string[] };
      grouping: 'combined';
    }>).push({
      selector: { triggerKeys: ['KeyA'] },
      grouping: 'combined',
    });
  }, TypeError);
  assert.throws(() => {
    (snapshot.selectedLayoutIds as string[]).push('dvorak');
  }, TypeError);

  assert.equal(value.getSnapshot().text, 'かな');
  assert.notEqual(value.getSnapshot().distance.defaults.windowSize, 999);
  assert.deepEqual(value.getSnapshot().selectedLayoutIds, ['qwerty', 'naginata-v18']);
  assert.deepEqual(value.getSnapshot().revisions, {
    target: 0,
    distance: 0,
    timing: 0,
    focus: 0,
  });
  assert.equal(notifications, 0);

  unsubscribe();
});
