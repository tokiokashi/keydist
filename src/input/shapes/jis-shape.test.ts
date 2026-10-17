import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeometry, JIS_FINGER_ASSIGNMENT, PHYSICAL_SHAPES, presetGeometryStandard } from './geometry.ts';
import { jisShapeIdFor, physicalShapeKeyIds } from './jis-shape.ts';

test('物理配列が持つキーのidは、組み込みの全物理配列でbuildGeometryのキーと一致する', () => {
  for (const shape of Object.values(PHYSICAL_SHAPES)) {
    const built = new Set(buildGeometry(shape, presetGeometryStandard(shape.id as keyof typeof PHYSICAL_SHAPES) === 'jis' ? JIS_FINGER_ASSIGNMENT : undefined).keys.keys());
    assert.deepEqual([...physicalShapeKeyIds(shape)].sort(), [...built].sort(), shape.id);
  }
});

test('ANSIの組み込みは同じ形のJIS、JISの組み込みはそのまま', () => {
  const none = new Set<string>();
  assert.equal(jisShapeIdFor(PHYSICAL_SHAPES['column-staggered'], none), 'jis-column-staggered');
  assert.equal(jisShapeIdFor(PHYSICAL_SHAPES['split-ortholinear'], none), 'jis-split-ortholinear');
  assert.equal(jisShapeIdFor(PHYSICAL_SHAPES['jis-ortholinear'], none), 'jis-ortholinear');
});

test('自作の物理配列は、必要なキーを全部持つ時だけそのまま使う', () => {
  const custom = { ...PHYSICAL_SHAPES['row-staggered'], id: 'shape-x' };
  assert.equal(jisShapeIdFor(custom, new Set(['q', 'thumb-r'])), 'shape-x');
  assert.equal(jisShapeIdFor(custom, new Set(['q', 'r0c12'])), 'jis-row-staggered');
});
