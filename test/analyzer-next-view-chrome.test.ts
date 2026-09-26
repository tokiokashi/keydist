import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_STATE_VERSION, analyzerSlicesFromUiState } from '../src/app-state.ts';
import { ANALYZER_INITIAL_LAYOUTS } from '../src/analyzer-ui-state-bootstrap.ts';
import { projectAnalysisConditionChrome } from '../src/features/analyzer-next/analysis-view-chrome.ts';
import {
  createAnalysisRuntime,
  type AnalysisRuntimeSource,
} from '../src/features/analyzer-next/runtime.ts';
import { createDefaultUiState } from '../src/ui-state.ts';

function source(): AnalysisRuntimeSource {
  const ui = createDefaultUiState({
    textPanelOpen: true,
    usePlaybackCalibration: false,
    selectedLayouts: ANALYZER_INITIAL_LAYOUTS,
  });
  return {
    appState: {
      version: APP_STATE_VERSION,
      ...analyzerSlicesFromUiState(ui),
    },
    userLayouts: [],
    userGeometryShapes: [],
    romajiSettings: { rules: [], assignments: {} },
  };
}

test('condition chrome shows effective Snapshot conditions and only layout deltas as overrides', () => {
  const runtime = createAnalysisRuntime(source());
  const layoutId = 'qwerty';

  let session = runtime.session.getSnapshot();
  let rows = projectAnalysisConditionChrome(
    session,
    { kind: 'single', mode: session.mode, layoutId },
    runtime.createReader(session),
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.layoutId, layoutId);
  assert.ok(rows[0]?.effective.some((item) => item.label === 'N' && item.value === '3'));
  assert.deepEqual(rows[0]?.overrides, []);

  runtime.commands.setDistanceCondition({
    scope: { kind: 'layout', layoutId },
    key: 'windowSize',
    value: 5,
  });

  session = runtime.session.getSnapshot();
  rows = projectAnalysisConditionChrome(
    session,
    { kind: 'single', mode: session.mode, layoutId },
    runtime.createReader(session),
  );

  assert.ok(rows[0]?.effective.some((item) => item.label === 'N' && item.value === '5'));
  assert.deepEqual(rows[0]?.overrides, [{
    label: 'windowSize',
    value: '5',
    overridden: true,
  }]);
});

test('condition chrome does not label a redundant override as a default delta', () => {
  const runtime = createAnalysisRuntime(source());
  const layoutId = 'qwerty';
  const initial = runtime.session.getSnapshot().distance.defaults.windowSize;

  runtime.commands.setDistanceCondition({
    scope: { kind: 'layout', layoutId },
    key: 'windowSize',
    value: initial,
  });

  const session = runtime.session.getSnapshot();
  const rows = projectAnalysisConditionChrome(
    session,
    { kind: 'single', mode: session.mode, layoutId },
    runtime.createReader(session),
  );

  assert.deepEqual(rows[0]?.overrides, []);
});
