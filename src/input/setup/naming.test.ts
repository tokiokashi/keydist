import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameTargets } from './naming.ts';

test('nameTargets: 単一の対象は配列名だけを出す', () => {
  const named = nameTargets([
    { key: 'layout:qwerty', kind: 'layout', layoutName: 'QWERTY', shapeName: 'ロウスタッガード（ANSI）' },
  ]);
  assert.equal(named.length, 1);
  assert.equal(named[0].displayName, 'QWERTY');
  assert.equal(named[0].fullName, 'QWERTY/ロウスタッガード（ANSI）');
});

test('nameTargets: 単一の対象でも非既定条件があれば併記する', () => {
  const named = nameTargets([
    { key: 'setup:s1', kind: 'setup', layoutName: 'QWERTY', shapeName: '形状A', overrideSummary: '指の割当: JIS' },
  ]);
  assert.equal(named[0].displayName, 'QWERTY · 指の割当: JIS');
});

test('nameTargets: #578の例（配列2つ + 指割当違いのSetup）で差分だけ残す', () => {
  const named = nameTargets([
    { key: 'layout:qwerty', kind: 'layout', layoutName: 'QWERTY', shapeName: '形状A' },
    { key: 'layout:colemak-dh', kind: 'layout', layoutName: 'Colemak-DH', shapeName: '形状A' },
    { key: 'setup:s3', kind: 'setup', layoutName: 'QWERTY', shapeName: '形状A', overrideSummary: '指割当JIS' },
  ]);
  assert.equal(named.find((n) => n.key === 'layout:qwerty')!.displayName, 'QWERTY');
  assert.equal(named.find((n) => n.key === 'layout:colemak-dh')!.displayName, 'Colemak-DH');
  assert.equal(named.find((n) => n.key === 'setup:s3')!.displayName, 'QWERTY · 指割当JIS');
});

test('nameTargets: 形状だけが違う集合は形状名だけを出す（配列名は落とす）', () => {
  const named = nameTargets([
    { key: 'setup:s1', kind: 'setup', layoutName: 'QWERTY', shapeName: 'ロウスタッガード' },
    { key: 'setup:s2', kind: 'setup', layoutName: 'QWERTY', shapeName: 'オーソリニア' },
  ]);
  assert.equal(named.find((n) => n.key === 'setup:s1')!.displayName, 'ロウスタッガード');
  assert.equal(named.find((n) => n.key === 'setup:s2')!.displayName, 'オーソリニア');
});

test('nameTargets: ラベルがあれば常にそのまま表示名になる（差分計算の対象外）', () => {
  const named = nameTargets([
    { key: 'setup:s1', kind: 'setup', label: 'メインで使う方', layoutName: 'QWERTY', shapeName: '形状A' },
    { key: 'setup:s2', kind: 'setup', layoutName: 'QWERTY', shapeName: '形状A' },
  ]);
  assert.equal(named.find((n) => n.key === 'setup:s1')!.displayName, 'メインで使う方');
  // s2はs1と完全に同じ配列・形状だが、s1はラベル付きで「集合内の共通性」の母集団から
  // 除かれる（レビュー指摘3）。母集団はs2だけ（1件）になるので、単一対象と同じ扱いになり
  // 「QWERTY」を出す。
  assert.equal(named.find((n) => n.key === 'setup:s2')!.displayName, 'QWERTY');
});

test('nameTargets: フルの名前は常にすべてを含む', () => {
  const named = nameTargets([
    { key: 'setup:s1', kind: 'setup', layoutName: 'QWERTY', shapeName: '形状A', overrideSummary: '指の割当: JIS' },
    { key: 'setup:s2', kind: 'setup', layoutName: 'QWERTY', shapeName: '形状A' },
  ]);
  assert.equal(named.find((n) => n.key === 'setup:s1')!.fullName, 'QWERTY/形状A · 指の割当: JIS');
  assert.equal(named.find((n) => n.key === 'setup:s2')!.fullName, 'QWERTY/形状A');
});

test('nameTargets: 配列対象と、同じ配列・既定形状で上書きの無いSetup対象は種類で区別する（keyは出さない）', () => {
  const named = nameTargets([
    { key: 'layout:qwerty', kind: 'layout', layoutName: 'QWERTY', shapeName: 'ロウスタッガード' },
    { key: 'setup:3f2a9c1e-uuid', kind: 'setup', setupNumber: 2, layoutName: 'QWERTY', shapeName: 'ロウスタッガード' },
  ]);
  assert.equal(named[0].displayName, 'QWERTY（配列）');
  assert.equal(named[1].displayName, 'QWERTY（Setup 2）');
  for (const n of named) assert.doesNotMatch(n.displayName, /layout:|setup:|uuid/);
});

test('nameTargets: 衝突した組だけを詳しくし、衝突していない対象は差分だけの名前のまま（レビュー指摘M3の再現）', () => {
  const named = nameTargets([
    { key: 'layout:qwerty', kind: 'layout', layoutName: 'QWERTY', shapeName: 'ロウスタッガード' },
    { key: 'setup:fixed-a', kind: 'setup', setupNumber: 1, layoutName: 'QWERTY', shapeName: 'ロウスタッガード' },
    { key: 'setup:fixed-b', kind: 'setup', setupNumber: 2, layoutName: 'Colemak-DH', shapeName: 'ロウスタッガード' },
  ]);
  assert.deepEqual(named.map((n) => n.displayName), ['QWERTY（配列）', 'QWERTY（Setup 1）', 'Colemak-DH']);
});

test('nameTargets: 番号の無い（手持ちから消えた）Setup同士が衝突しても、位置で必ず解消する', () => {
  const named = nameTargets([
    { key: 'setup:gone-1', kind: 'setup', failed: true, description: '削除されたSetup' },
    { key: 'setup:gone-2', kind: 'setup', failed: true, description: '削除されたSetup' },
  ]);
  assert.deepEqual(named.map((n) => n.displayName), ['削除されたSetup（1番目）', '削除されたSetup（2番目）']);
});

test('nameTargets: 同じ配列名を持つ別のuser layoutも衝突を解消する', () => {
  const named = nameTargets([
    { key: 'layout:user-a', kind: 'layout', layoutName: '自作配列', shapeName: 'ロウスタッガード' },
    { key: 'layout:user-b', kind: 'layout', layoutName: '自作配列', shapeName: 'ロウスタッガード' },
  ]);
  const a = named.find((n) => n.key === 'layout:user-a')!;
  const b = named.find((n) => n.key === 'layout:user-b')!;
  assert.notEqual(a.displayName, b.displayName);
  // 種類（どちらも配列）では区別できないので位置まで使う。idは出さない。
  assert.equal(a.displayName, '自作配列（1番目）');
  assert.equal(b.displayName, '自作配列（2番目）');
});

test('nameTargets: ラベルが他の対象の計算済み名と衝突しても、ラベル側はそのまま・相手側だけ詳しくする', () => {
  const named = nameTargets([
    { key: 'setup:labeled', kind: 'setup', label: 'QWERTY', layoutName: 'Dvorak', shapeName: '形状A' },
    { key: 'layout:qwerty', kind: 'layout', layoutName: 'QWERTY', shapeName: '形状A' },
  ]);
  const labeled = named.find((n) => n.key === 'setup:labeled')!;
  const layout = named.find((n) => n.key === 'layout:qwerty')!;
  assert.equal(labeled.displayName, 'QWERTY');
  assert.equal(layout.displayName, 'QWERTY（配列）', 'ラベルと衝突した側は詳しくして区別する');
});

test('nameTargets: 集合に解決失敗のメンバーがいても、共通性の判定からは除かれる', () => {
  const named = nameTargets([
    { key: 'setup:ok-a', kind: 'setup', layoutName: 'QWERTY', shapeName: '形状A' },
    { key: 'setup:ok-b', kind: 'setup', layoutName: 'Colemak-DH', shapeName: '形状A' },
    { key: 'setup:missing', kind: 'setup', failed: true, description: '削除されたSetup' },
  ]);
  // ok-a/ok-bはlayoutNameが違うので配列名だけで区別できる（failedメンバーの「shapeName='—'」が
  // 母集団に混ざって「形状も共通でない」と誤判定されない）。
  assert.equal(named.find((n) => n.key === 'setup:ok-a')!.displayName, 'QWERTY');
  assert.equal(named.find((n) => n.key === 'setup:ok-b')!.displayName, 'Colemak-DH');
  assert.equal(named.find((n) => n.key === 'setup:missing')!.displayName, '削除されたSetup');
  assert.equal(named.find((n) => n.key === 'setup:missing')!.fullName, '削除されたSetup');
});

test('nameTargets: 空文字・空白だけのラベルはラベル無し扱い、前後の空白は落とす', () => {
  const named = nameTargets([
    { key: 'setup:s1', kind: 'setup', label: '', layoutName: 'QWERTY', shapeName: '形状A' },
    { key: 'setup:s2', kind: 'setup', label: ' \u3000\t', layoutName: 'Dvorak', shapeName: '形状A' },
    { key: 'setup:s3', kind: 'setup', label: '  比較用  ', layoutName: 'Colemak', shapeName: '形状A' },
  ]);
  assert.deepEqual(named.map((n) => n.displayName), ['QWERTY', 'Dvorak', '比較用']);
});

test('nameTargets: 表示名が空文字になることはない', () => {
  const named = nameTargets([
    { key: 'setup:s1', kind: 'setup', layoutName: 'QWERTY', shapeName: '形状A' },
    { key: 'setup:s2', kind: 'setup', layoutName: 'QWERTY', shapeName: '形状A' },
    { key: 'setup:s3', kind: 'setup', layoutName: 'QWERTY', shapeName: '形状A' },
  ]);
  for (const n of named) {
    assert.notEqual(n.displayName, '');
  }
  assert.equal(new Set(named.map((n) => n.displayName)).size, 3);
});

test('nameTargets: 同じラベルのSetup同士は種類（Setup n）で区別する（レビュー指摘L-d）', () => {
  const named = nameTargets([
    { key: 'setup:a', kind: 'setup', setupNumber: 1, label: 'A', layoutName: 'QWERTY', shapeName: '形状A' },
    { key: 'setup:b', kind: 'setup', setupNumber: 3, label: 'A', layoutName: 'Dvorak', shapeName: '形状A' },
    { key: 'layout:colemak', kind: 'layout', layoutName: 'Colemak', shapeName: '形状A' },
  ]);
  assert.deepEqual(named.map((n) => n.displayName), ['A（Setup 1）', 'A（Setup 3）', 'Colemak']);
});

test('nameTargets: 手持ちから消えたSetupは「Setup」を重ねず位置で区別する（レビュー指摘L-d）', () => {
  const named = nameTargets([
    { key: 'setup:ok', kind: 'setup', setupNumber: 1, layoutName: 'QWERTY', shapeName: '形状A' },
    { key: 'setup:gone-1', kind: 'setup', failed: true, description: '削除されたSetup' },
    { key: 'setup:gone-2', kind: 'setup', failed: true, description: '削除されたSetup' },
  ]);
  assert.deepEqual(named.map((n) => n.displayName), ['QWERTY', '削除されたSetup（2番目）', '削除されたSetup（3番目）']);
});
