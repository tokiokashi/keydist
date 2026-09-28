import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnalysisTarget } from '#input/setup/index.ts';
import {
  analyzerSetSelectionFor,
  initialAnalyzerSetSelections,
  withAnalyzerSetSelection,
  withSetSelectionBaseline,
  withSetSelectionTargets,
} from './analyzer-set-selection.ts';

const A: AnalysisTarget = { kind: 'setup', setupId: 'a' };
const B: AnalysisTarget = { kind: 'setup', setupId: 'b' };
const C: AnalysisTarget = { kind: 'layout', layoutId: 'c' };
const NOT_SELECTED: AnalysisTarget = { kind: 'setup', setupId: 'not-selected' };

test('initialAnalyzerSetSelections: 空から始まる', () => {
  assert.deepEqual(initialAnalyzerSetSelections(), {});
});

test('analyzerSetSelectionFor: 未選択のAnalyzer idは空の集合・基準なしを返す', () => {
  const selection = analyzerSetSelectionFor(initialAnalyzerSetSelections(), 'comparison');
  assert.deepEqual(selection, { targets: [], baseline: undefined });
});

test('analyzerSetSelectionFor: 未選択時は毎回同じ参照を返す（無限レンダーループ対策）', () => {
  const state = initialAnalyzerSetSelections();
  const a = analyzerSetSelectionFor(state, 'comparison');
  const b = analyzerSetSelectionFor(state, 'n-sensitivity');
  assert.equal(a, b, '別のAnalyzer idでも、どちらも未選択なら同じ参照');
});

test('withSetSelectionTargets: 並び順が変われば別の値になる', () => {
  const state = withSetSelectionTargets({ targets: [], baseline: undefined }, [A, B]);
  const reversed = withSetSelectionTargets(state, [B, A]);
  assert.notEqual(state, reversed);
  assert.deepEqual(reversed.targets, [B, A]);
});

test('withSetSelectionTargets: 同じ並びを渡せば同じ参照を返す（no-op判定）', () => {
  const state = withSetSelectionTargets({ targets: [], baseline: undefined }, [A, B]);
  const again = withSetSelectionTargets(state, [A, B]);
  assert.equal(state, again);
});

test('withSetSelectionTargets: 重複した対象は先に出た方だけ残して1つに畳む', () => {
  const state = withSetSelectionTargets({ targets: [], baseline: undefined }, [A, B, A, C, B]);
  assert.deepEqual(state.targets, [A, B, C]);
});

test('withSetSelectionTargets: 基準に選んでいた対象が選択から外れたら、基準も一緒に外れる（不変条件）', () => {
  const withBaseline = withSetSelectionBaseline(
    withSetSelectionTargets({ targets: [], baseline: undefined }, [A, B]),
    A,
  );
  assert.equal(withBaseline.baseline, A);

  const removed = withSetSelectionTargets(withBaseline, [B]);
  assert.deepEqual(removed.targets, [B]);
  assert.equal(removed.baseline, undefined, '基準に選んでいたAが選択から外れたので基準も外れる');
});

test('withSetSelectionTargets: 基準に選んでいた対象が選択に残っていれば、基準は保たれる', () => {
  const withBaseline = withSetSelectionBaseline(
    withSetSelectionTargets({ targets: [], baseline: undefined }, [A, B]),
    A,
  );
  const reordered = withSetSelectionTargets(withBaseline, [B, A]);
  assert.equal(reordered.baseline, A);
});

test('withSetSelectionBaseline: 選択に含まれる対象へは設定・解除できる', () => {
  const state = withSetSelectionTargets({ targets: [], baseline: undefined }, [A, B]);
  const withBaseline = withSetSelectionBaseline(state, A);
  assert.equal(withBaseline.baseline, A);
  const cleared = withSetSelectionBaseline(withBaseline, undefined);
  assert.equal(cleared.baseline, undefined);
});

test('withSetSelectionBaseline: 選択に含まれない対象を基準にしようとするとno-op（不変条件）', () => {
  const state = withSetSelectionTargets({ targets: [], baseline: undefined }, [A, B]);
  const attempt = withSetSelectionBaseline(state, NOT_SELECTED);
  assert.equal(attempt, state, '選択に無い対象を基準にはできないので、同じ参照のまま（no-op）');
});

test('withSetSelectionBaseline: 同じ値なら同じ参照を返す（no-op判定）', () => {
  const state = withSetSelectionTargets({ targets: [], baseline: undefined }, [A]);
  const again = withSetSelectionBaseline(state, undefined);
  assert.equal(state, again, '既定のundefinedへ「変更」しても中身は変わらないので同じ参照');
});

test('withAnalyzerSetSelection: Analyzer idごとに独立して書き込める', () => {
  const empty = initialAnalyzerSetSelections();
  const withComparison = withAnalyzerSetSelection(
    empty,
    'comparison',
    withSetSelectionTargets({ targets: [], baseline: undefined }, [A, B]),
  );
  const withBoth = withAnalyzerSetSelection(
    withComparison,
    'n-sensitivity',
    withSetSelectionTargets({ targets: [], baseline: undefined }, [C]),
  );
  assert.deepEqual(analyzerSetSelectionFor(withBoth, 'comparison').targets, [A, B]);
  assert.deepEqual(analyzerSetSelectionFor(withBoth, 'n-sensitivity').targets, [C]);
});

test('withAnalyzerSetSelection: 中身が同じ選択を書き込んでもno-op（同じ参照を返す）', () => {
  const selection = withSetSelectionTargets({ targets: [], baseline: undefined }, [A]);
  const withOne = withAnalyzerSetSelection(initialAnalyzerSetSelections(), 'comparison', selection);
  const again = withAnalyzerSetSelection(withOne, 'comparison', { targets: [A], baseline: undefined });
  assert.equal(withOne, again);
});
