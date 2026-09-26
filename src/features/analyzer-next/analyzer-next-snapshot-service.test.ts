import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_GEOMETRY_SETTINGS } from '#input/shapes/settings.ts';
import { createAnalysisDomainCatalog } from './domain-catalog.ts';
import { createResolvedAnalysisInputResolver } from './resolved-input.ts';
import { createAnalysisSessionStore } from './session-store.ts';
import { createAnalysisSnapshotService } from './snapshot-service.ts';
import { DEFAULT_CONDITION_DEFAULTS, createDefaultUiState } from '#legacy/ui-state.ts';

test('same resolved calculation key reuses Snapshot', () => {
  let evaluationCount = 0;
  let key = 'ja|qwerty|text:a|distance:1|catalog:1';
  let payload = 1;
  const service = createAnalysisSnapshotService({
    resolve: () => ({ key, input: payload }),
    evaluate: (input: number) => {
      evaluationCount += 1;
      return input * 10;
    },
  });

  assert.equal(service.get('qwerty'), 10);
  assert.equal(service.get('qwerty'), 10);
  assert.equal(evaluationCount, 1);

  key = 'ja|qwerty|text:a|distance:2|catalog:1';
  payload = 2;
  assert.equal(service.get('qwerty'), 20);
  assert.equal(evaluationCount, 2);
});

test('real Session focus/timing changes do not evaluate again, while distance/text changes do', () => {
  const ui = createDefaultUiState({
    textPanelOpen: true,
    usePlaybackCalibration: false,
    selectedLayouts: { en: ['qwerty', 'dvorak'], ja: ['qwerty'] },
  });
  const {
    playbackRateAverage,
    playbackRateWindow,
    playbackRateHalfLifeSeconds,
    ...distanceDefaults
  } = DEFAULT_CONDITION_DEFAULTS;
  const session = createAnalysisSessionStore({
    mode: 'en',
    text: 'asdf',
    selectedLayoutIds: ['qwerty', 'dvorak'],
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
  const catalog = createAnalysisDomainCatalog({
    userLayouts: [],
    userGeometryShapes: [],
    romajiSettings: { rules: [], assignments: {} },
    geometrySettings: DEFAULT_GEOMETRY_SETTINGS,
  });
  const resolve = createResolvedAnalysisInputResolver({
    getSession: session.getSnapshot,
    layoutsForMode: catalog.layoutsForMode,
    geometryForKind: catalog.geometryForKind,
  });
  let evaluationCount = 0;
  const service = createAnalysisSnapshotService({
    resolve,
    evaluate: (input) => {
      evaluationCount += 1;
      return input.text;
    },
  });

  assert.equal(service.get('qwerty'), 'asdf');
  assert.equal(evaluationCount, 1);

  session.setFocus('dvorak');
  assert.equal(service.get('qwerty'), 'asdf');
  assert.equal(evaluationCount, 1, 'focus is presentation selection, not calculation input');

  session.setTimingDefault(
    'speedMultiplier',
    session.getSnapshot().timing.defaults.speedMultiplier + 0.25,
  );
  assert.equal(service.get('qwerty'), 'asdf');
  assert.equal(evaluationCount, 1, 'timing playback state does not invalidate structural Snapshot');

  session.setTimingDefault(
    'playbackRateAverage',
    session.getSnapshot().timing.defaults.playbackRateAverage === 'sma' ? 'ewma' : 'sma',
  );
  assert.equal(service.get('qwerty'), 'asdf');
  assert.equal(
    evaluationCount,
    1,
    'playbackRateAverage must not enter the structural Snapshot key',
  );

  session.setTimingDefault(
    'playbackRateWindow',
    session.getSnapshot().timing.defaults.playbackRateWindow + 1,
  );
  assert.equal(service.get('qwerty'), 'asdf');
  assert.equal(
    evaluationCount,
    1,
    'playbackRateWindow must not enter the structural Snapshot key',
  );

  session.setTimingDefault(
    'playbackRateHalfLifeSeconds',
    session.getSnapshot().timing.defaults.playbackRateHalfLifeSeconds + 1,
  );
  assert.equal(service.get('qwerty'), 'asdf');
  assert.equal(
    evaluationCount,
    1,
    'playbackRateHalfLifeSeconds must not enter the structural Snapshot key',
  );

  const currentWindow = session.getSnapshot().distance.defaults.windowSize;
  session.setDistanceDefault('windowSize', currentWindow === 5 ? 6 : 5);
  assert.equal(service.get('qwerty'), 'asdf');
  assert.equal(evaluationCount, 2, 'distance-model change must recalculate');

  session.setText('jkl;');
  assert.equal(service.get('qwerty'), 'jkl;');
  assert.equal(evaluationCount, 3, 'analysis target text change must recalculate');
});

test('per-layout key change recomputes only that layout', () => {
  let qwertyKey = 'q:1';
  let naginataKey = 'n:1';
  let evaluationCount = 0;
  const service = createAnalysisSnapshotService({
    resolve: (layoutId: string) => ({
      key: layoutId === 'qwerty' ? qwertyKey : naginataKey,
      input: layoutId,
    }),
    evaluate: (layoutId: string) => {
      evaluationCount += 1;
      return `${layoutId}:${evaluationCount}`;
    },
  });

  service.get('qwerty');
  service.get('naginata');
  assert.equal(evaluationCount, 2);

  qwertyKey = 'q:2';
  service.get('qwerty');
  service.get('naginata');
  assert.equal(evaluationCount, 3);

  naginataKey = 'n:2';
  service.get('naginata');
  assert.equal(evaluationCount, 4);
});


test('repeated text/condition key changes do not retain stale Snapshots', () => {
  let revision = 0;
  const service = createAnalysisSnapshotService({
    resolve: (layoutId: string) => ({
      key: `${layoutId}:${revision}`,
      input: revision,
    }),
    evaluate: (input: number) => input,
  });

  for (revision = 0; revision < 100; revision += 1) {
    service.get('qwerty');
    assert.equal(service.cacheSize(), 1);
  }
});

test('shared cache key is kept until the last layout reference is invalidated', () => {
  const service = createAnalysisSnapshotService({
    resolve: () => ({ key: 'shared', input: 1 }),
    evaluate: (input: number) => input,
  });

  service.get('a');
  service.get('b');
  assert.equal(service.cacheSize(), 1);
  service.invalidateLayout('a');
  assert.equal(service.cacheSize(), 1);
  service.invalidateLayout('b');
  assert.equal(service.cacheSize(), 0);
});


test('selected layout becoming unavailable releases its cached Snapshot', () => {
  let available = true;
  const service = createAnalysisSnapshotService({
    resolve: () => available ? { key: 'qwerty:1', input: 1 } : undefined,
    evaluate: (input: number) => input,
  });

  assert.equal(service.get('qwerty'), 1);
  assert.equal(service.cacheSize(), 1);

  available = false;
  assert.equal(service.get('qwerty'), undefined);
  assert.equal(service.cacheSize(), 0);
});


test('getResolved honors an explicitly captured resolution instead of live resolver state', () => {
  let live = { key: 'live:2', input: 2 };
  const service = createAnalysisSnapshotService({
    resolve: () => live,
    evaluate: (input: number) => input * 10,
  });

  assert.equal(
    service.getResolved('qwerty', { key: 'captured:1', input: 1 }),
    10,
  );
  assert.equal(service.get('qwerty'), 20);
  live = { key: 'live:3', input: 3 };
  assert.equal(service.get('qwerty'), 30);
});
