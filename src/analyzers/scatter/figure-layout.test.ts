import assert from 'node:assert/strict';
import test from 'node:test';
import { FIGURE_GAP, FIGURE_MIN_WIDTH, scatterColumnCount } from './figure-layout.ts';

/** 列がちょうど`columns`本入る最小の幅。 */
function widthFor(columns: number): number {
  return columns * FIGURE_MIN_WIDTH + (columns - 1) * FIGURE_GAP;
}

test('列の数: 自動は、図の幅が下限を割らない範囲で最も多い列にする（最大3）', () => {
  assert.equal(scatterColumnCount('auto', widthFor(1), 5), 1);
  assert.equal(scatterColumnCount('auto', widthFor(2) - 1, 5), 1);
  assert.equal(scatterColumnCount('auto', widthFor(2), 5), 2);
  assert.equal(scatterColumnCount('auto', widthFor(3) - 1, 5), 2);
  assert.equal(scatterColumnCount('auto', widthFor(3), 5), 3);
  assert.equal(scatterColumnCount('auto', widthFor(4), 5), 3);
  assert.equal(scatterColumnCount('auto', 5000, 5), 3);
});

test('列の数: 数を選んだ時は、その数を上限にし、幅が足りなければ図の幅が下限を割らないところまで減らす', () => {
  assert.equal(scatterColumnCount('1', widthFor(3), 5), 1);
  assert.equal(scatterColumnCount('2', widthFor(3), 5), 2);
  assert.equal(scatterColumnCount('3', widthFor(3), 5), 3);
  assert.equal(scatterColumnCount('3', widthFor(2), 5), 2);
  assert.equal(scatterColumnCount('3', widthFor(1), 5), 1);
  assert.equal(scatterColumnCount('2', widthFor(1), 5), 1);
});

test('列の数: 図が列の数より少ない時は、図の数にする', () => {
  assert.equal(scatterColumnCount('auto', widthFor(3), 2), 2);
  assert.equal(scatterColumnCount('3', widthFor(3), 2), 2);
  assert.equal(scatterColumnCount('auto', widthFor(3), 1), 1);
  assert.equal(scatterColumnCount('auto', widthFor(3), 0), 1);
});

test('列の数: 幅が下限1枚ぶんに満たなくても1列は出し、まだ測っていない間は1列にする', () => {
  assert.equal(scatterColumnCount('auto', 100, 3), 1);
  assert.equal(scatterColumnCount('auto', 0, 3), 1);
  assert.equal(scatterColumnCount('auto', undefined, 3), 1);
});
