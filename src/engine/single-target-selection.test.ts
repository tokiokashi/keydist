import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_ANALYSIS_TARGET, type AnalysisTarget } from '#input/setup/index.ts';
import { initialMultiTargetSelection, withMultiBaseline, withMultiTargets } from './multi-target-selection.ts';
import { effectiveSingleTarget, initialSingleTargetSelection, withSingleTarget } from './single-target-selection.ts';

const QWERTY: AnalysisTarget = { kind: 'layout', layoutId: 'qwerty' };
const COLEMAK: AnalysisTarget = { kind: 'layout', layoutId: 'colemak-dh' };
const SETUP_A: AnalysisTarget = { kind: 'setup', setupId: 'a' };

const multiWithBaseline = (baseline: AnalysisTarget) =>
  withMultiBaseline(withMultiTargets(initialMultiTargetSelection(), [QWERTY, baseline]), baseline);

test('initialSingleTargetSelection: まだ選んでいない状態から始まる', () => {
  assert.deepEqual(initialSingleTargetSelection(), { target: undefined });
});

test('effectiveSingleTarget: まだ選んでおらず、Multiに基準も無ければ既定の配列', () => {
  assert.equal(effectiveSingleTarget(initialSingleTargetSelection(), initialMultiTargetSelection()), DEFAULT_ANALYSIS_TARGET);
  const multiWithoutBaseline = withMultiTargets(initialMultiTargetSelection(), [COLEMAK]);
  assert.equal(effectiveSingleTarget(initialSingleTargetSelection(), multiWithoutBaseline), DEFAULT_ANALYSIS_TARGET);
});

test('effectiveSingleTarget: まだ選んでいなければMultiの基準を使う', () => {
  assert.deepEqual(effectiveSingleTarget(initialSingleTargetSelection(), multiWithBaseline(SETUP_A)), SETUP_A);
});

test('effectiveSingleTarget: Singleで選んだ後はMultiの基準を見ない（連動させない）', () => {
  const single = withSingleTarget(initialSingleTargetSelection(), COLEMAK);
  assert.deepEqual(effectiveSingleTarget(single, multiWithBaseline(SETUP_A)), COLEMAK);
});

test('withSingleTarget: 同じ対象を書き込んでもno-op（同じ参照を返す）', () => {
  const withOne = withSingleTarget(initialSingleTargetSelection(), COLEMAK);
  assert.equal(withSingleTarget(withOne, { kind: 'layout', layoutId: 'colemak-dh' }), withOne);
});

test('withSingleTarget: 違う対象を書き込めば別の参照になる', () => {
  const withOne = withSingleTarget(initialSingleTargetSelection(), QWERTY);
  const changed = withSingleTarget(withOne, COLEMAK);
  assert.notEqual(changed, withOne);
  assert.deepEqual(changed.target, COLEMAK);
});

test('withSingleTarget: 未選択から既定と同じ対象を選んでも「選んだ」として書き込む', () => {
  const chosen = withSingleTarget(initialSingleTargetSelection(), DEFAULT_ANALYSIS_TARGET);
  assert.deepEqual(chosen.target, DEFAULT_ANALYSIS_TARGET);
});
