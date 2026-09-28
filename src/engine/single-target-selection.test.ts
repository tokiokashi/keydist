import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_ANALYSIS_TARGET, type AnalysisTarget } from '#input/setup/index.ts';
import { effectiveSingleTarget, initialSingleTargetSelection, withSingleTarget } from './single-target-selection.ts';

const QWERTY: AnalysisTarget = { kind: 'layout', layoutId: 'qwerty' };
const COLEMAK: AnalysisTarget = { kind: 'layout', layoutId: 'colemak-dh' };
const SETUP_A: AnalysisTarget = { kind: 'setup', setupId: 'a' };

test('initialSingleTargetSelection: まだ選んでいない状態から始まる', () => {
  assert.deepEqual(initialSingleTargetSelection(), { target: undefined });
});

test('effectiveSingleTarget: まだ選んでいなければ既定の配列、選んだ後はその対象', () => {
  assert.equal(effectiveSingleTarget(initialSingleTargetSelection()), DEFAULT_ANALYSIS_TARGET);
  assert.deepEqual(effectiveSingleTarget(withSingleTarget(initialSingleTargetSelection(), SETUP_A)), SETUP_A);
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
