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
  // s2はs1と完全に同じ配列・形状だが、s1はラベル付きで「集合内の共通性」の母集団から
  // 除かれる（レビュー指摘3）。母集団はs2だけ（1件）になるので、単一対象と同じ扱いになり
  // 「QWERTY」を出す。
  assert.equal(named.find((n) => n.key === 'setup:s2')!.displayName, 'QWERTY');
});

test('nameTargets: フルの名前は常にすべてを含む', () => {
  const named = nameTargets([
    { key: 'setup:s1', layoutName: 'QWERTY', shapeName: '形状A', overrideSummary: '指の割当: JIS' },
    { key: 'setup:s2', layoutName: 'QWERTY', shapeName: '形状A' },
  ]);
  assert.equal(named.find((n) => n.key === 'setup:s1')!.fullName, 'QWERTY/形状A · 指の割当: JIS');
  assert.equal(named.find((n) => n.key === 'setup:s2')!.fullName, 'QWERTY/形状A');
});

test('nameTargets: 配列対象と、同じ配列・既定形状で上書きの無いSetup対象は表示名が衝突するのでkeyまでエスカレーションする', () => {
  const named = nameTargets([
    { key: 'layout:qwerty', layoutName: 'QWERTY', shapeName: 'ロウスタッガード' },
    { key: 'setup:s1', layoutName: 'QWERTY', shapeName: 'ロウスタッガード' },
  ]);
  const a = named.find((n) => n.key === 'layout:qwerty')!;
  const b = named.find((n) => n.key === 'setup:s1')!;
  assert.notEqual(a.displayName, b.displayName, '衝突したまま同じ表示名を返してはいけない');
  // 配列名・形状名・条件併記のどれも完全に同じなので、フルの名前まで詳しくしても
  // 区別できず、最終的にkey込みの表示名になる。
  assert.match(a.displayName, /layout:qwerty/);
  assert.match(b.displayName, /setup:s1/);
});

test('nameTargets: 同じ配列名を持つ別のuser layout（oonishi-custom / oonishi-custom-combo相当）も衝突を解消する', () => {
  const named = nameTargets([
    { key: 'layout:oonishi-custom', layoutName: 'TK音直入力法', shapeName: 'ロウスタッガード' },
    { key: 'layout:oonishi-custom-combo', layoutName: 'TK音直入力法', shapeName: 'ロウスタッガード' },
  ]);
  const a = named.find((n) => n.key === 'layout:oonishi-custom')!;
  const b = named.find((n) => n.key === 'layout:oonishi-custom-combo')!;
  assert.notEqual(a.displayName, b.displayName);
});

test('nameTargets: ラベルが他の対象の計算済み名と衝突しても、ラベル側はそのまま・相手側だけ詳しくする', () => {
  const named = nameTargets([
    { key: 'setup:labeled', label: 'QWERTY', layoutName: 'Dvorak', shapeName: '形状A' },
    { key: 'layout:qwerty', layoutName: 'QWERTY', shapeName: '形状A' },
  ]);
  const labeled = named.find((n) => n.key === 'setup:labeled')!;
  const layout = named.find((n) => n.key === 'layout:qwerty')!;
  assert.equal(labeled.displayName, 'QWERTY');
  assert.notEqual(layout.displayName, 'QWERTY', 'ラベルと衝突した側は詳しくして区別する');
});

test('nameTargets: 集合に解決失敗のメンバーがいても、共通性の判定からは除かれる', () => {
  const named = nameTargets([
    { key: 'setup:ok-a', layoutName: 'QWERTY', shapeName: '形状A' },
    { key: 'setup:ok-b', layoutName: 'Colemak-DH', shapeName: '形状A' },
    { key: 'setup:missing', layoutName: 'missing', shapeName: '—', failed: true },
  ]);
  // ok-a/ok-bはlayoutNameが違うので配列名だけで区別できる（failedメンバーの「shapeName='—'」が
  // 母集団に混ざって「形状も共通でない」と誤判定されない）。
  assert.equal(named.find((n) => n.key === 'setup:ok-a')!.displayName, 'QWERTY');
  assert.equal(named.find((n) => n.key === 'setup:ok-b')!.displayName, 'Colemak-DH');
  assert.equal(named.find((n) => n.key === 'setup:missing')!.displayName, 'missing');
});

test('nameTargets: 空文字のラベルはラベル無し扱い', () => {
  const named = nameTargets([
    { key: 'setup:s1', label: '', layoutName: 'QWERTY', shapeName: '形状A' },
  ]);
  assert.equal(named[0].displayName, 'QWERTY');
});

test('nameTargets: 表示名が空文字になることはない', () => {
  const named = nameTargets([
    { key: 'setup:s1', layoutName: 'QWERTY', shapeName: '形状A' },
    { key: 'setup:s2', layoutName: 'QWERTY', shapeName: '形状A' },
    { key: 'setup:s3', layoutName: 'QWERTY', shapeName: '形状A' },
  ]);
  for (const n of named) {
    assert.notEqual(n.displayName, '');
  }
});
