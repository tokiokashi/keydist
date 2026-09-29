import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { shortShapeName, shortShapeNames } from './short-shape-name.ts';

test('組み込みの物理配列の短い名前は、種類と規格が残り、互いに区別できる', () => {
  const shorts = Object.values(PHYSICAL_SHAPES).map((shape) => shortShapeName(shape.name));
  assert.deepEqual(shorts, [
    'ロウ（ANSI）',
    'ロウ（JIS 109）',
    'オーソリニア（ANSI）',
    'オーソリニア（JIS 109）',
    'カラム（ANSI）',
    'カラム（JIS 109）',
  ]);
  assert.equal(new Set(shorts).size, shorts.length);
});

test('括弧の形でない名前はそのまま返す', () => {
  assert.equal(shortShapeName('自作の配列'), '自作の配列');
});

test('短い名前が重なる時は全名にする', () => {
  const names = shortShapeNames([
    { id: 'a', name: 'ロウスタッガード（ANSI）' },
    { id: 'b', name: 'ロウ（ANSI）' },
    { id: 'c', name: 'オーソリニア（ANSI）' },
  ]);
  assert.equal(names.get('a'), 'ロウスタッガード（ANSI）');
  assert.equal(names.get('b'), 'ロウ（ANSI）');
  assert.equal(names.get('c'), 'オーソリニア（ANSI）');
});
