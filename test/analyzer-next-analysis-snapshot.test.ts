import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeStrokeStructure } from '../src/analysis-aggregate.ts';
import { resolveConditions } from '../src/condition-resolution.ts';
import { evaluate } from '../src/evaluate.ts';
import { assignmentWithHomeKeys, buildGeometry } from '../src/geometry.ts';
import {
  DEFAULT_GEOMETRY_SETTINGS,
  geometrySettingsForPreset,
} from '../src/geometry-settings.ts';
import { LAYOUTS, withRomaji } from '../src/layouts/index.ts';
import type { Layout } from '../src/layouts/types.ts';
import { computeMetrics } from '../src/metrics.ts';
import { tableForRule } from '../src/romaji/rules.ts';
import {
  computeAnalysisSnapshot,
} from '../src/features/analyzer-next/snapshot-computation.ts';
import {
  createResolvedAnalysisInputResolver,
  type AnalysisLayoutCatalogEntry,
} from '../src/features/analyzer-next/resolved-input.ts';
import {
  createAnalysisSessionStore,
} from '../src/features/analyzer-next/session-store.ts';
import { DEFAULT_CONDITION_DEFAULTS, createDefaultUiState } from '#legacy/ui-state.ts';

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

function romajiEntry(
  layout: Layout,
  mode: 'en' | 'ja',
  defaultRule = 'kunrei',
): AnalysisLayoutCatalogEntry {
  if (mode === 'en') {
    return {
      layout,
      revisionKey: 'en:qwerty',
      romajiRuleId: null,
      romajiCapable: false,
    };
  }
  const resolve = (ruleId: string): AnalysisLayoutCatalogEntry => ({
    layout: withRomaji(layout, tableForRule(ruleId)),
    revisionKey: `ja:qwerty:romaji:${ruleId}`,
    romajiRuleId: ruleId,
    romajiCapable: true,
    resolveRomajiRule: resolve,
  });
  return {
    ...resolve(defaultRule),
    revisionKey: `ja:qwerty:default:${defaultRule}`,
  };
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
      romajiCapable: false,
    }],
    geometryForKind: () => ({
      settings: DEFAULT_GEOMETRY_SETTINGS,
      revisionKey: 'geometry:1',
    }),
  });

  const first = resolver('qwerty')!;
  store.setTimingDefault('speedMultiplier', 1.5);
  assert.equal(resolver('qwerty')!.key, first.key);

  store.setDistanceDefault('windowSize', 5);
  const afterDistance = resolver('qwerty')!;
  assert.notEqual(afterDistance.key, first.key);

  catalogRevision = 'layout:2';
  assert.notEqual(resolver('qwerty')!.key, afterDistance.key);
});

test('resolver refuses to expand Snapshot scope for an unselected layout', () => {
  const layout = LAYOUTS.find((candidate) => candidate.id === 'qwerty')!;
  const store = sessionStore();
  store.setSelectedLayouts([]);
  const resolver = createResolvedAnalysisInputResolver({
    getSession: store.getSnapshot,
    layoutsForMode: () => [{
      layout,
      revisionKey: 'layout:1',
      romajiRuleId: null,
      romajiCapable: false,
    }],
    geometryForKind: () => ({
      settings: DEFAULT_GEOMETRY_SETTINGS,
      revisionKey: 'geometry:1',
    }),
  });
  assert.equal(resolver('qwerty'), undefined);
});

test('romaji override is effective only for romaji-capable mode and survives ja -> en -> ja', () => {
  const baseLayout = LAYOUTS.find((candidate) => candidate.id === 'qwerty')!;
  const store = sessionStore();
  const resolver = createResolvedAnalysisInputResolver({
    getSession: store.getSnapshot,
    layoutsForMode: (mode) => [romajiEntry(baseLayout, mode)],
    geometryForKind: () => ({
      settings: DEFAULT_GEOMETRY_SETTINGS,
      revisionKey: 'geometry:1',
    }),
  });

  store.setTarget({ mode: 'ja', selectedLayoutIds: ['qwerty'], focusLayoutId: 'qwerty' });
  store.setDistanceOverride('qwerty', 'romajiRule', 'removed-custom-rule');
  const ja = resolver('qwerty')!;
  assert.equal(ja.input.romajiRuleId, 'removed-custom-rule');
  assert.equal(
    ja.input.layout.romajiTable?.get('し'),
    tableForRule('removed-custom-rule').get('し'),
    'removed rule keeps legacy tableForRule fallback semantics',
  );

  store.setTarget({ mode: 'en', selectedLayoutIds: ['qwerty'], focusLayoutId: 'qwerty' });
  const en = resolver('qwerty')!;
  assert.equal(en.input.romajiRuleId, null);
  assert.equal(en.input.layout.romajiTable, undefined);

  store.setTarget({ mode: 'ja', selectedLayoutIds: ['qwerty'], focusLayoutId: 'qwerty' });
  const jaAgain = resolver('qwerty')!;
  assert.equal(jaAgain.input.romajiRuleId, 'removed-custom-rule');
  assert.equal(jaAgain.key, ja.key);
});

test('direct/non-romaji layout ignores a persisted romaji override', () => {
  const base = LAYOUTS.find((candidate) => candidate.id === 'qwerty')!;
  const direct: Layout = { ...base, id: 'direct-custom', name: 'Direct custom' };
  const store = sessionStore();
  store.setTarget({
    mode: 'ja',
    selectedLayoutIds: ['direct-custom'],
    focusLayoutId: 'direct-custom',
  });
  store.setDistanceOverride('direct-custom', 'romajiRule', 'kunrei');

  const resolver = createResolvedAnalysisInputResolver({
    getSession: store.getSnapshot,
    layoutsForMode: () => [{
      layout: direct,
      revisionKey: 'direct:1',
      romajiRuleId: null,
      romajiCapable: false,
    }],
    geometryForKind: () => ({
      settings: DEFAULT_GEOMETRY_SETTINGS,
      revisionKey: 'geometry:1',
    }),
  });

  const resolved = resolver('direct-custom')!;
  assert.equal(resolved.input.layout, direct);
  assert.equal(resolved.input.romajiRuleId, null);
});

test('representative ja romaji + per-layout geometry/policy resolves to legacy-equivalent Metrics', () => {
  const base = LAYOUTS.find((candidate) => candidate.id === 'qwerty')!;
  const legacyLayout = withRomaji(base, tableForRule('kunrei'));
  const override = {
    geometry: 'ortholinear' as const,
    windowSize: 5,
    chain: {
      ...DEFAULT_CONDITION_DEFAULTS.chain,
      breakOnSameFinger: !DEFAULT_CONDITION_DEFAULTS.chain.breakOnSameFinger,
    },
  };
  const legacyConditions = resolveConditions(DEFAULT_CONDITION_DEFAULTS, override);
  const legacyGeometrySettings = geometrySettingsForPreset('ortholinear');
  const legacyGeometry = buildGeometry(
    legacyGeometrySettings.shape,
    assignmentWithHomeKeys(legacyGeometrySettings.assignment, legacyLayout.homeKeys),
  );
  const legacyTrace = evaluate('しん', legacyLayout, legacyGeometry, legacyConditions.options);
  const legacyAnalysis = analyzeStrokeStructure(
    legacyTrace.strokes,
    legacyConditions.chainPolicy,
    legacyConditions.arpeggioPolicy,
    legacyConditions.triggerRealizationPolicy,
    legacyConditions.actionRealizationPolicy,
  );
  const legacyMetrics = computeMetrics(legacyTrace, legacyGeometry, {
    windowSize: legacyConditions.options.windowSize,
    sfbHomeCost: legacyConditions.options.sfbHomeCost,
    preferOppositeThumb: legacyConditions.options.preferOppositeThumb ?? false,
    chainPolicy: legacyConditions.chainPolicy,
    arpeggioPolicy: legacyConditions.arpeggioPolicy,
    triggerRealizationPolicy: legacyConditions.triggerRealizationPolicy,
    actionRealizationPolicy: legacyConditions.actionRealizationPolicy,
    romajiRuleId: 'kunrei',
  });

  const store = sessionStore();
  store.setTarget({ mode: 'ja', selectedLayoutIds: ['qwerty'], focusLayoutId: 'qwerty' });
  store.setText('しん');
  store.setDistanceOverride('qwerty', 'romajiRule', 'kunrei');
  store.setDistanceOverride('qwerty', 'geometry', 'ortholinear');
  store.setDistanceOverride('qwerty', 'windowSize', 5);
  store.setDistanceOverride('qwerty', 'chain', override.chain);

  const resolver = createResolvedAnalysisInputResolver({
    getSession: store.getSnapshot,
    layoutsForMode: () => [romajiEntry(base, 'ja')],
    geometryForKind: (kind) => ({
      settings: kind === 'ortholinear'
        ? geometrySettingsForPreset('ortholinear')
        : geometrySettingsForPreset('row-staggered'),
      revisionKey: `geometry:${kind}`,
    }),
  });
  const resolved = resolver('qwerty')!;
  const next = computeAnalysisSnapshot(resolved.input);

  assert.deepEqual(next.trace, legacyTrace);
  assert.deepEqual(next.analysis, legacyAnalysis);
  assert.deepEqual(next.metrics, legacyMetrics);
});
