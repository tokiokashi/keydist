import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameTargets } from './naming.ts';

test('nameTargets: 単一の対象は配列名だけを出す', () => {
  const named = nameTargets([
    { key: 'layout:qwerty', layoutName: 'QWERTY', shapeName: 'ロウスタッガード（ANSI）' },
  ]);
  assert.equal(named.length, 1);
  assert.equal(named[0].displayName, 'QWERTY');
  assert.equal(named[0].fullName, 'QWERTY/ロウスタッガード（ANSI）');
});

test('nameTargets: 単一の対象でも非既定条件があれば併記する', () => {
  const named = nameTargets([
    { key: 'setup:s1', layoutName: 'QWERTY', shapeName: '形状A', overrideSummary: '指の割当: JIS' },
  ]);
  assert.equal(named[0].displayName, 'QWERTY · 指の割当: JIS');
});

test('nameTargets: #578の例（配列2つ + 指割当違いのSetup）で差分だけ残す', () => {
  const named = nameTargets([
    { key: 'layout:qwerty', layoutName: 'QWERTY', shapeName: '形状A' },
    { key: 'layout:colemak-dh', layoutName: 'Colemak-DH', shapeName: '形状A' },
    { key: 'setup:s3', layoutName: 'QWERTY', shapeName: '形状A', overrideSummary: '指割当JIS' },
  ]);
  assert.equal(named.find((n) => n.key === 'layout:qwerty')!.displayName, 'QWERTY');
  assert.equal(named.find((n) => n.key === 'layout:colemak-dh')!.displayName, 'Colemak-DH');
  assert.equal(named.find((n) => n.key === 'setup:s3')!.displayName, 'QWERTY · 指割当JIS');
});

test('nameTargets: 形状だけが違う集合は形状名だけを出す（配列名は落とす）', () => {
  const named = nameTargets([
    { key: 'setup:s1', layoutName: 'QWERTY', shapeName: 'ロウスタッガード' },
    { key: 'setup:s2', layoutName: 'QWERTY', shapeName: 'オーソリニア' },
  ]);
  assert.equal(named.find((n) => n.key === 'setup:s1')!.displayName, 'ロウスタッガード');
  assert.equal(named.find((n) => n.key === 'setup:s2')!.displayName, 'オーソリニア');
});

test('nameTargets: ラベルがあれば常にそのまま表示名になる（差分計算の対象外）', () => {
  const named = nameTargets([
    { key: 'setup:s1', label: 'メインで使う方', layoutName: 'QWERTY', shapeName: '形状A' },
    { key: 'setup:s2', layoutName: 'QWERTY', shapeName: '形状A' },
  ]);
  assert.equal(named.find((n) => n.key === 'setup:s1')!.displayName, 'メインで使う方');
  // s2はs1と完全に同じ配列・形状だが、s1はラベル付きで差分計算に参加しないため、
  // s2側の「配列名・形状名が集合内で共通か」の判定はs1を含めた全員で行われる
  // （s1もlayoutName/shapeNameは同じ値を持つ）ので共通と判定され、s2はフォールバックの配列名になる。
  assert.equal(named.find((n) => n.key === 's2')?.displayName ?? named.find((n) => n.key === 'setup:s2')!.displayName, 'QWERTY');
});

test('nameTargets: フルの名前は常にすべてを含む', () => {
  const named = nameTargets([
    { key: 'setup:s1', layoutName: 'QWERTY', shapeName: '形状A', overrideSummary: '指の割当: JIS' },
    { key: 'setup:s2', layoutName: 'QWERTY', shapeName: '形状A' },
  ]);
  assert.equal(named.find((n) => n.key === 'setup:s1')!.fullName, 'QWERTY/形状A · 指の割当: JIS');
  assert.equal(named.find((n) => n.key === 'setup:s2')!.fullName, 'QWERTY/形状A');
});
