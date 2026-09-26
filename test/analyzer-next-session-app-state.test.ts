import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzerSlicesFromUiState,
  type AppStateV2,
} from '../src/app-state.ts';
import { analyzerSampleText } from '#legacy/analyzer-samples.ts';
import { analysisSessionSeedFromAppState } from '../src/features/analyzer-next/session-app-state.ts';
import { createDefaultUiState } from '#legacy/ui-state.ts';

function appState(): AppStateV2 {
  const ui = createDefaultUiState({
    textPanelOpen: true,
    usePlaybackCalibration: false,
    selectedLayouts: { en: ['qwerty'], ja: ['qwerty', 'naginata-v18'] },
  });
  return {
    version: 2,
    ...analyzerSlicesFromUiState(ui),
  };
}

test('AppState adapter separates distance, timing and display-only playback fields', () => {
  const app = appState();
  app.analyzer!.input.mode = 'ja';
  app.analyzer!.layouts.detailByMode.ja = 'naginata-v18';
  app.conditions!.perLayout['naginata-v18'] = {
    windowSize: 5,
    romajiRule: 'azik',
    playback: {
      speedMultiplier: 1.4,
      sameFingerDelay: false,
      showTrail: true,
      scale: 2,
    },
  };
  app.playback!.stepsPerSecond = 7;
  app.playback!.showFingers = true;

  const seed = analysisSessionSeedFromAppState(app);

  assert.equal(seed.mode, 'ja');
  assert.deepEqual(seed.selectedLayoutIds, ['qwerty', 'naginata-v18']);
  assert.equal(seed.focusLayoutId, 'naginata-v18');
  assert.equal(seed.distance.perLayout['naginata-v18']?.windowSize, 5);
  assert.equal(seed.distance.perLayout['naginata-v18']?.romajiRule, 'azik');
  assert.equal('playback' in (seed.distance.perLayout['naginata-v18'] ?? {}), false);
  assert.deepEqual(seed.timing.perLayout['naginata-v18'], {
    speedMultiplier: 1.4,
    sameFingerDelay: false,
  });
  assert.equal(seed.timing.defaults.stepsPerSecond, 7);
  assert.equal('showFingers' in seed.timing.defaults, false);
  assert.equal('showTrail' in (seed.timing.perLayout['naginata-v18'] ?? {}), false);
  assert.equal('scale' in (seed.timing.perLayout['naginata-v18'] ?? {}), false);
});

test('AppState adapter resolves current sample unless custom text exists', () => {
  const sampleApp = appState();
  sampleApp.analyzer!.input.mode = 'en';
  sampleApp.analyzer!.input.selectedSampleByMode.en = 'default';

  assert.equal(
    analysisSessionSeedFromAppState(sampleApp).text,
    analyzerSampleText('en', 'default'),
  );

  sampleApp.analyzer!.input.customText = 'custom analyzer text';
  assert.equal(
    analysisSessionSeedFromAppState(sampleApp).text,
    'custom analyzer text',
  );
});

test('AppState adapter has a headless fallback when Analyzer slices are absent', () => {
  const seed = analysisSessionSeedFromAppState({ version: 2 });

  assert.equal(seed.mode, 'ja');
  assert.ok(seed.selectedLayoutIds.length > 0);
  assert.equal(seed.text, analyzerSampleText('ja', 'legacy'));
  assert.equal(seed.distance.defaults.geometry, 'row-staggered');
  assert.equal(seed.timing.defaults.useCalibration, false);
});
