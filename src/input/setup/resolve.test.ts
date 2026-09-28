import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { resolveSetup, type SetupCatalog } from './resolve.ts';
import type { Setup } from './types.ts';

const qwerty = LAYOUT_BY_ID.get('qwerty')!;
const rowStaggered = PHYSICAL_SHAPES['row-staggered'];

const CATALOG: SetupCatalog = {
  layouts: new Map([[qwerty.id, qwerty]]),
  shapes: new Map([[rowStaggered.id, rowStaggered]]),
};

function setup(overrides: Partial<Setup> = {}): Setup {
  return { id: 'setup-1', layoutId: qwerty.id, shapeId: rowStaggered.id, colorIndex: 0, ...overrides };
}

test('resolveSetup: 配列・形状ともカタログにあれば解決できる', () => {
  const result = resolveSetup(setup(), CATALOG, 'romaji');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.layout, qwerty);
  assert.equal(result.shape, rowStaggered);
  assert.deepEqual(result.context, {
    shapeId: rowStaggered.id,
    shape: rowStaggered,
    inputMethod: 'romaji',
    layoutId: qwerty.id,
    layout: qwerty,
    setupId: 'setup-1',
  });
});

test('resolveSetup: 配列が削除されていればlayout-missingエラーを値で返す（例外を投げない）', () => {
  const result = resolveSetup(setup({ layoutId: 'deleted-layout' }), CATALOG, 'romaji');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.errors, [{ kind: 'layout-missing', layoutId: 'deleted-layout' }]);
});

test('resolveSetup: 形状が削除されていればshape-missingエラーを返す', () => {
  const result = resolveSetup(setup({ shapeId: 'deleted-shape' }), CATALOG, 'romaji');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.errors, [{ kind: 'shape-missing', shapeId: 'deleted-shape' }]);
});

test('resolveSetup: 配列・形状の両方が削除されていれば両方のエラーをまとめて返す', () => {
  const result = resolveSetup(
    setup({ layoutId: 'deleted-layout', shapeId: 'deleted-shape' }),
    CATALOG,
    'romaji',
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.errors, [
    { kind: 'layout-missing', layoutId: 'deleted-layout' },
    { kind: 'shape-missing', shapeId: 'deleted-shape' },
  ]);
});

test('resolveSetup: 解決結果のcontext.setupIdは常にそのSetup自身のid', () => {
  const result = resolveSetup(setup({ id: 'setup-42' }), CATALOG, 'direct');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.context.setupId, 'setup-42');
});
