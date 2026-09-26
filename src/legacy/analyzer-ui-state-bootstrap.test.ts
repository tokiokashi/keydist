import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANALYZER_INITIAL_LAYOUTS,
  createAnalyzerUiStateBootstrap,
} from '#legacy/analyzer-ui-state-bootstrap.ts';

test('Analyzer bootstrap shares defaults and choices without DOM/storage', () => {
  const bootstrap = createAnalyzerUiStateBootstrap({
    builtInLayoutIds: {
      en: ['qwerty', 'dvorak'],
      ja: ['qwerty', 'naginata-v18'],
    },
    userLayoutIds: ['custom-a', 'custom-a'],
    textPanelOpen: false,
    usePlaybackCalibration: true,
  });

  assert.equal(bootstrap.defaults.ui.panels.text, false);
  assert.equal(bootstrap.defaults.ui.playback.useCalibration, true);
  assert.deepEqual(bootstrap.defaults.ui.layouts.selectedByMode.en, [...ANALYZER_INITIAL_LAYOUTS.en]);
  assert.deepEqual(bootstrap.choices.layouts.en, ['qwerty', 'dvorak', 'custom-a']);
  assert.deepEqual(bootstrap.choices.layouts.ja, ['qwerty', 'naginata-v18', 'custom-a']);
  assert.deepEqual(bootstrap.choices.samples, {
    en: ['default'],
    ja: ['modern', 'legacy'],
  });
});
