import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserRomajiRule } from '../romaji/rules.ts';
import { buildUserCatalog } from './user-catalog.ts';
import type { UserLayout } from './user-layouts.ts';

const layout = (id: string, overrides: Partial<UserLayout> = {}): UserLayout => ({
  id,
  name: `配列 ${id}`,
  rows: ['1234567890', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'],
  romaji: 'kunrei',
  ...overrides,
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
  assert.deepEqual(catalog.romajiRules.map((r) => r.id), ['romaji-a']);
  assert.deepEqual(catalog.diagnostics, []);
});

test('組み込みの規則と同じidの自作の規則は捨てて診断を積む（組み込みが勝つ）', () => {
  const catalog = buildUserCatalog([], [rule('kunrei'), rule('romaji-a'), rule('azik')]);
  assert.deepEqual(catalog.romajiRules.map((r) => r.id), ['romaji-a']);
  assert.deepEqual(catalog.diagnostics.map((d) => d.path), ['userRomajiRules[0]', 'userRomajiRules[2]']);
});

test('自作の規則のid重複は最初の1件を残す', () => {
  const catalog = buildUserCatalog([], [rule('romaji-a'), rule('romaji-a')]);
  assert.equal(catalog.romajiRules.length, 1);
  assert.deepEqual(catalog.diagnostics.map((d) => d.path), ['userRomajiRules[1]']);
});

test('組み込みの配列と同じidの自作の配列は捨てて診断を積む（組み込みが勝つ）', () => {
  const catalog = buildUserCatalog([layout('qwerty'), layout('user-a')], []);
  assert.deepEqual([...catalog.layouts.keys()], ['user-a']);
  assert.deepEqual(catalog.diagnostics.map((d) => d.path), ['userLayouts[0]']);
});

test('自作の配列のid重複は最初の1件を残す', () => {
  const catalog = buildUserCatalog([layout('user-a'), layout('user-a', { name: '後の方' })], []);
  assert.equal(catalog.userLayouts.get('user-a')?.name, '配列 user-a');
  assert.deepEqual(catalog.diagnostics.map((d) => d.path), ['userLayouts[1]']);
});

test('段の列数が物理配列を超える配列は捨てて診断を積む', () => {
  const catalog = buildUserCatalog([layout('user-long', { rows: ['1234567890123456', 'q', 'a', 'z'] })], []);
  assert.equal(catalog.layouts.size, 0);
  assert.deepEqual(catalog.diagnostics.map((d) => d.path), ['userLayouts[0]']);
});

test('romajiが組み込みか自作の規則を指していれば、配列の推奨として持つ', () => {
  const catalog = buildUserCatalog(
    [layout('user-a', { romaji: 'azik' }), layout('user-b', { romaji: 'romaji-a' })],
    [rule('romaji-a')],
  );
  assert.equal(catalog.layouts.get('user-a')?.recommendedRomajiRuleId, 'azik');
  assert.equal(catalog.layouts.get('user-b')?.recommendedRomajiRuleId, 'romaji-a');
  assert.deepEqual(catalog.diagnostics, []);
});

test('romajiが指す規則が無い配列は残し、推奨を持たせず診断を積む', () => {
  const catalog = buildUserCatalog([layout('user-a', { romaji: 'romaji-gone' })], []);
  assert.equal(catalog.layouts.has('user-a'), true);
  assert.equal(catalog.layouts.get('user-a')?.recommendedRomajiRuleId, undefined);
  assert.deepEqual(catalog.diagnostics.map((d) => d.path), ['userLayouts[0].romaji']);
});

test('捨てた自作の規則を指すromajiは、見つからない扱いになる', () => {
  const catalog = buildUserCatalog([layout('user-a', { romaji: 'romaji-dup' })], []);
  assert.equal(catalog.layouts.get('user-a')?.recommendedRomajiRuleId, undefined);
});

test('directの配列はローマ字を経ないので、romajiが指す規則が無くても診断しない', () => {
  const catalog = buildUserCatalog([layout('user-a', { direct: true, romaji: 'romaji-gone' })], []);
  assert.equal(catalog.layouts.get('user-a')?.recommendedRomajiRuleId, undefined);
  assert.deepEqual(catalog.diagnostics, []);
});
