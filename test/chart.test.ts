import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barChart, columnChart, lineChart, matrixChart } from '../src/chart.ts';

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

test('縦棒は負の値を 0 基準の下向きに描く', () => {
  const svg = columnChart([
    { label: '正', value: 2 },
    { label: '負', value: -1 },
  ]);
  const bars = [...svg.matchAll(/<rect data-bar="true"[^>]* y="([\d.]+)"[^>]* height="([\d.]+)"/g)];
  assert.equal(bars.length, 2);
  assert.notEqual(bars[0][1], bars[1][1], '正負の棒が同じ位置に重ならない');
  assert.ok(Number(bars[0][2]) > 0);
  assert.ok(Number(bars[1][2]) > 0);

  const zero = columnChart([{ label: 'ゼロ', value: 0 }]);
  assert.match(zero, /<line x1="0" y1="170" x2="420" y2="170"/);
});

test('横棒はデータ個別の表示値を使える', () => {
  const svg = barChart([{ label: '配列A', value: 1, valueLabel: '100.0%' }]);
  assert.match(svg, />100\.0%<\/text>/);
});

/** セルの塗り強度（heat-1 の混合率）を読み取る */
function cellMixes(svg: string): number[] {
  return [...svg.matchAll(/var\(--heat-1\) ([\d.]+)%, var\(--heat-0\)/g)].map((m) => Number(m[1]));
}

/** セルに書かれた数値を読み取る */
function cellValues(svg: string): string[] {
  return [...svg.matchAll(/tabular-nums"[^>]*>([\d.]+)<\/text>/g)].map((m) => m[1]);
}

const MATRIX_ROWS = [
  { label: '配列A', color: '#f00', cells: [{ value: 10 }, { value: 0 }] },
  { label: '配列B', color: '#00f', cells: [{ value: 5 }, { value: 20 }] },
];

test('セルの数は行数 × 列数になる', () => {
  const svg = matrixChart(MATRIX_ROWS, ['列1', '列2']);
  assert.equal(cellValues(svg).length, 4);
});

test('色の強度は行列全体の最大値を基準にする', () => {
  const svg = matrixChart(MATRIX_ROWS, ['列1', '列2']);
  const mixes = cellMixes(svg);
  // 最大値 20 のセルは 100%、値 0 のセルは 0% になる
  assert.equal(Math.max(...mixes), 100);
  assert.equal(Math.min(...mixes), 0);
});

test('tip を省略すると行ラベル・列ラベル・値から自動生成する', () => {
  const svg = matrixChart(MATRIX_ROWS, ['列1', '列2'], { format: (v) => v.toFixed(1) });
  assert.ok(svg.includes('配列A / 列1'));
  assert.ok(svg.includes('10.0'));
});

test('columnSplit を指定すると列の間に隙間が空き、全体の幅が広がる', () => {
  const withoutSplit = matrixChart(MATRIX_ROWS, ['列1', '列2']);
  const withSplit = matrixChart(MATRIX_ROWS, ['列1', '列2'], { columnSplit: 1 });
  const width = (svg: string) => Number(svg.match(/viewBox="0 0 ([\d.]+) /)![1]);
  assert.ok(width(withSplit) > width(withoutSplit));
});

test('マトリックスの列見出しはソート操作の対象になる', () => {
  const svg = matrixChart(MATRIX_ROWS, ['列1', '列2'], { sort: { column: 1, direction: 'asc' } });
  assert.match(svg, /data-matrix-sort="1"/);
  assert.match(svg, /aria-sort="ascending"/);
  assert.ok(svg.includes('列2 ↑'));
});
