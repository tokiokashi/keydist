import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAnalyzerPlaybackSurfaceModel,
  type AnalyzerPlaybackSurfaceData,
} from './analyzer-playback-surface-model.ts';

test('Playback surface model publishes only ephemeral derived data', () => {
  const model = createAnalyzerPlaybackSurfaceModel();
  let notifications = 0;
  model.subscribe(() => { notifications += 1; });

  const data = {
    layout: { id: 'test-layout', name: 'Test' },
    geometry: { id: 'test-geometry', name: 'Geometry' },
    panelOpen: true,
    rateChartOpen: false,
    settingsOpen: false,
    total: 1,
    cursor: 0,
    playing: false,
    isRomaji: false,
    currentText: '—',
    kanaText: '—',
    typedText: '—',
    inputPreview: [],
    layerLabel: '開始前',
    structureLabel: '—',
    effectiveKanaRate: '— かな/秒',
    effectiveRate: '— アクション/秒',
    settingsSummary: '5ステップ/秒・1倍',
    keyLabels: new Map(),
    activeKeys: new Set(),
    triggerKeys: new Set(),
    fingerPositionKeys: new Map(),
    trailKeys: new Map(),
    plannedKeys: new Map(),
    plannedOrders: new Map(),
    trailOrders: new Map(),
    chainOrders: new Map(),
    arpeggioOrders: new Map(),
    motions: [],
    motionRevision: 0,
    feedbackKeys: new Set(),
    feedbackStyle: 'fade',
    feedbackRevision: 0,
    rateChartPoints: [],
    rateChartDisplay: 'none',
    scale: 1,
  } as unknown as AnalyzerPlaybackSurfaceData;

  model.setData(data);
  assert.equal(model.getSnapshot().revision, 1);
  assert.equal(model.getSnapshot().data, data);
  assert.equal(notifications, 1);

  model.clear();
  assert.equal(model.getSnapshot().data, undefined);
  assert.equal(model.getSnapshot().revision, 2);
  assert.equal(notifications, 2);
});
