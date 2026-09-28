import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSetupName, nameSetups } from './naming.ts';

test('deriveSetupName: 配列名 + 形状名', () => {
  assert.equal(deriveSetupName('QWERTY', 'ロウスタッガード（ANSI）'), 'QWERTY / ロウスタッガード（ANSI）');
});

test('nameSetups: ラベルが無ければ自動生成名がそのまま表示名になる', () => {
  const named = nameSetups([
    { setupId: 's1', label: undefined, layoutName: 'QWERTY', shapeName: '形状A' },
  ]);
  assert.equal(named.length, 1);
  assert.equal(named[0].displayName, 'QWERTY / 形状A');
  assert.equal(named[0].derivedName, 'QWERTY / 形状A');
  assert.equal(named[0].needsLabel, false);
});

test('nameSetups: 同じ配列・形状のSetupが2つあると自動生成名が衝突し、両方にneedsLabelが立つ', () => {
  const named = nameSetups([
    { setupId: 's1', label: undefined, layoutName: 'QWERTY', shapeName: '形状A' },
    { setupId: 's2', label: undefined, layoutName: 'QWERTY', shapeName: '形状A' },
  ]);
  assert.equal(named.find((n) => n.setupId === 's1')!.needsLabel, true);
  assert.equal(named.find((n) => n.setupId === 's2')!.needsLabel, true);
  assert.equal(named[0].displayName, named[1].displayName);
});

test('nameSetups: 片方だけラベルを付ければ衝突は解消する', () => {
  const named = nameSetups([
    { setupId: 's1', label: 'メインで使う方', layoutName: 'QWERTY', shapeName: '形状A' },
    { setupId: 's2', label: undefined, layoutName: 'QWERTY', shapeName: '形状A' },
  ]);
  assert.equal(named.find((n) => n.setupId === 's1')!.needsLabel, false);
  assert.equal(named.find((n) => n.setupId === 's2')!.needsLabel, false);
  assert.notEqual(
    named.find((n) => n.setupId === 's1')!.displayName,
    named.find((n) => n.setupId === 's2')!.displayName,
  );
});

test('nameSetups: ラベル同士がたまたま同じ文字列でも衝突として扱う', () => {
  const named = nameSetups([
    { setupId: 's1', label: '実験用', layoutName: 'QWERTY', shapeName: '形状A' },
    { setupId: 's2', label: '実験用', layoutName: 'Dvorak', shapeName: '形状B' },
  ]);
  assert.equal(named.every((n) => n.needsLabel), true);
});

test('nameSetups: 3件以上の衝突も検出する', () => {
  const named = nameSetups([
    { setupId: 's1', label: undefined, layoutName: 'QWERTY', shapeName: '形状A' },
    { setupId: 's2', label: undefined, layoutName: 'QWERTY', shapeName: '形状A' },
    { setupId: 's3', label: undefined, layoutName: 'QWERTY', shapeName: '形状A' },
    { setupId: 's4', label: undefined, layoutName: 'Dvorak', shapeName: '形状A' },
  ]);
  assert.equal(named.filter((n) => n.needsLabel).length, 3);
  assert.equal(named.find((n) => n.setupId === 's4')!.needsLabel, false);
});
