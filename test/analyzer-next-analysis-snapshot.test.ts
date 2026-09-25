import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeStrokeStructure } from '../src/analysis-aggregate.ts';
import { resolveConditions } from '../src/condition-resolution.ts';
import { evaluate } from '../src/evaluate.ts';
import { buildGeometry } from '../src/geometry.ts';
import { DEFAULT_GEOMETRY_SETTINGS } from '../src/geometry-settings.ts';
import { LAYOUTS } from '../src/layouts/index.ts';
import { computeMetrics } from '../src/metrics.ts';
import {
  computeAnalysisSnapshot,
} from '../src/features/analyzer-next/snapshot-computation.ts';
import {
  createResolvedAnalysisInputResolver,
} from '../src/features/analyzer-next/resolved-input.ts';
import {
  createAnalysisSessionStore,
} from '../src/features/analyzer-next/session-store.ts';
import { DEFAULT_CONDITION_DEFAULTS, createDefaultUiState } from '../src/ui-state.ts';

function sessionStore() {
  const ui = createDefaultUiState({
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
    text: 'asdf jkl;',
    selectedLayoutIds: ['qwerty'],
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

test('new Snapshot pipeline matches the legacy evaluate/analyze/metrics sequence', () => {
  const layout = LAYOUTS.find((candidate) => candidate.id === 'qwerty')!;
  const conditions = resolveConditions(DEFAULT_CONDITION_DEFAULTS, undefined);
  const geometry = buildGeometry('row-staggered');

  const legacyTrace = evaluate('asdf jkl;', layout, geometry, conditions.options);
  const legacyAnalysis = analyzeStrokeStructure(
    legacyTrace.strokes,
    conditions.chainPolicy,
    conditions.arpeggioPolicy,
    conditions.triggerRealizationPolicy,
    conditions.actionRealizationPolicy,
  );
  const legacyMetrics = computeMetrics(legacyTrace, geometry, {
    windowSize: conditions.options.windowSize,
    sfbHomeCost: conditions.options.sfbHomeCost,
    preferOppositeThumb: conditions.options.preferOppositeThumb ?? false,
    chainPolicy: conditions.chainPolicy,
    arpeggioPolicy: conditions.arpeggioPolicy,
    triggerRealizationPolicy: conditions.triggerRealizationPolicy,
    actionRealizationPolicy: conditions.actionRealizationPolicy,
    romajiRuleId: null,
  });

  const next = computeAnalysisSnapshot({
    mode: 'en',
    text: 'asdf jkl;',
    layout,
    geometry,
    conditions,
    romajiRuleId: null,
  });

  assert.deepEqual(next.trace, legacyTrace);
  assert.deepEqual(next.analysis, legacyAnalysis);
  assert.deepEqual(next.metrics, legacyMetrics);
});

test('resolved calculation key ignores timing changes but reacts to distance and catalog revisions', () => {
  const layout = LAYOUTS.find((candidate) => candidate.id === 'qwerty')!;
  const store = sessionStore();
  let catalogRevision = 'layout:1';
  const resolver = createResolvedAnalysisInputResolver({
    getSession: store.getSnapshot,
    layoutsForMode: () => [{
      layout,
      revisionKey: catalogRevision,
      romajiRuleId: null,
    }],
    geometryForKind: () => ({
      settings: DEFAULT_GEOMETRY_SETTINGS,
      revisionKey: 'geometry:1',
    }),
  });

  const first = resolver('qwerty')!;
  store.setTimingDefault('speedMultiplier', 1.5);
  const afterTiming = resolver('qwerty')!;
  assert.equal(afterTiming.key, first.key);

  store.setDistanceDefault('windowSize', 5);
  const afterDistance = resolver('qwerty')!;
  assert.notEqual(afterDistance.key, first.key);

  catalogRevision = 'layout:2';
  const afterCatalog = resolver('qwerty')!;
  assert.notEqual(afterCatalog.key, afterDistance.key);
});

test('resolver refuses to expand Snapshot scope for an unselected layout', () => {
  const layout = LAYOUTS.find((candidate) => candidate.id === 'qwerty')!;
  const store = sessionStore();
  store.setSelectedLayouts([]);
  const resolver = createResolvedAnalysisInputResolver({
    getSession: store.getSnapshot,
    layoutsForMode: () => [{ layout, revisionKey: 'layout:1', romajiRuleId: null }],
    geometryForKind: () => ({
      settings: DEFAULT_GEOMETRY_SETTINGS,
      revisionKey: 'geometry:1',
    }),
  });
  assert.equal(resolver('qwerty'), undefined);
});


test('per-layout romaji override re-resolves the effective Layout and calculation key', () => {
  const baseLayout = LAYOUTS.find((candidate) => candidate.id === 'qwerty')!;
  const store = sessionStore();
  const kunreiLayout = { ...baseLayout, name: 'QWERTY / kunrei' };
  const resolver = createResolvedAnalysisInputResolver({
    getSession: store.getSnapshot,
    layoutsForMode: (mode) => [{
      layout: baseLayout,
      revisionKey: `${mode}:qwerty:default`,
      romajiRuleId: mode === 'ja' ? 'hepburn' : null,
      resolveRomajiRule: (ruleId) => ({
        layout: kunreiLayout,
        revisionKey: `${mode}:qwerty:romaji:${ruleId}`,
        romajiRuleId: ruleId,
      }),
    }],
    geometryForKind: () => ({
      settings: DEFAULT_GEOMETRY_SETTINGS,
      revisionKey: 'geometry:1',
    }),
  });

  store.setMode('ja');
  const before = resolver('qwerty')!;
  assert.equal(before.input.romajiRuleId, 'hepburn');
  assert.equal(before.input.layout, baseLayout);

  store.setDistanceOverride('qwerty', 'romajiRule', 'kunrei');
  const after = resolver('qwerty')!;
  assert.equal(after.input.romajiRuleId, 'kunrei');
  assert.equal(after.input.layout, kunreiLayout);
  assert.notEqual(after.key, before.key);

  store.setMode('en');
  const en = resolver('qwerty')!;
  assert.equal(en.input.romajiRuleId, 'kunrei');
  assert.match(en.key, /en:qwerty:romaji:kunrei/);
  assert.notEqual(en.key, after.key);
});

test('unknown per-layout romaji rule makes the resolved input unavailable instead of using stale layout data', () => {
  const layout = LAYOUTS.find((candidate) => candidate.id === 'qwerty')!;
  const store = sessionStore();
  const resolver = createResolvedAnalysisInputResolver({
    getSession: store.getSnapshot,
    layoutsForMode: () => [{
      layout,
      revisionKey: 'qwerty:default',
      romajiRuleId: null,
      resolveRomajiRule: () => undefined,
    }],
    geometryForKind: () => ({
      settings: DEFAULT_GEOMETRY_SETTINGS,
      revisionKey: 'geometry:1',
    }),
  });

  store.setDistanceOverride('qwerty', 'romajiRule', 'removed-rule');
  assert.equal(resolver('qwerty'), undefined);
});
