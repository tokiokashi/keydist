import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_STATE_VERSION, analyzerSlicesFromUiState } from '#app/state/app-state.ts';
import { ANALYZER_INITIAL_LAYOUTS } from '#legacy/analyzer-ui-state-bootstrap.ts';
import type { ModeId } from '#legacy/layout-selection.ts';
import {
  analysisDomainCatalogSourceFromRuntimeSource,
  createAnalysisRuntime,
  type AnalysisRuntimeSource,
} from '../src/features/analyzer-next/runtime.ts';
import { createDefaultUiState } from '#legacy/ui-state.ts';

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

test('Analysis runtime composes one Session, catalog, Snapshot cache and coherent reader', () => {
  const runtime = createAnalysisRuntime(source());
  const state = runtime.session.getSnapshot();
  const layoutId = state.selectedLayoutIds[0]!;
  const reader = runtime.createReader(state);
  const read = reader.get(layoutId);

  assert.ok(read);
  assert.equal(read.layoutId, layoutId);
  assert.equal(read.revision.target, state.revisions.target);
  assert.equal(read.revision.distance, state.revisions.distance);
  assert.equal(runtime.snapshots.cacheSize(), 1);
});

test('explicit add-selected-layout command never lets a URL binding change mode implicitly', () => {
  const runtime = createAnalysisRuntime(source());
  const initial = runtime.session.getSnapshot();
  const otherMode: ModeId = initial.mode === 'ja' ? 'en' : 'ja';

  runtime.commands.addSelectedLayout(otherMode, 'dvorak');
  assert.deepEqual(
    runtime.session.getSnapshot().selectedLayoutIds,
    initial.selectedLayoutIds,
  );
  assert.equal(runtime.session.getSnapshot().mode, initial.mode);

  runtime.commands.addSelectedLayout(initial.mode, 'dvorak');
  assert.ok(runtime.session.getSnapshot().selectedLayoutIds.includes('dvorak'));
});

test('runtime sanitizes corrupt persisted Analyzer slices before creating the Session', () => {
  const bad = source();
  const appState = structuredClone(bad.appState) as any;
  appState.analyzer.input.mode = 'broken';
  appState.analyzer.layouts.selectedByMode.ja = ['deleted-layout'];
  appState.conditions.defaults.windowSize = 999;
  appState.playback.speedMultiplier = -10;

  const runtime = createAnalysisRuntime({ ...bad, appState });
  const state = runtime.session.getSnapshot();

  assert.equal(state.mode, 'ja');
  assert.deepEqual(state.selectedLayoutIds, ANALYZER_INITIAL_LAYOUTS.ja);
  assert.notEqual(state.distance.defaults.windowSize, 999);
  assert.notEqual(state.timing.defaults.speedMultiplier, -10);
});


test('runtime replaces Domain catalog source without resetting Session and produces a new Snapshot key', () => {
  const initialSource = source();
  const runtime = createAnalysisRuntime(initialSource);
  const initialSession = runtime.session.getSnapshot();
  const layoutId = 'qwerty';
  const before = runtime.createReader(initialSession).get(layoutId);

  assert.ok(before);
  runtime.session.setText('Session survives domain refresh');
  const sessionBeforeRefresh = runtime.session.getSnapshot();
  const revisionBefore = runtime.catalog.getRevision();

  const nextSource: AnalysisRuntimeSource = {
    ...initialSource,
    romajiSettings: {
      rules: [],
      assignments: { qwerty: 'azik' },
    },
  };
  assert.equal(
    runtime.catalog.replaceSource(analysisDomainCatalogSourceFromRuntimeSource(nextSource)),
    true,
  );

  const sessionAfterRefresh = runtime.session.getSnapshot();
  const after = runtime.createReader(sessionAfterRefresh).get(layoutId);

  assert.equal(sessionAfterRefresh.text, 'Session survives domain refresh');
  assert.equal(sessionAfterRefresh.revisions.target, sessionBeforeRefresh.revisions.target);
  assert.equal(sessionAfterRefresh.revisions.distance, sessionBeforeRefresh.revisions.distance);
  assert.equal(runtime.catalog.getRevision(), revisionBefore + 1);
  assert.ok(after);
  assert.notEqual(after.calculationKey, before.calculationKey);
  assert.equal(after.snapshot.romajiRuleId, 'azik');
});

test('replacing Domain catalog with equivalent source is a no-op', () => {
  const initialSource = source();
  const runtime = createAnalysisRuntime(initialSource);
  let notifications = 0;
  runtime.catalog.subscribe(() => { notifications += 1; });

  assert.equal(
    runtime.catalog.replaceSource(analysisDomainCatalogSourceFromRuntimeSource(initialSource)),
    false,
  );
  assert.equal(runtime.catalog.getRevision(), 0);
  assert.equal(notifications, 0);
});
