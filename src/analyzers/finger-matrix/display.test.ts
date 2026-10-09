import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerMatrixCell } from './display.ts';
import type { FingerMatrixOkRow } from './extract.ts';
import { FINGER_MATRIX_SURFACE_IDS, type FingerMatrixSurfaceId } from './options.ts';

const zeros = (): number[] => Array.from({ length: 10 }, () => 0);

function row(overrides: Partial<Record<FingerMatrixSurfaceId, number[]>>, inputChars: number, fingerPressEvents: number[] = zeros()): FingerMatrixOkRow {
  const surfaces = {} as Record<FingerMatrixSurfaceId, readonly number[]>;
  for (const id of FINGER_MATRIX_SURFACE_IDS) surfaces[id] = overrides[id] ?? (id === 'pairMean' || id === 'pairStdDev' ? [0, 0, 0, 0, 0, 0] : zeros());
  return { kind: 'ok', targetKey: 'k', inputChars, surfaces, fingerPressEvents };
}

test('押下数と移動距離は入力1文字あたりに割り、生の値をツールチップに出す', () => {
  const r = row({ presses: [0, 0, 0, 30, 0, 0, 0, 0, 0, 0], distance: [0, 0, 0, 12.5, 0, 0, 0, 0, 0, 0] }, 100);
  const presses = fingerMatrixCell('presses', r, 3);
  assert.equal(presses.value, 0.3);
  assert.equal(presses.text, '0.300');
  assert.equal(presses.tip, '押下数30回 / 入力100文字');
  const distance = fingerMatrixCell('distance', r, 3);
  assert.equal(distance.value, 0.125);
  assert.equal(distance.text, '0.125');
  assert.equal(distance.tip, '移動距離12.5 u / 入力100文字');
});

test('入力文字数が0の行は押下数と移動距離を値なしにする', () => {
  const r = row({ presses: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, 0);
  for (const id of ['presses', 'distance'] as const) {
    const cell = fingerMatrixCell(id, r, 0);
    assert.equal(cell.value, undefined);
    assert.equal(cell.text, '—');
  }
});

test('指間距離の2面と同指連続の回数は割らない', () => {
  const r = row({ pairMean: [0.5, 0, 0, 0, 0, 0], pairStdDev: [0, 0.25, 0, 0, 0, 0], sfbCount: [7, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, 50);
  assert.equal(fingerMatrixCell('pairMean', r, 0).value, 0.5);
  assert.equal(fingerMatrixCell('pairStdDev', r, 1).value, 0.25);
  const count = fingerMatrixCell('sfbCount', r, 0);
  assert.equal(count.value, 7);
  assert.equal(count.text, '7');
  assert.equal(count.tip, '同指連続7回');
});

test('同指連続の比率は抽出の百分率を使い、分子と分母の回数をツールチップに出す', () => {
  const pressEvents = zeros();
  pressEvents[2] = 4;
  const r = row({ sfbCount: [0, 0, 3, 0, 0, 0, 0, 0, 0, 0], sfbRate: [0, 0, 75, 0, 0, 0, 0, 0, 0, 0] }, 10, pressEvents);
  const cell = fingerMatrixCell('sfbRate', r, 2);
  assert.equal(cell.value, 75);
  assert.equal(cell.text, '75.0%');
  assert.equal(cell.tip, '同指連続3回 / この指で押した回数4回');
});

test('同指連続の比率は、その指で押した回数が0なら値なしで、ツールチップに0回 / 0回を出す', () => {
  const r = row({}, 10);
  const cell = fingerMatrixCell('sfbRate', r, 4);
  assert.equal(cell.value, undefined);
  assert.equal(cell.text, '—');
  assert.equal(cell.tip, '同指連続0回 / この指で押した回数0回');
});

test('同指連続の割合は、全体の同指連続の回数を分母にし、0なら値なし', () => {
  const r = row({ sfbCount: [1, 0, 3, 0, 0, 0, 0, 0, 0, 0], sfbShare: [25, 0, 75, 0, 0, 0, 0, 0, 0, 0] }, 10);
  const cell = fingerMatrixCell('sfbShare', r, 2);
  assert.equal(cell.value, 75);
  assert.equal(cell.text, '75.0%');
  assert.equal(cell.tip, '同指連続3回 / 全体の同指連続4回');
  const none = fingerMatrixCell('sfbShare', row({}, 10), 2);
  assert.equal(none.value, undefined);
  assert.equal(none.text, '—');
  assert.equal(none.tip, '同指連続0回 / 全体の同指連続0回');
});
