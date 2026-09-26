import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_GEOMETRY_SETTINGS } from '../src/geometry-settings.ts';
import { createAnalysisDomainCatalog } from '../src/features/analyzer-next/domain-catalog.ts';
import { createResolvedAnalysisInputResolver } from '../src/features/analyzer-next/resolved-input.ts';
import { createAnalysisSessionStore } from '../src/features/analyzer-next/session-store.ts';
import { computeAnalysisSnapshot } from '../src/features/analyzer-next/snapshot-computation.ts';
import { createAnalysisSnapshotReader } from '../src/features/analyzer-next/snapshot-reader.ts';
import { createAnalysisSnapshotService } from '../src/features/analyzer-next/snapshot-service.ts';
import { DEFAULT_CONDITION_DEFAULTS, createDefaultUiState } from '#legacy/ui-state.ts';

function session() {
  const defaults = createDefaultUiState({
    textPanelOpen: true,
    usePlaybackCalibration: false,
    selectedLayouts: { en: ['qwerty'], ja: ['qwerty'] },
  });
  const {
    playbackRateAverage,
    playbackRateWindow,
    playbackRateHalfLifeSeconds,
    ...distanceDefaults
  } = DEFAULT_CONDITION_DEFAULTS;
  return createAnalysisSessionStore({
    mode: 'en',
    text: 'asdf',
    selectedLayoutIds: ['qwerty'],
    focusLayoutId: 'qwerty',
    distance: { defaults: distanceDefaults, perLayout: {} },
    timing: {
      defaults: {
        playbackRateAverage,
        playbackRateWindow,
        playbackRateHalfLifeSeconds,
        stepsPerSecond: defaults.ui.playback.stepsPerSecond,
        speedMultiplier: defaults.ui.playback.speedMultiplier,
        sameFingerDelay: defaults.ui.playback.sameFingerDelay,
        allFingerMovementDelay: defaults.ui.playback.allFingerMovementDelay,
        useCalibration: defaults.ui.playback.useCalibration,
      },
      perLayout: {},
    },
  });
}

test('Snapshot reader stays frozen to one Session revision while sharing the cache', () => {
  const store = session();
  const catalog = createAnalysisDomainCatalog({
    userLayouts: [],
    userGeometryShapes: [],
    romajiSettings: { rules: [], assignments: {} },
    geometrySettings: DEFAULT_GEOMETRY_SETTINGS,
  });
  const liveResolve = createResolvedAnalysisInputResolver({
    getSession: store.getSnapshot,
    layoutsForMode: catalog.layoutsForMode,
    geometryForKind: catalog.geometryForKind,
  });
  const snapshots = createAnalysisSnapshotService({
    resolve: liveResolve,
    evaluate: computeAnalysisSnapshot,
  });

  const firstReader = createAnalysisSnapshotReader({
    session: store.getSnapshot(),
    layoutsForMode: catalog.layoutsForMode,
    geometryForKind: catalog.geometryForKind,
    snapshots,
  });
  const first = firstReader.get('qwerty')!;

  store.setText('jkl;');

  // The old reader must not silently start returning the newer Session input.
  assert.equal(firstReader.get('qwerty'), first);
  assert.equal(firstReader.revision.target, 0);

  const nextReader = createAnalysisSnapshotReader({
    session: store.getSnapshot(),
    layoutsForMode: catalog.layoutsForMode,
    geometryForKind: catalog.geometryForKind,
    snapshots,
  });
  const next = nextReader.get('qwerty')!;

  assert.equal(nextReader.revision.target, 1);
  assert.notEqual(next.calculationKey, first.calculationKey);
  assert.notDeepEqual(next.snapshot.trace, first.snapshot.trace);
  assert.equal(snapshots.cacheSize(), 1, 'superseded layout key is released');
});

test('reader getMany returns only layouts valid in its captured selection', () => {
  const store = session();
  const catalog = createAnalysisDomainCatalog({
    userLayouts: [],
    userGeometryShapes: [],
    romajiSettings: { rules: [], assignments: {} },
    geometrySettings: DEFAULT_GEOMETRY_SETTINGS,
  });
  const resolve = createResolvedAnalysisInputResolver({
    getSession: store.getSnapshot,
    layoutsForMode: catalog.layoutsForMode,
    geometryForKind: catalog.geometryForKind,
  });
  const snapshots = createAnalysisSnapshotService({
    resolve,
    evaluate: computeAnalysisSnapshot,
  });
  const reader = createAnalysisSnapshotReader({
    session: store.getSnapshot(),
    layoutsForMode: catalog.layoutsForMode,
    geometryForKind: catalog.geometryForKind,
    snapshots,
  });

  assert.deepEqual(
    reader.getMany(['qwerty', 'dvorak']).map((read) => read.layoutId),
    ['qwerty'],
  );
});
