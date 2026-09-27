import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzerSetSelectionFor,
  initialAnalyzerSetSelections,
  withAnalyzerSetSelection,
  withSetSelectionBaseline,
  withSetSelectionSetupIds,
} from './analyzer-set-selection.ts';

test('initialAnalyzerSetSelections: 空から始まる', () => {
  assert.deepEqual(initialAnalyzerSetSelections(), {});
});

test('analyzerSetSelectionFor: 未選択のAnalyzer idは空の集合・基準なしを返す', () => {
  const selection = analyzerSetSelectionFor(initialAnalyzerSetSelections(), 'comparison');
  assert.deepEqual(selection, { setupIds: [], baselineSetupId: undefined });
});

test('analyzerSetSelectionFor: 未選択時は毎回同じ参照を返す（無限レンダーループ対策）', () => {
  const state = initialAnalyzerSetSelections();
  const a = analyzerSetSelectionFor(state, 'comparison');
  const b = analyzerSetSelectionFor(state, 'n-sensitivity');
  assert.equal(a, b, '別のAnalyzer idでも、どちらも未選択なら同じ参照');
});

test('withSetSelectionSetupIds: 並び順が変われば別の値になる', () => {
  const state = withSetSelectionSetupIds({ setupIds: [], baselineSetupId: undefined }, ['a', 'b']);
  const reversed = withSetSelectionSetupIds(state, ['b', 'a']);
  assert.notEqual(state, reversed);
  assert.deepEqual(reversed.setupIds, ['b', 'a']);
});

test('withSetSelectionSetupIds: 同じ並びを渡せば同じ参照を返す（no-op判定）', () => {
  const state = withSetSelectionSetupIds({ setupIds: [], baselineSetupId: undefined }, ['a', 'b']);
  const again = withSetSelectionSetupIds(state, ['a', 'b']);
  assert.equal(state, again);
});

test('withSetSelectionSetupIds: 重複したSetup idは先に出た方だけ残して1つに畳む', () => {
  const state = withSetSelectionSetupIds({ setupIds: [], baselineSetupId: undefined }, ['a', 'b', 'a', 'c', 'b']);
  assert.deepEqual(state.setupIds, ['a', 'b', 'c']);
});

test('withSetSelectionSetupIds: 基準に選んでいたSetupが選択から外れたら、基準も一緒に外れる（不変条件）', () => {
  const withBaseline = withSetSelectionBaseline(
    withSetSelectionSetupIds({ setupIds: [], baselineSetupId: undefined }, ['a', 'b']),
    'a',
  );
  assert.equal(withBaseline.baselineSetupId, 'a');

  const removed = withSetSelectionSetupIds(withBaseline, ['b']);
  assert.deepEqual(removed.setupIds, ['b']);
  assert.equal(removed.baselineSetupId, undefined, '基準に選んでいたaが選択から外れたので基準も外れる');
});

test('withSetSelectionSetupIds: 基準に選んでいたSetupが選択に残っていれば、基準は保たれる', () => {
  const withBaseline = withSetSelectionBaseline(
    withSetSelectionSetupIds({ setupIds: [], baselineSetupId: undefined }, ['a', 'b']),
    'a',
  );
  const reordered = withSetSelectionSetupIds(withBaseline, ['b', 'a']);
  assert.equal(reordered.baselineSetupId, 'a');
});

test('withSetSelectionBaseline: 選択に含まれるSetupへは設定・解除できる', () => {
  const state = withSetSelectionSetupIds({ setupIds: [], baselineSetupId: undefined }, ['a', 'b']);
  const withBaseline = withSetSelectionBaseline(state, 'a');
  assert.equal(withBaseline.baselineSetupId, 'a');
  const cleared = withSetSelectionBaseline(withBaseline, undefined);
  assert.equal(cleared.baselineSetupId, undefined);
});

test('withSetSelectionBaseline: 選択に含まれないSetupを基準にしようとするとno-op（不変条件）', () => {
  const state = withSetSelectionSetupIds({ setupIds: [], baselineSetupId: undefined }, ['a', 'b']);
  const attempt = withSetSelectionBaseline(state, 'not-selected');
  assert.equal(attempt, state, '選択に無いSetupを基準にはできないので、同じ参照のまま（no-op）');
});

test('withSetSelectionBaseline: 同じ値なら同じ参照を返す（no-op判定）', () => {
  const state = withSetSelectionSetupIds({ setupIds: [], baselineSetupId: undefined }, ['a']);
  const again = withSetSelectionBaseline(state, undefined);
  assert.equal(state, again, '既定のundefinedへ「変更」しても中身は変わらないので同じ参照');
});

test('withAnalyzerSetSelection: Analyzer idごとに独立して書き込める', () => {
  const empty = initialAnalyzerSetSelections();
  const withComparison = withAnalyzerSetSelection(
    empty,
    'comparison',
    withSetSelectionSetupIds({ setupIds: [], baselineSetupId: undefined }, ['a', 'b']),
  );
  const withBoth = withAnalyzerSetSelection(
    withComparison,
    'n-sensitivity',
    withSetSelectionSetupIds({ setupIds: [], baselineSetupId: undefined }, ['c']),
  );
  assert.deepEqual(analyzerSetSelectionFor(withBoth, 'comparison').setupIds, ['a', 'b']);
  assert.deepEqual(analyzerSetSelectionFor(withBoth, 'n-sensitivity').setupIds, ['c']);
});

test('withAnalyzerSetSelection: 中身が同じ選択を書き込んでもno-op（同じ参照を返す）', () => {
  const selection = withSetSelectionSetupIds({ setupIds: [], baselineSetupId: undefined }, ['a']);
  const withOne = withAnalyzerSetSelection(initialAnalyzerSetSelections(), 'comparison', selection);
  const again = withAnalyzerSetSelection(withOne, 'comparison', { setupIds: ['a'], baselineSetupId: undefined });
  assert.equal(withOne, again);
});
