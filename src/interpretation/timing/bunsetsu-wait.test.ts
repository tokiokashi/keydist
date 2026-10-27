import assert from 'node:assert/strict';
import test from 'node:test';
import { planBunsetsuWaits, sumWaitGaps } from './bunsetsu-wait.ts';

/** 1文字を1ステップで打つ並び。`covered`に無い位置は打てずに読み飛ばされた文字。 */
function strokesOf(covered: readonly number[]) {
  return covered.map((at) => ({ kanaStart: at, kanaEnd: at }));
}

test('打てる文字の位置の区切り: その文字を覆う最初のステップの前に足す', () => {
  const plan = planBunsetsuWaits(4, strokesOf([0, 1, 2, 3]), [2], 400);
  assert.deepEqual(plan.gapMs, [0, 0, 400, 0, 0]);
  assert.equal(plan.hasBoundary, true);
});

test('区切りの位置の文字を複数のステップで打つ時は、最初のステップの前に足す', () => {
  const plan = planBunsetsuWaits(
    3,
    [
      { kanaStart: 0, kanaEnd: 0 },
      { kanaStart: 1, kanaEnd: 1 },
      { kanaStart: 1, kanaEnd: 1 },
      { kanaStart: 2, kanaEnd: 2 },
    ],
    [1],
    400,
  );
  assert.deepEqual(plan.gapMs, [0, 400, 0, 0, 0]);
});

test('1つの入力単位が区切りの両側の文字を覆う時は、その入力単位の最初のステップの前に足す', () => {
  const plan = planBunsetsuWaits(
    4,
    [
      { kanaStart: 0, kanaEnd: 0 },
      { kanaStart: 1, kanaEnd: 2 },
      { kanaStart: 3, kanaEnd: 3 },
    ],
    [2],
    400,
  );
  assert.deepEqual(plan.gapMs, [0, 400, 0, 0]);
});

test('打てない文字の位置の区切り: 直前の入力単位と直後の入力単位の間に足す', () => {
  const plan = planBunsetsuWaits(4, strokesOf([0, 1, 3]), [2], 400);
  assert.deepEqual(plan.gapMs, [0, 0, 400, 0]);
});

test('打てない文字が最後まで続く位置の区切りは、最後のステップの後に足す', () => {
  const plan = planBunsetsuWaits(4, strokesOf([0, 1]), [2], 400);
  assert.deepEqual(plan.gapMs, [0, 0, 400]);
});

test('区切りが続く時は、それぞれの待機をそのまま足す', () => {
  // 位置2と3の文字を打てない: どちらも位置4の文字を打つステップの前に入る
  const plan = planBunsetsuWaits(5, strokesOf([0, 1, 4]), [2, 3], 400);
  assert.deepEqual(plan.gapMs, [0, 0, 800, 0]);
});

test('待機が0・区切りを受け取っていない時・範囲外の区切りだけの時は何も足さない', () => {
  const strokes = strokesOf([0, 1, 2, 3]);
  const zero = [0, 0, 0, 0, 0];
  assert.deepEqual(planBunsetsuWaits(4, strokes, [2], 0), { gapMs: zero, hasBoundary: false });
  assert.deepEqual(planBunsetsuWaits(4, strokes, undefined, 400), { gapMs: zero, hasBoundary: false });
  assert.deepEqual(planBunsetsuWaits(4, strokes, [], 400), { gapMs: zero, hasBoundary: false });
  // 0と末尾は区切りに含まない
  assert.deepEqual(planBunsetsuWaits(4, strokes, [0, 4, 9, -1], 400), { gapMs: zero, hasBoundary: false });
});

test('同じ位置の区切りが重なっても1回だけ足す', () => {
  assert.deepEqual(planBunsetsuWaits(4, strokesOf([0, 1, 2, 3]), [2, 2], 400).gapMs, [0, 0, 400, 0, 0]);
});

test('待機の列は間ごとに合計する', () => {
  assert.deepEqual(sumWaitGaps([0, 300, 0], [0, 400, 100]), [0, 700, 100]);
});
