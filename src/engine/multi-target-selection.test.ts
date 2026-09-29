import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnalysisTarget } from '#input/setup/index.ts';
import {
  assignColorSlots,
  COLOR_SLOT_COUNT,
  initialMultiTargetSelection,
  withMultiBaseline,
  effectiveMultiBaseline,
  withMultiTargets,
} from './multi-target-selection.ts';

const A: AnalysisTarget = { kind: 'setup', setupId: 'a' };
const B: AnalysisTarget = { kind: 'setup', setupId: 'b' };
const C: AnalysisTarget = { kind: 'layout', layoutId: 'c' };
const NOT_SELECTED: AnalysisTarget = { kind: 'setup', setupId: 'not-selected' };

test('initialMultiTargetSelection: 空の集合・基準なしから始まる', () => {
  assert.deepEqual(initialMultiTargetSelection(), { targets: [], baseline: undefined, colorSlots: [] });
});

test('withMultiTargets: 並び順が変われば別の値になる', () => {
  const state = withMultiTargets(initialMultiTargetSelection(), [A, B]);
  const reversed = withMultiTargets(state, [B, A]);
  assert.notEqual(state, reversed);
  assert.deepEqual(reversed.targets, [B, A]);
});

test('withMultiTargets: 同じ並びを渡せば同じ参照を返す（no-op判定）', () => {
  const state = withMultiTargets(initialMultiTargetSelection(), [A, B]);
  const again = withMultiTargets(state, [A, B]);
  assert.equal(state, again);
});

test('withMultiTargets: 重複した対象は先に出た方だけ残して1つに畳む', () => {
  const state = withMultiTargets(initialMultiTargetSelection(), [A, B, A, C, B]);
  assert.deepEqual(state.targets, [A, B, C]);
});

test('withMultiTargets: 基準の対象を外すと効く基準はなしになり、記録は残る。付け直すと戻る', () => {
  const withBaseline = withMultiBaseline(
    withMultiTargets(initialMultiTargetSelection(), [A, B]),
    A,
  );
  assert.equal(effectiveMultiBaseline(withBaseline), A);

  const removed = withMultiTargets(withBaseline, [B]);
  assert.deepEqual(removed.targets, [B]);
  assert.equal(effectiveMultiBaseline(removed), undefined, '集合に無い間は基準なし');
  assert.equal(removed.baseline, A, '記録は消さない');

  const restored = withMultiTargets(removed, [B, A]);
  assert.equal(effectiveMultiBaseline(restored), A, '付け直すと基準が戻る');
});

test('withMultiBaseline: 外している間に別の基準を選ぶと記録が上書きされ、元の配列を付け直しても戻らない', () => {
  const withBaseline = withMultiBaseline(withMultiTargets(initialMultiTargetSelection(), [A, B]), A);
  const removed = withMultiTargets(withBaseline, [B]);
  const overwritten = withMultiBaseline(removed, B);
  assert.equal(overwritten.baseline, B);
  const restored = withMultiTargets(overwritten, [A, B]);
  assert.equal(effectiveMultiBaseline(restored), B);
});

test('withMultiTargets: 基準に選んでいた対象が選択に残っていれば、基準は保たれる', () => {
  const withBaseline = withMultiBaseline(
    withMultiTargets(initialMultiTargetSelection(), [A, B]),
    A,
  );
  const reordered = withMultiTargets(withBaseline, [B, A]);
  assert.equal(effectiveMultiBaseline(reordered), A);
});

test('withMultiBaseline: 選択に含まれる対象へは設定・解除できる', () => {
  const state = withMultiTargets(initialMultiTargetSelection(), [A, B]);
  const withBaseline = withMultiBaseline(state, A);
  assert.equal(withBaseline.baseline, A);
  const cleared = withMultiBaseline(withBaseline, undefined);
  assert.equal(cleared.baseline, undefined);
  assert.equal(effectiveMultiBaseline(cleared), undefined);
});

test('withMultiBaseline: 選択に含まれない対象を基準にしようとするとno-op（不変条件）', () => {
  const state = withMultiTargets(initialMultiTargetSelection(), [A, B]);
  const attempt = withMultiBaseline(state, NOT_SELECTED);
  assert.equal(attempt, state, '選択に無い対象を基準にはできないので、同じ参照のまま（no-op）');
});

test('withMultiBaseline: 同じ値なら同じ参照を返す（no-op判定）', () => {
  const state = withMultiTargets(initialMultiTargetSelection(), [A]);
  const again = withMultiBaseline(state, undefined);
  assert.equal(state, again, '既定のundefinedへ「変更」しても中身は変わらないので同じ参照');
});

// 色の番号（#601「色は表示中の集合の中でパレットから配る」）

test('withMultiTargets: 色の番号は加えた順に0から配る', () => {
  let state = withMultiTargets(initialMultiTargetSelection(), [A]);
  state = withMultiTargets(state, [A, B]);
  state = withMultiTargets(state, [A, B, C]);
  assert.deepEqual(state.colorSlots, [0, 1, 2]);
});

test('withMultiTargets: 1つ外しても他の対象の番号は動かず、空いた番号は次に加えた対象が使う', () => {
  const state = withMultiTargets(initialMultiTargetSelection(), [A, B, C]);
  const removed = withMultiTargets(state, [A, C]);
  assert.deepEqual(removed.colorSlots, [0, 2], 'Cは2番のまま（前へ詰めない）');
  const added = withMultiTargets(removed, [A, C, NOT_SELECTED]);
  assert.deepEqual(added.colorSlots, [0, 2, 1], '空いた1番を次に加えた対象が使う');
});

test('withMultiTargets: 並び替えても番号は対象に付いて動く', () => {
  const state = withMultiTargets(initialMultiTargetSelection(), [A, B, C]);
  const reordered = withMultiTargets(state, [C, A, B]);
  assert.deepEqual(reordered.colorSlots, [2, 0, 1]);
});

test('withMultiTargets: 外して加え直した対象は、その時点で空いている最小の番号になる', () => {
  const state = withMultiTargets(initialMultiTargetSelection(), [A, B]);
  const removed = withMultiTargets(state, [B]);
  const readded = withMultiTargets(removed, [B, A]);
  assert.deepEqual(readded.colorSlots, [1, 0]);
});

test('assignColorSlots: 重複・不正な番号は持っていないものとして配り直す', () => {
  const known = new Map([['setup:a', 1], ['setup:b', 1], ['layout:c', -1]]);
  assert.deepEqual(assignColorSlots([A, B, C], known), [1, 0, 2]);
});

const layouts = (n: number): AnalysisTarget[] => Array.from({ length: n }, (_, i) => ({ kind: 'layout', layoutId: `l${i}` }));

test('withMultiTargets: 番号は常に0以上COLOR_SLOT_COUNT未満。超えて並べた時だけ重なり、偏らない', () => {
  const state = withMultiTargets(initialMultiTargetSelection(), layouts(COLOR_SLOT_COUNT + 1));
  assert.ok(state.colorSlots.every((slot) => slot >= 0 && slot < COLOR_SLOT_COUNT));
  assert.equal(new Set(state.colorSlots).size, COLOR_SLOT_COUNT);
});

test('withMultiTargets: 13件並べてから7件に減らすと色が全部異なる', () => {
  const all = layouts(13);
  const state = withMultiTargets(initialMultiTargetSelection(), all);
  const reduced = withMultiTargets(state, [all[0]!, ...all.slice(7)]);
  assert.equal(reduced.targets.length, 7);
  assert.equal(new Set(reduced.colorSlots).size, 7);
  // 重なっていなかった対象（T0・T7〜T11）の番号は動かない。
  assert.deepEqual(reduced.colorSlots.slice(0, 6), [state.colorSlots[0], ...state.colorSlots.slice(7, 12)]);
});

test('withMultiTargets: 13件から12件へ減らしても重なりは残らない', () => {
  const all = layouts(13);
  const state = withMultiTargets(initialMultiTargetSelection(), all);
  const reduced = withMultiTargets(state, all.filter((_, i) => i !== 5));
  assert.equal(new Set(reduced.colorSlots).size, 12);
});

test('assignColorSlots: 範囲外の番号は持っていないものとして配り直す', () => {
  const known = new Map([['setup:a', 0], ['setup:b', COLOR_SLOT_COUNT]]);
  assert.deepEqual(assignColorSlots([A, B], known), [0, 1]);
});
