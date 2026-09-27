import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initialComparisonSelection,
  withComparisonBaselineSetupId,
  withComparisonSetupIds,
} from './comparison-selection.ts';

test('initialComparisonSelection: 空の集合・基準なしから始まる', () => {
  assert.deepEqual(initialComparisonSelection(), { setupIds: [], baselineSetupId: undefined });
});

test('withComparisonSetupIds: 並び順が変われば別の値になる', () => {
  const state = initialComparisonSelection();
  const forward = withComparisonSetupIds(state, ['a', 'b']);
  const reversed = withComparisonSetupIds(forward, ['b', 'a']);
  assert.notEqual(forward, reversed);
  assert.deepEqual(reversed.setupIds, ['b', 'a']);
});

test('withComparisonSetupIds: 同じ並びを渡せば同じ参照を返す（no-op判定）', () => {
  const state = withComparisonSetupIds(initialComparisonSelection(), ['a', 'b']);
  const again = withComparisonSetupIds(state, ['a', 'b']);
  assert.equal(state, again);
});

test('withComparisonBaselineSetupId: 基準を設定・解除できる', () => {
  const state = withComparisonSetupIds(initialComparisonSelection(), ['a', 'b']);
  const withBaseline = withComparisonBaselineSetupId(state, 'a');
  assert.equal(withBaseline.baselineSetupId, 'a');
  const cleared = withComparisonBaselineSetupId(withBaseline, undefined);
  assert.equal(cleared.baselineSetupId, undefined);
});

test('withComparisonBaselineSetupId: 同じ値なら同じ参照を返す（no-op判定）', () => {
  const state = withComparisonSetupIds(initialComparisonSelection(), ['a']);
  const again = withComparisonBaselineSetupId(state, undefined);
  assert.equal(state, again, '既定のundefinedへ「変更」しても中身は変わらないので同じ参照');
});
