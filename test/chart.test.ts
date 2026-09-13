import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineChart } from '../src/chart.ts';

const SERIES = [
  { name: 'A', color: '#f00', points: [{ x: 0, y: 100 }, { x: 1, y: 96 }, { x: 2, y: 91.4 }] },
  { name: 'B', color: '#00f', points: [{ x: 0, y: 100 }, { x: 1, y: 99 }, { x: 2, y: 98.2 }] },
];

/** y 軸の目盛りラベルだけを取り出す。x 軸のラベルは単位を持たない */
function yTicks(svg: string): number[] {
  return [...svg.matchAll(/tabular-nums">([\d.]+)%<\/text>/g)].map((m) => Number(m[1]));
}

test('上端を指定すると y 軸はちょうどその値で止まる', () => {
  const ticks = yTicks(lineChart(SERIES, [0, 1, 2], (v) => `${v.toFixed(1)}%`, { yMax: 100 }));
  assert.equal(Math.max(...ticks), 100);
});

test('上端を指定しなければデータ範囲に余白を足す', () => {
  const ticks = yTicks(lineChart(SERIES, [0, 1, 2], (v) => `${v.toFixed(1)}%`));
  assert.ok(Math.max(...ticks) > 100, '自動調整では最大値の上に余白が出る');
});

test('全系列が同じ値でも上端の指定が潰れない', () => {
  const flat = [{ name: 'A', color: '#f00', points: [{ x: 0, y: 100 }, { x: 1, y: 100 }] }];
  const ticks = yTicks(lineChart(flat, [0, 1], (v) => `${v.toFixed(1)}%`, { yMax: 100 }));
  assert.equal(Math.max(...ticks), 100);
  assert.ok(Math.min(...ticks) < 100, '幅が 0 だと線が描けないので下側に余白を取る');
});
