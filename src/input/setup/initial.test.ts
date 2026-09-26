import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { initialSetups } from './initial.ts';

function makeIdGenerator(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `initial-${n}`;
  };
}

test('initialSetups: 組み込み配列ごとに1つ、既定形状（row-staggered）のSetupを作る', () => {
  const setups = initialSetups(makeIdGenerator());
  assert.equal(setups.length, LAYOUT_BY_ID.size);
  for (const setup of setups) {
    assert.equal(setup.shapeId, 'row-staggered');
    assert.ok(LAYOUT_BY_ID.has(setup.layoutId), `未知のlayoutId: ${setup.layoutId}`);
    assert.equal(setup.label, undefined); // 自動命名に任せる。ラベルは付けない
  }
});

test('initialSetups: 組み込み配列のidと1対1に対応する（重複が無い）', () => {
  const setups = initialSetups(makeIdGenerator());
  const layoutIds = setups.map((s) => s.layoutId);
  assert.equal(new Set(layoutIds).size, layoutIds.length);
  assert.deepEqual(new Set(layoutIds), new Set(LAYOUT_BY_ID.keys()));
});

test('initialSetups: idはgeneratorが払い出した通りで、重複しない', () => {
  const setups = initialSetups(makeIdGenerator());
  assert.equal(new Set(setups.map((s) => s.id)).size, setups.length);
});
