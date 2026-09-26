import assert from 'node:assert/strict';
import test from 'node:test';
import { ANALYSIS_VIEW_DEFINITIONS } from './view-registry.ts';
import {
  searchFromStandaloneBinding,
  standaloneBindingFromSearch,
  validateStandaloneViewSearch,
} from './route-state.ts';

test('registry fixes cardinality for all stable View types', () => {
  assert.equal(ANALYSIS_VIEW_DEFINITIONS.get('bigram-flow')?.cardinality, 'single');
  assert.equal(ANALYSIS_VIEW_DEFINITIONS.get('heatmap')?.cardinality, 'single');
  assert.equal(ANALYSIS_VIEW_DEFINITIONS.get('finger-metrics')?.cardinality, 'single');
  assert.equal(ANALYSIS_VIEW_DEFINITIONS.get('playback')?.cardinality, 'single');
  assert.equal(ANALYSIS_VIEW_DEFINITIONS.get('comparison')?.cardinality, 'set');
  assert.equal(ANALYSIS_VIEW_DEFINITIONS.get('matrices')?.cardinality, 'set');
  assert.equal(ANALYSIS_VIEW_DEFINITIONS.get('sensitivity')?.cardinality, 'set');
});

test('Bigram Flow codec sanitizes config without changing Session state', () => {
  const definition = ANALYSIS_VIEW_DEFINITIONS.get('bigram-flow')!;
  assert.deepEqual(definition.configCodec.decode({
    source: 'within-hand',
    selectedFingers: ['index', 'index', 'ring', 'invalid'],
    lineScale: 'log',
    layerOrder: 'cross-hand-top',
    hoverScale: 'global',
    movementScaleMode: 'fixed',
    polarBandwidth: 12,
    polarGain: 2.5,
  }, 1), {
    source: 'within-hand',
    selectedFingers: ['index', 'ring'],
    lineScale: 'log',
    layerOrder: 'cross-hand-top',
    hoverScale: 'global',
    movementScaleMode: 'fixed',
    polarBandwidth: 12,
    polarGain: 2.5,
  });
  assert.deepEqual(definition.configCodec.decode({ source: 'bad' }, 1), {
    source: 'actual',
    selectedFingers: [],
    lineScale: 'linear',
    layerOrder: 'weight',
    hoverScale: 'key',
    movementScaleMode: 'fit',
    polarBandwidth: 5,
    polarGain: 1,
  });
});

test('Heatmap active tab is represented by layer id instead of shared numeric index', () => {
  const definition = ANALYSIS_VIEW_DEFINITIONS.get('heatmap')!;
  assert.deepEqual(definition.configCodec.decode({
    view: 'tabs',
    colorScale: 'log',
    showLayerDetails: true,
    keyPatternGuide: false,
    activeLayerId: 'shift:left',
    panels: { layerStats: true, modifierList: true, comboTable: true },
  }, 1), {
    view: 'tabs',
    colorScale: 'log',
    showLayerDetails: true,
    keyPatternGuide: false,
    activeLayerId: 'shift:left',
    panels: { layerStats: true, modifierList: true, comboTable: true },
  });
});

test('standalone URL only carries pin binding and never Session selection', () => {
  assert.deepEqual(
    validateStandaloneViewSearch({
      mode: 'ja',
      layout: 'qwerty',
      selectedLayouts: ['qwerty', 'shingeta'],
      text: 'URLへ入れない',
    }),
    { mode: 'ja', layout: 'qwerty' },
  );
  assert.deepEqual(
    standaloneBindingFromSearch('single', { mode: 'ja', layout: 'qwerty' }),
    { kind: 'layout', mode: 'ja', id: 'qwerty' },
  );
  assert.deepEqual(
    standaloneBindingFromSearch('single', {}),
    { kind: 'focused-layout' },
  );
  assert.deepEqual(
    standaloneBindingFromSearch('set', { mode: 'ja', layout: 'qwerty' }),
    { kind: 'session' },
  );
});

test('route binding round-trips pin mode and layout id', () => {
  const binding = { kind: 'layout', mode: 'en', id: 'qwerty' } as const;
  assert.deepEqual(
    standaloneBindingFromSearch('single', searchFromStandaloneBinding(binding)),
    binding,
  );
});


test('Comparison / Matrices / Playback codecs preserve the §1.4 classified ViewConfig fields', () => {
  const comparison = ANALYSIS_VIEW_DEFINITIONS.get('comparison')!;
  assert.deepEqual(comparison.configCodec.decode({
    baselineLayoutId: 'qwerty',
    chartColumn: 4,
    sort: { column: 2, direction: 'desc' },
  }, 1), {
    baselineLayoutId: 'qwerty',
    chartColumn: 4,
    sort: { column: 2, direction: 'desc' },
  });

  const matrices = ANALYSIS_VIEW_DEFINITIONS.get('matrices')!;
  assert.deepEqual(matrices.configCodec.decode({
    sorts: {
      press: { column: 1, direction: 'asc' },
      finger: null,
      adjacentMean: { column: 3, direction: 'desc' },
      adjacentStdDev: null,
    },
  }, 1), {
    sorts: {
      press: { column: 1, direction: 'asc' },
      finger: null,
      adjacentMean: { column: 3, direction: 'desc' },
      adjacentStdDev: null,
    },
  });

  const playback = ANALYSIS_VIEW_DEFINITIONS.get('playback')!;
  const decoded = playback.configCodec.decode({
    showFingers: true,
    fingerPreparationSeconds: 0.2,
    playbackOpen: true,
    playbackRateChartOpen: true,
  }, 1) as Record<string, unknown>;
  assert.equal(decoded.showFingers, true);
  assert.equal(decoded.fingerPreparationSeconds, 0.2);
  assert.equal(decoded.playbackOpen, true);
  assert.equal(decoded.playbackRateChartOpen, true);
  assert.equal('stepsPerSecond' in decoded, false);
  assert.equal('speedMultiplier' in decoded, false);
});


test('ViewConfig codec preserves legacy MatrixSort bounds and integer trailTau', () => {
  const comparison = ANALYSIS_VIEW_DEFINITIONS.get('comparison')!;
  assert.equal(
    (comparison.configCodec.decode({
      sort: { column: 13, direction: 'asc' },
    }, 1) as { sort: unknown }).sort,
    null,
  );

  const matrices = ANALYSIS_VIEW_DEFINITIONS.get('matrices')!;
  assert.deepEqual(
    (matrices.configCodec.decode({
      sorts: {
        press: { column: 10, direction: 'asc' },
        finger: { column: 9, direction: 'desc' },
        adjacentMean: { column: 6, direction: 'asc' },
        adjacentStdDev: { column: 5, direction: 'desc' },
      },
    }, 1) as { sorts: Record<string, unknown> }).sorts,
    {
      press: null,
      finger: { column: 9, direction: 'desc' },
      adjacentMean: null,
      adjacentStdDev: { column: 5, direction: 'desc' },
    },
  );

  const playback = ANALYSIS_VIEW_DEFINITIONS.get('playback')!;
  assert.equal(
    (playback.configCodec.decode({ trailTau: 2.5 }, 1) as { trailTau: number }).trailTau,
    5,
  );
  assert.equal(
    (playback.configCodec.decode({ trailTau: 20 }, 1) as { trailTau: number }).trailTau,
    20,
  );
});
