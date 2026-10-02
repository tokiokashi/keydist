import assert from 'node:assert/strict';
import test from 'node:test';
import { PHYSICAL_SHAPES } from './geometry.ts';
import { groupShapes, shapeGroupKey } from './shape-groups.ts';

test('組み込みの物理配列は、規格の定義からANSIとJISの各4つに分かれる', () => {
  const groups = groupShapes(Object.values(PHYSICAL_SHAPES));
  assert.deepEqual(groups.map((g) => [g.label, g.shapes.length]), [['US配列（ANSI）', 4], ['JIS配列', 4]]);
  for (const g of groups) {
    for (const shape of g.shapes) {
      assert.equal(shapeGroupKey(shape.id), g.key);
      assert.equal(shape.id.startsWith('jis-'), g.key === 'jis');
    }
  }
});

test('グループは名前の文字列に依らず、定義の規格で決まる', () => {
  const renamed = { ...PHYSICAL_SHAPES['jis-ortholinear'], name: 'ANSIという語を含む名前' };
  assert.equal(shapeGroupKey(renamed.id), 'jis');
  assert.deepEqual(groupShapes([renamed]).map((g) => g.key), ['jis']);
});

test('組み込みでない物理配列は自作のグループに入り、空のグループは返さない', () => {
  const user = { id: 'user-1', name: 'JIS風の自作' };
  const groups = groupShapes([user, PHYSICAL_SHAPES['row-staggered']]);
  assert.deepEqual(groups.map((g) => g.key), ['ansi', 'user']);
  assert.equal(groups[1]!.label, '自作');
});
