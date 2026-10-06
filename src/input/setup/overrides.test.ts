import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copySetupOverrides, dropSetupOverrides } from './overrides.ts';
import type { CascadeOverrides } from '#input/settings/index.ts';

type V = { windowSize: number; sfbHomeCost: boolean };

test('copySetupOverrides: 上書きがあれば別のsetupIdへコピーする', () => {
  const overrides: CascadeOverrides<V> = {
    setup: { 'source-id': { windowSize: 7, sfbHomeCost: false } },
  };
  const copied = copySetupOverrides(overrides, 'source-id', 'copy-id');
  assert.deepEqual(copied.setup?.['copy-id'], { windowSize: 7, sfbHomeCost: false });
  assert.deepEqual(copied.setup?.['source-id'], { windowSize: 7, sfbHomeCost: false }); // 元は残る
});

test('copySetupOverrides: 上書きが無ければ何もしない', () => {
  const overrides: CascadeOverrides<V> = {};
  const copied = copySetupOverrides(overrides, 'source-id', 'copy-id');
  assert.equal(copied, overrides);
});

test('dropSetupOverrides: 指定setupIdの上書きだけ消える', () => {
  const overrides: CascadeOverrides<V> = {
    setup: {
      'keep-id': { windowSize: 4, sfbHomeCost: true },
      'remove-id': { windowSize: 8, sfbHomeCost: false },
    },
  };
  const dropped = dropSetupOverrides(overrides, 'remove-id');
  assert.deepEqual(dropped.setup, { 'keep-id': { windowSize: 4, sfbHomeCost: true } });
});

test('dropSetupOverrides: 最後の1件を消すとsetupキー自体が消える（空オブジェクトを残さない）', () => {
  const overrides: CascadeOverrides<V> = {
    setup: { 'only-id': { windowSize: 4, sfbHomeCost: true } },
  };
  const dropped = dropSetupOverrides(overrides, 'only-id');
  assert.deepEqual(dropped, {});
});
