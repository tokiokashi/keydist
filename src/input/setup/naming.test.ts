import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameTargets } from './naming.ts';

test('nameTargets: 単一の対象は配列名だけを出す', () => {
  const named = nameTargets([{ key: 'layout:qwerty', kind: 'layout', layoutName: 'QWERTY', shapeName: 'ロウスタッガード（ANSI）' }]);
  assert.equal(named.length, 1);
  assert.equal(named[0].displayName, 'QWERTY');
  assert.equal(named[0].fullName, 'QWERTY/ロウスタッガード（ANSI）');
});

test('nameTargets: 単一の対象では非既定条件を併記しない', () => {
  const named = nameTargets([{ key: 'setup:s1', kind: 'setup', layoutName: 'QWERTY', shapeName: '物理配列A', overrideSummary: '指の割当: JIS' }]);
  assert.equal(named[0].displayName, 'QWERTY');
  assert.equal(named[0].fullName, 'QWERTY/物理配列A · 指の割当: JIS');
});

test('nameTargets: 配列2つ + 指割当違いのSetupの例で差分だけ残す', () => {
  const named = nameTargets([
    { key: 'layout:qwerty', kind: 'layout', layoutName: 'QWERTY', shapeName: '物理配列A' },
    { key: 'layout:colemak-dh', kind: 'layout', layoutName: 'Colemak-DH', shapeName: '物理配列A' },
    { key: 'setup:s3', kind: 'setup', layoutName: 'QWERTY', shapeName: '物理配列A', overrideSummary: '指割当JIS' },
  ]);
  assert.equal(named.find((n) => n.key === 'layout:qwerty')!.displayName, 'QWERTY');
  assert.equal(named.find((n) => n.key === 'layout:colemak-dh')!.displayName, 'Colemak-DH');
  assert.equal(named.find((n) => n.key === 'setup:s3')!.displayName, 'QWERTY · 指割当JIS');
});

test('nameTargets: 物理配列だけが違う集合は物理配列名だけを出す（配列名は落とす）', () => {
  const named = nameTargets([
    { key: 'setup:s1', kind: 'setup', layoutName: 'QWERTY', shapeName: 'ロウスタッガード' },
    { key: 'setup:s2', kind: 'setup', layoutName: 'QWERTY', shapeName: 'オーソリニア' },
  ]);
  assert.equal(named.find((n) => n.key === 'setup:s1')!.displayName, 'ロウスタッガード');
  assert.equal(named.find((n) => n.key === 'setup:s2')!.displayName, 'オーソリニア');
});

test('nameTargets: ラベルがあれば常にそのまま表示名になる（差分計算の対象外）', () => {
  const named = nameTargets([
    { key: 'setup:s1', kind: 'setup', label: 'メインで使う方', layoutName: 'QWERTY', shapeName: '物理配列A' },
    { key: 'setup:s2', kind: 'setup', layoutName: 'QWERTY', shapeName: '物理配列A' },
  ]);
  assert.equal(named.find((n) => n.key === 'setup:s1')!.displayName, 'メインで使う方');
  // s2はs1と完全に同じ配列・物理配列だが、s1はラベル付きで「集合内の共通性」の母集団から
  // 除かれる。母集団はs2だけ（1件）になるので、単一対象と同じ扱いになり
  // 「QWERTY」を出す。
  assert.equal(named.find((n) => n.key === 'setup:s2')!.displayName, 'QWERTY');
});

test('nameTargets: フルの名前は常にすべてを含む', () => {
  const named = nameTargets([
    { key: 'setup:s1', kind: 'setup', layoutName: 'QWERTY', shapeName: '物理配列A', overrideSummary: '指の割当: JIS' },
    { key: 'setup:s2', kind: 'setup', layoutName: 'QWERTY', shapeName: '物理配列A' },
  ]);
  assert.equal(named.find((n) => n.key === 'setup:s1')!.fullName, 'QWERTY/物理配列A · 指の割当: JIS');
  assert.equal(named.find((n) => n.key === 'setup:s2')!.fullName, 'QWERTY/物理配列A');
});

test('nameTargets: 配列対象と、同じ配列・既定の物理配列で上書きの無いSetup対象は種類で区別する（keyは出さない）', () => {
  const named = nameTargets([
    { key: 'layout:qwerty', kind: 'layout', layoutName: 'QWERTY', shapeName: 'ロウスタッガード' },
    { key: 'setup:3f2a9c1e-uuid', kind: 'setup', setupNumber: 2, layoutName: 'QWERTY', shapeName: 'ロウスタッガード' },
  ]);
  assert.equal(named[0].displayName, 'QWERTY（配列）');
  assert.equal(named[1].displayName, 'QWERTY（Setup 2）');
  for (const n of named) assert.doesNotMatch(n.displayName, /layout:|setup:|uuid/);
});

test('nameTargets: 衝突した組だけを詳しくし、衝突していない対象は差分だけの名前のまま', () => {
  const named = nameTargets([
    { key: 'layout:qwerty', kind: 'layout', layoutName: 'QWERTY', shapeName: 'ロウスタッガード' },
    { key: 'setup:fixed-a', kind: 'setup', setupNumber: 1, layoutName: 'QWERTY', shapeName: 'ロウスタッガード' },
    { key: 'setup:fixed-b', kind: 'setup', setupNumber: 2, layoutName: 'Colemak-DH', shapeName: 'ロウスタッガード' },
  ]);
  assert.deepEqual(
    named.map((n) => n.displayName),
    ['QWERTY（配列）', 'QWERTY（Setup 1）', 'Colemak-DH'],
  );
});

test('nameTargets: 番号の無い（手持ちから消えた）Setup同士が衝突しても、位置で必ず解消する', () => {
  const named = nameTargets([
    { key: 'setup:gone-1', kind: 'setup', failed: true, description: '削除されたSetup' },
    { key: 'setup:gone-2', kind: 'setup', failed: true, description: '削除されたSetup' },
  ]);
  assert.deepEqual(
    named.map((n) => n.displayName),
    ['削除されたSetup（1番目）', '削除されたSetup（2番目）'],
  );
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
    { key: 'setup:labeled', kind: 'setup', label: 'QWERTY', layoutName: 'Dvorak', shapeName: '物理配列A' },
    { key: 'layout:qwerty', kind: 'layout', layoutName: 'QWERTY', shapeName: '物理配列A' },
  ]);
  const labeled = named.find((n) => n.key === 'setup:labeled')!;
  const layout = named.find((n) => n.key === 'layout:qwerty')!;
  assert.equal(labeled.displayName, 'QWERTY');
  assert.equal(layout.displayName, 'QWERTY（配列）', 'ラベルと衝突した側は詳しくして区別する');
});

test('nameTargets: 集合に解決失敗のメンバーがいても、共通性の判定からは除かれる', () => {
  const named = nameTargets([
    { key: 'setup:ok-a', kind: 'setup', layoutName: 'QWERTY', shapeName: '物理配列A' },
    { key: 'setup:ok-b', kind: 'setup', layoutName: 'Colemak-DH', shapeName: '物理配列A' },
    { key: 'setup:missing', kind: 'setup', failed: true, description: '削除されたSetup' },
  ]);
  // ok-a/ok-bはlayoutNameが違うので配列名だけで区別できる（failedメンバーの「shapeName='—'」が
  // 母集団に混ざって「物理配列も共通でない」と誤判定されない）。
  assert.equal(named.find((n) => n.key === 'setup:ok-a')!.displayName, 'QWERTY');
  assert.equal(named.find((n) => n.key === 'setup:ok-b')!.displayName, 'Colemak-DH');
  assert.equal(named.find((n) => n.key === 'setup:missing')!.displayName, '削除されたSetup');
  assert.equal(named.find((n) => n.key === 'setup:missing')!.fullName, '削除されたSetup');
});

test('nameTargets: 空文字・空白だけのラベルはラベル無し扱い、前後の空白は落とす', () => {
  const named = nameTargets([
    { key: 'setup:s1', kind: 'setup', label: '', layoutName: 'QWERTY', shapeName: '物理配列A' },
    { key: 'setup:s2', kind: 'setup', label: ' \u3000\t', layoutName: 'Dvorak', shapeName: '物理配列A' },
    { key: 'setup:s3', kind: 'setup', label: '  比較用  ', layoutName: 'Colemak', shapeName: '物理配列A' },
  ]);
  assert.deepEqual(
    named.map((n) => n.displayName),
    ['QWERTY', 'Dvorak', '比較用'],
  );
});

test('nameTargets: 表示名が空文字になることはない', () => {
  const named = nameTargets([
    { key: 'setup:s1', kind: 'setup', layoutName: 'QWERTY', shapeName: '物理配列A' },
    { key: 'setup:s2', kind: 'setup', layoutName: 'QWERTY', shapeName: '物理配列A' },
    { key: 'setup:s3', kind: 'setup', layoutName: 'QWERTY', shapeName: '物理配列A' },
  ]);
  for (const n of named) {
    assert.notEqual(n.displayName, '');
  }
  assert.equal(new Set(named.map((n) => n.displayName)).size, 3);
});

test('nameTargets: 同じラベルのSetup同士は種類（Setup n）で区別する', () => {
  const named = nameTargets([
    { key: 'setup:a', kind: 'setup', setupNumber: 1, label: 'A', layoutName: 'QWERTY', shapeName: '物理配列A' },
    { key: 'setup:b', kind: 'setup', setupNumber: 3, label: 'A', layoutName: 'Dvorak', shapeName: '物理配列A' },
    { key: 'layout:colemak', kind: 'layout', layoutName: 'Colemak', shapeName: '物理配列A' },
  ]);
  assert.deepEqual(
    named.map((n) => n.displayName),
    ['A（Setup 1）', 'A（Setup 3）', 'Colemak'],
  );
});

test('nameTargets: 手持ちから消えたSetupは「Setup」を重ねず位置で区別する', () => {
  const named = nameTargets([
    { key: 'setup:ok', kind: 'setup', setupNumber: 1, layoutName: 'QWERTY', shapeName: '物理配列A' },
    { key: 'setup:gone-1', kind: 'setup', failed: true, description: '削除されたSetup' },
    { key: 'setup:gone-2', kind: 'setup', failed: true, description: '削除されたSetup' },
  ]);
  assert.deepEqual(
    named.map((n) => n.displayName),
    ['QWERTY', '削除されたSetup（2番目）', '削除されたSetup（3番目）'],
  );
});

test('nameTargets: 名前が重なった組の中でだけ条件の併記を足す', () => {
  const named = nameTargets([
    { key: 'setup:ax-plain', kind: 'setup', layoutName: 'A', shapeName: 'X' },
    { key: 'setup:ax-cond', kind: 'setup', layoutName: 'A', shapeName: 'X', overrideSummary: '条件' },
    { key: 'setup:ay', kind: 'setup', layoutName: 'A', shapeName: 'Y' },
    { key: 'setup:bx', kind: 'setup', layoutName: 'B', shapeName: 'X' },
  ]);
  assert.deepEqual(
    named.map((n) => n.displayName),
    ['A · X', 'A · X · 条件', 'A · Y', 'B · X'],
  );
});

test('nameTargets: 配列・物理配列・条件がそれぞれ違う6配列は、配列名と物理配列名だけになる', () => {
  const named = nameTargets([
    {
      key: 'layout:qwerty',
      kind: 'layout',
      layoutName: 'QWERTY',
      shapeName: 'ロウスタッガード（ANSI）',
      overrideSummary: '先読みN: 5・ローマ字規則: 標準',
    },
    { key: 'layout:qwerty-opt', kind: 'layout', layoutName: 'QWERTY最適化', shapeName: 'ロウスタッガード（ANSI）', overrideSummary: '先読みN: 5' },
    { key: 'layout:dvorak', kind: 'layout', layoutName: 'Dvorak', shapeName: 'ロウスタッガード（ANSI）' },
    { key: 'layout:oonishi', kind: 'layout', layoutName: '大西配列', shapeName: 'ロウスタッガード（ANSI）', overrideSummary: 'ローマ字規則: 標準' },
    { key: 'layout:naginata', kind: 'layout', layoutName: '薙刀式v18', shapeName: 'オーソリニア（ANSI）', overrideSummary: '親指シフトの振り替え: ON' },
    { key: 'layout:shingeta', kind: 'layout', layoutName: '新下駄', shapeName: 'オーソリニア（ANSI）', overrideSummary: '先読みN: 5' },
  ]);
  assert.deepEqual(
    named.map((n) => n.displayName),
    [
      'QWERTY · ロウスタッガード（ANSI）',
      'QWERTY最適化 · ロウスタッガード（ANSI）',
      'Dvorak · ロウスタッガード（ANSI）',
      '大西配列 · ロウスタッガード（ANSI）',
      '薙刀式v18 · オーソリニア（ANSI）',
      '新下駄 · オーソリニア（ANSI）',
    ],
  );
  for (const n of named) assert.doesNotMatch(n.displayName, /先読み|ローマ字規則|親指シフト/);
});

test('nameTargets: 同じ配列・同じ物理配列で条件だけが違う2対象には条件の併記が付く', () => {
  const named = nameTargets([
    { key: 'setup:a', kind: 'setup', layoutName: 'QWERTY', shapeName: '物理配列A', overrideSummary: '先読みN: 3' },
    { key: 'setup:b', kind: 'setup', layoutName: 'QWERTY', shapeName: '物理配列A', overrideSummary: '先読みN: 5' },
  ]);
  assert.deepEqual(
    named.map((n) => n.displayName),
    ['QWERTY · 先読みN: 3', 'QWERTY · 先読みN: 5'],
  );
});

test('nameTargets: 重なった組で条件の併記が全員同じなら足さず、種類で区別する', () => {
  const named = nameTargets([
    { key: 'layout:a', kind: 'layout', layoutName: 'QWERTY', shapeName: '物理配列A', overrideSummary: '先読みN: 3' },
    { key: 'setup:b', kind: 'setup', setupNumber: 1, layoutName: 'QWERTY', shapeName: '物理配列A', overrideSummary: '先読みN: 3' },
  ]);
  assert.deepEqual(
    named.map((n) => n.displayName),
    ['QWERTY（配列）', 'QWERTY（Setup 1）'],
  );
});

test('nameTargets: 重なった組の外の対象には、条件の併記があっても付けない', () => {
  const named = nameTargets([
    { key: 'setup:a', kind: 'setup', layoutName: 'QWERTY', shapeName: '物理配列A', overrideSummary: '先読みN: 3' },
    { key: 'setup:b', kind: 'setup', layoutName: 'QWERTY', shapeName: '物理配列A' },
    { key: 'setup:c', kind: 'setup', layoutName: 'Dvorak', shapeName: '物理配列A', overrideSummary: '先読みN: 9' },
  ]);
  assert.deepEqual(
    named.map((n) => n.displayName),
    ['QWERTY · 先読みN: 3', 'QWERTY', 'Dvorak'],
  );
});

test('nameTargets: 重なった組にラベル付きの対象が混ざっても、ラベルに条件の併記は付かない', () => {
  const named = nameTargets([
    { key: 'setup:a', kind: 'setup', layoutName: 'QWERTY', shapeName: '物理配列A', overrideSummary: '先読みN: 3' },
    { key: 'setup:b', kind: 'setup', layoutName: 'QWERTY', shapeName: '物理配列A', overrideSummary: '先読みN: 5' },
    { key: 'setup:c', kind: 'setup', label: 'メイン', layoutName: 'QWERTY', shapeName: '物理配列A', overrideSummary: '先読みN: 7' },
  ]);
  assert.deepEqual(
    named.map((n) => n.displayName),
    ['QWERTY · 先読みN: 3', 'QWERTY · 先読みN: 5', 'メイン'],
  );
});

test('nameTargets: 母集団が1件以下の集合（2件のうち1件がラベル付き）は配列名と条件の併記を出す', () => {
  const named = nameTargets([
    { key: 'setup:a', kind: 'setup', label: 'メイン', layoutName: 'QWERTY', shapeName: '物理配列A' },
    { key: 'setup:b', kind: 'setup', layoutName: 'QWERTY', shapeName: '物理配列A', overrideSummary: '先読みN: 5' },
  ]);
  assert.deepEqual(
    named.map((n) => n.displayName),
    ['メイン', 'QWERTY · 先読みN: 5'],
  );
});
