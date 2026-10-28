import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserRomajiRule } from '../romaji/rules.ts';
import { buildUserCatalog, userInputLayouts } from './user-catalog.ts';
import type { FaceUserLayout, StageUserLayout } from './user-layouts.ts';

const layout = (id: string, overrides: Partial<StageUserLayout> = {}): StageUserLayout => ({
  kind: 'alpha',
  id,
  name: `配列 ${id}`,
  rows: ['1234567890', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'],
  romaji: 'kunrei',
  ...overrides,
});

const faceLayout = (id: string): FaceUserLayout => ({
  kind: 'kana',
  id,
  name: `面の配列 ${id}`,
  faces: [{ trigger: [], inputRole: 'layer', outputs: { a: 'あ' } }],
  composition: { dakuten: false, handakuten: false },
});

const rule = (id: string): UserRomajiRule => ({
  id,
  name: `規則 ${id}`,
  base: 'kunrei',
  overrides: { し: 'shi' },
  generateSokuon: true,
});

test('自作の配列と規則はそのまま解決できる形になり、診断は無い', () => {
  const catalog = buildUserCatalog([layout('user-a')], [rule('romaji-a')]);
  assert.deepEqual([...catalog.layouts.keys()], ['user-a']);
  assert.deepEqual([...catalog.userLayouts.keys()], ['user-a']);
  assert.deepEqual(
    catalog.romajiRules.map((r) => r.id),
    ['romaji-a'],
  );
  assert.deepEqual(catalog.diagnostics, []);
});

test('組み込みの規則と同じidの自作の規則は捨てて診断を積む（組み込みが勝つ）', () => {
  const catalog = buildUserCatalog([], [rule('kunrei'), rule('romaji-a'), rule('azik')]);
  assert.deepEqual(
    catalog.romajiRules.map((r) => r.id),
    ['romaji-a'],
  );
  assert.deepEqual(
    catalog.diagnostics.map((d) => d.path),
    ['userRomajiRules[0]', 'userRomajiRules[2]'],
  );
});

test('自作の規則のid重複は最初の1件を残す', () => {
  const catalog = buildUserCatalog([], [rule('romaji-a'), rule('romaji-a')]);
  assert.equal(catalog.romajiRules.length, 1);
  assert.deepEqual(
    catalog.diagnostics.map((d) => d.path),
    ['userRomajiRules[1]'],
  );
});

test('組み込みの配列と同じidの自作の配列は捨てて診断を積む（組み込みが勝つ）', () => {
  const catalog = buildUserCatalog([layout('qwerty'), layout('user-a')], []);
  assert.deepEqual([...catalog.layouts.keys()], ['user-a']);
  assert.deepEqual(
    catalog.diagnostics.map((d) => d.path),
    ['userLayouts[0]'],
  );
});

test('自作の配列のid重複は最初の1件を残す', () => {
  const catalog = buildUserCatalog([layout('user-a'), layout('user-a', { name: '後の方' })], []);
  assert.equal(catalog.userLayouts.get('user-a')?.name, '配列 user-a');
  assert.deepEqual(
    catalog.diagnostics.map((d) => d.path),
    ['userLayouts[1]'],
  );
});

test('段の列数が物理配列を超える配列は捨てて診断を積む', () => {
  const catalog = buildUserCatalog([layout('user-long', { rows: ['1234567890123456', 'q', 'a', 'z'] })], []);
  assert.equal(catalog.layouts.size, 0);
  assert.deepEqual(
    catalog.diagnostics.map((d) => d.path),
    ['userLayouts[0]'],
  );
});

test('romajiが組み込みか自作の規則を指していれば、配列の推奨として持つ', () => {
  const catalog = buildUserCatalog([layout('user-a', { romaji: 'azik' }), layout('user-b', { romaji: 'romaji-a' })], [rule('romaji-a')]);
  assert.equal(catalog.layouts.get('user-a')?.recommendedRomajiRuleId, 'azik');
  assert.equal(catalog.layouts.get('user-b')?.recommendedRomajiRuleId, 'romaji-a');
  assert.deepEqual(catalog.diagnostics, []);
});

test('romajiが指す規則が無い配列は残し、推奨を持たせず診断を積む', () => {
  const catalog = buildUserCatalog([layout('user-a', { romaji: 'romaji-gone' })], []);
  assert.equal(catalog.layouts.has('user-a'), true);
  assert.equal(catalog.layouts.get('user-a')?.recommendedRomajiRuleId, undefined);
  assert.deepEqual(
    catalog.diagnostics.map((d) => d.path),
    ['userLayouts[0].romaji'],
  );
});

test('romajiを持たない配列は残し、推奨を持たせず、診断も積まない', () => {
  const { romaji: _omitted, ...withoutRomaji } = layout('user-a');
  const catalog = buildUserCatalog([withoutRomaji], []);
  assert.equal(catalog.layouts.has('user-a'), true);
  assert.equal(catalog.layouts.get('user-a')?.recommendedRomajiRuleId, undefined);
  assert.deepEqual(catalog.diagnostics, []);
});

test('捨てた自作の規則を指すromajiは、見つからない扱いになる', () => {
  const catalog = buildUserCatalog([layout('user-a', { romaji: 'romaji-dup' })], []);
  assert.equal(catalog.layouts.get('user-a')?.recommendedRomajiRuleId, undefined);
});

test('面で定義する配列はローマ字を経ないので、診断しない', () => {
  const catalog = buildUserCatalog([faceLayout('user-a')], []);
  assert.equal(catalog.layouts.get('user-a')?.recommendedRomajiRuleId, undefined);
  assert.deepEqual(catalog.diagnostics, []);
});

test('計算に使えない配列は、入力の添字ごとに利用者向けの理由を持つ', () => {
  const catalog = buildUserCatalog(
    [
      layout('qwerty'),
      layout('user-ok'),
      layout('user-long', { rows: ['1234567890123456', 'q', 'a', 'z'] }),
      layout('user-empty', { rows: ['', '', '', ''] }),
      layout('user-bad', { romaji: 'romaji-gone' }),
    ],
    [],
  );
  assert.deepEqual([...catalog.unusableLayouts.keys()], [0, 2, 3]);
  assert.match(catalog.unusableLayouts.get(0)!, /組み込みの配列と識別子が同じため、計算には使えません/);
  assert.match(catalog.unusableLayouts.get(2)!, /計算には使えません（.*個までしか置けません）/);
  assert.match(catalog.unusableLayouts.get(3)!, /計算には使えません（英字の段が空）/);
  for (const reason of catalog.unusableLayouts.values()) assert.doesNotMatch(reason, /捨て/);
});

test('組み立てで例外が出る配列は、例外の文を出さず固定の理由にする', () => {
  const catalog = buildUserCatalog([layout('user-empty-seq', { sequences: [['a', []]] })], []);
  assert.equal(catalog.layouts.size, 0);
  assert.match(catalog.diagnostics[0]!.message, /step/);
  assert.equal(catalog.unusableLayouts.get(0), '配列の定義から打鍵を組み立てられないため、計算には使えません。定義を見直してください');
});

test('Tester用の配列は、自作のローマ字規則の表で変換する', () => {
  const layouts = userInputLayouts([layout('user-a', { romaji: 'romaji-a' })], [rule('romaji-a')]);
  assert.deepEqual(
    layouts.map((l) => l.id),
    ['user-a'],
  );
  assert.equal(layouts[0]!.romajiTable?.get('し'), 'shi');
  const builtin = userInputLayouts([layout('user-b', { romaji: 'kunrei' })], []);
  assert.equal(builtin[0]!.romajiTable?.get('し'), 'si');
});

test('Tester用の配列は、面で定義する配列・規則なし・規則が見つからない配列に表を持たせず、使えない配列を除く', () => {
  const { romaji: _noRule, ...withoutRule } = layout('user-none');
  const layouts = userInputLayouts([faceLayout('user-direct'), withoutRule, layout('user-missing', { romaji: 'romaji-none' }), layout('qwerty')], []);
  assert.deepEqual(
    layouts.map((l) => l.id),
    ['user-direct', 'user-none', 'user-missing'],
  );
  assert.ok(layouts.every((l) => l.romajiTable === undefined));
});
