import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnalysisTarget } from '#input/setup/index.ts';
import {
  analyzerTargetSelectionFor,
  initialAnalyzerTargetSelections,
  withAnalyzerTargetSelection,
} from './analyzer-target-selection.ts';

const QWERTY: AnalysisTarget = { kind: 'layout', layoutId: 'qwerty' };
const COLEMAK: AnalysisTarget = { kind: 'layout', layoutId: 'colemak-dh' };
const SETUP_A: AnalysisTarget = { kind: 'setup', setupId: 'a' };

test('initialAnalyzerTargetSelections: 空から始まる', () => {
  assert.deepEqual(initialAnalyzerTargetSelections(), {});
});

test('analyzerTargetSelectionFor: 未選択のAnalyzer idはfallbackを返す', () => {
  const state = initialAnalyzerTargetSelections();
  assert.deepEqual(analyzerTargetSelectionFor(state, 'bigram-flow', QWERTY), QWERTY);
});

test('withAnalyzerTargetSelection → analyzerTargetSelectionFor: 書き込んだ対象がそのまま読める', () => {
  const state = withAnalyzerTargetSelection(initialAnalyzerTargetSelections(), 'bigram-flow', COLEMAK);
  assert.deepEqual(analyzerTargetSelectionFor(state, 'bigram-flow', QWERTY), COLEMAK);
});

test('withAnalyzerTargetSelection: Analyzer idごとに独立して書き込める', () => {
  const withA = withAnalyzerTargetSelection(initialAnalyzerTargetSelections(), 'bigram-flow', COLEMAK);
  const withBoth = withAnalyzerTargetSelection(withA, 'other-analyzer', SETUP_A);
  assert.deepEqual(analyzerTargetSelectionFor(withBoth, 'bigram-flow', QWERTY), COLEMAK);
  assert.deepEqual(analyzerTargetSelectionFor(withBoth, 'other-analyzer', QWERTY), SETUP_A);
});

test('withAnalyzerTargetSelection: 同じ対象を書き込んでもno-op（同じ参照を返す）', () => {
  const withOne = withAnalyzerTargetSelection(initialAnalyzerTargetSelections(), 'bigram-flow', COLEMAK);
  const again = withAnalyzerTargetSelection(withOne, 'bigram-flow', { kind: 'layout', layoutId: 'colemak-dh' });
  assert.equal(withOne, again);
});

test('withAnalyzerTargetSelection: 違う対象を書き込めば別の参照になる', () => {
  const withOne = withAnalyzerTargetSelection(initialAnalyzerTargetSelections(), 'bigram-flow', QWERTY);
  const changed = withAnalyzerTargetSelection(withOne, 'bigram-flow', COLEMAK);
  assert.notEqual(withOne, changed);
  assert.deepEqual(analyzerTargetSelectionFor(changed, 'bigram-flow', QWERTY), COLEMAK);
});
