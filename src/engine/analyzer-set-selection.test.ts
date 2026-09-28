import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnalysisTarget } from '#input/setup/index.ts';
import {
  analyzerSetSelectionFor,
  assignColorSlots,
  initialAnalyzerSetSelections,
  initialSetSelection,
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
  assert.deepEqual(selection, { targets: [], baseline: undefined, colorSlots: [] });
});

test('analyzerSetSelectionFor: 未選択時は毎回同じ参照を返す（無限レンダーループ対策）', () => {
  const state = initialAnalyzerSetSelections();
  const a = analyzerSetSelectionFor(state, 'comparison');
  const b = analyzerSetSelectionFor(state, 'n-sensitivity');
  assert.equal(a, b, '別のAnalyzer idでも、どちらも未選択なら同じ参照');
});

test('withSetSelectionTargets: 並び順が変われば別の値になる', () => {
  const state = withSetSelectionTargets(initialSetSelection(), [A, B]);
  const reversed = withSetSelectionTargets(state, [B, A]);
  assert.notEqual(state, reversed);
  assert.deepEqual(reversed.targets, [B, A]);
});

test('withSetSelectionTargets: 同じ並びを渡せば同じ参照を返す（no-op判定）', () => {
  const state = withSetSelectionTargets(initialSetSelection(), [A, B]);
  const again = withSetSelectionTargets(state, [A, B]);
  assert.equal(state, again);
});

test('withSetSelectionTargets: 重複した対象は先に出た方だけ残して1つに畳む', () => {
  const state = withSetSelectionTargets(initialSetSelection(), [A, B, A, C, B]);
  assert.deepEqual(state.targets, [A, B, C]);
});

test('withSetSelectionTargets: 基準に選んでいた対象が選択から外れたら、基準も一緒に外れる（不変条件）', () => {
  const withBaseline = withSetSelectionBaseline(
    withSetSelectionTargets(initialSetSelection(), [A, B]),
    A,
  );
  assert.equal(withBaseline.baseline, A);

  const removed = withSetSelectionTargets(withBaseline, [B]);
  assert.deepEqual(removed.targets, [B]);
  assert.equal(removed.baseline, undefined, '基準に選んでいたAが選択から外れたので基準も外れる');
});

test('withSetSelectionTargets: 基準に選んでいた対象が選択に残っていれば、基準は保たれる', () => {
  const withBaseline = withSetSelectionBaseline(
    withSetSelectionTargets(initialSetSelection(), [A, B]),
    A,
  );
  const reordered = withSetSelectionTargets(withBaseline, [B, A]);
  assert.equal(reordered.baseline, A);
});

test('withSetSelectionBaseline: 選択に含まれる対象へは設定・解除できる', () => {
  const state = withSetSelectionTargets(initialSetSelection(), [A, B]);
  const withBaseline = withSetSelectionBaseline(state, A);
  assert.equal(withBaseline.baseline, A);
  const cleared = withSetSelectionBaseline(withBaseline, undefined);
  assert.equal(cleared.baseline, undefined);
});

test('withSetSelectionBaseline: 選択に含まれない対象を基準にしようとするとno-op（不変条件）', () => {
  const state = withSetSelectionTargets(initialSetSelection(), [A, B]);
  const attempt = withSetSelectionBaseline(state, NOT_SELECTED);
  assert.equal(attempt, state, '選択に無い対象を基準にはできないので、同じ参照のまま（no-op）');
});

test('withSetSelectionBaseline: 同じ値なら同じ参照を返す（no-op判定）', () => {
  const state = withSetSelectionTargets(initialSetSelection(), [A]);
  const again = withSetSelectionBaseline(state, undefined);
  assert.equal(state, again, '既定のundefinedへ「変更」しても中身は変わらないので同じ参照');
});

test('withAnalyzerSetSelection: Analyzer idごとに独立して書き込める', () => {
  const empty = initialAnalyzerSetSelections();
  const withComparison = withAnalyzerSetSelection(
    empty,
    'comparison',
    withSetSelectionTargets(initialSetSelection(), [A, B]),
  );
  const withBoth = withAnalyzerSetSelection(
    withComparison,
    'n-sensitivity',
    withSetSelectionTargets(initialSetSelection(), [C]),
  );
  assert.deepEqual(analyzerSetSelectionFor(withBoth, 'comparison').targets, [A, B]);
  assert.deepEqual(analyzerSetSelectionFor(withBoth, 'n-sensitivity').targets, [C]);
});

test('withAnalyzerSetSelection: 中身が同じ選択を書き込んでもno-op（同じ参照を返す）', () => {
  const selection = withSetSelectionTargets(initialSetSelection(), [A]);
  const withOne = withAnalyzerSetSelection(initialAnalyzerSetSelections(), 'comparison', selection);
  const again = withAnalyzerSetSelection(withOne, 'comparison', { targets: [A], baseline: undefined, colorSlots: [0] });
  assert.equal(withOne, again);
});

// 色の番号（#601「色は表示中の集合の中でパレットから配る」）

test('withSetSelectionTargets: 色の番号は加えた順に0から配る', () => {
  let state = withSetSelectionTargets(initialSetSelection(), [A]);
  state = withSetSelectionTargets(state, [A, B]);
  state = withSetSelectionTargets(state, [A, B, C]);
  assert.deepEqual(state.colorSlots, [0, 1, 2]);
});

test('withSetSelectionTargets: 1つ外しても他の対象の番号は動かず、空いた番号は次に加えた対象が使う', () => {
  const state = withSetSelectionTargets(initialSetSelection(), [A, B, C]);
  const removed = withSetSelectionTargets(state, [A, C]);
  assert.deepEqual(removed.colorSlots, [0, 2], 'Cは2番のまま（前へ詰めない）');
  const added = withSetSelectionTargets(removed, [A, C, NOT_SELECTED]);
  assert.deepEqual(added.colorSlots, [0, 2, 1], '空いた1番を次に加えた対象が使う');
});

test('withSetSelectionTargets: 並び替えても番号は対象に付いて動く', () => {
  const state = withSetSelectionTargets(initialSetSelection(), [A, B, C]);
  const reordered = withSetSelectionTargets(state, [C, A, B]);
  assert.deepEqual(reordered.colorSlots, [2, 0, 1]);
});

test('withSetSelectionTargets: 外して加え直した対象は、その時点で空いている最小の番号になる', () => {
  const state = withSetSelectionTargets(initialSetSelection(), [A, B]);
  const removed = withSetSelectionTargets(state, [B]);
  const readded = withSetSelectionTargets(removed, [B, A]);
  assert.deepEqual(readded.colorSlots, [1, 0]);
});

test('assignColorSlots: 重複・不正な番号は持っていないものとして配り直す', () => {
  const known = new Map([['setup:a', 1], ['setup:b', 1], ['layout:c', -1]]);
  assert.deepEqual(assignColorSlots([A, B, C], known), [1, 0, 2]);
});
