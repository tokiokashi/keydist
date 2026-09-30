import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeStoredRomajiSettings, type RomajiSettings } from './rules.ts';

const rule = { id: 'rule-a', name: '自作', base: 'kunrei', overrides: { し: 'si' }, generateSokuon: true } as const;

test('想定の形でない値は空にして診断を1件積む（nullを含む）', () => {
  for (const value of ['text', [], 3, null]) {
    const result = decodeStoredRomajiSettings(value);
    assert.deepEqual(result.value, { rules: [], assignments: {} }, JSON.stringify(value));
    assert.equal(result.diagnostics.length, 1, JSON.stringify(value));
  }
});

test('undefinedは診断なしの空', () => {
  assert.deepEqual(decodeStoredRomajiSettings(undefined), {
    value: { rules: [], assignments: {} },
    diagnostics: [],
  });
});

test('項目が無い時は診断なし、あって形が違う時は診断1件', () => {
  assert.deepEqual(decodeStoredRomajiSettings({}).diagnostics, []);
  assert.deepEqual(decodeStoredRomajiSettings({ rules: 'x' }).diagnostics.map((d) => d.path), ['rules']);
  assert.deepEqual(decodeStoredRomajiSettings({ assignments: null }).diagnostics.map((d) => d.path), ['assignments']);
});

test('正常な値は変わらず診断も無い', () => {
  const settings: RomajiSettings = { rules: [{ ...rule, overrides: { ...rule.overrides } }], assignments: { 'user-a': 'rule-a' } };
  const result = decodeStoredRomajiSettings(structuredClone(settings));
  assert.deepEqual(result.value, settings);
  assert.deepEqual(result.diagnostics, []);
});

test('予約名のキーの割り当ては診断付きで捨て、ほかは読む', () => {
  // リテラルに__proto__と書くと自分のプロパティにならないので、JSON.parseで作る
  const raw = JSON.parse('{"rules":[],"assignments":{"__proto__":"rule-a","constructor":"rule-b","x":"y"}}');
  const result = decodeStoredRomajiSettings(raw);
  assert.deepEqual(Object.keys(result.value.assignments), ['x']);
  assert.equal(Object.getPrototypeOf(result.value.assignments), Object.prototype);
  assert.deepEqual(result.diagnostics.map((d) => d.path), ['assignments.__proto__', 'assignments.constructor']);
});

test('壊れた規則・割り当ては捨てて診断を積み、残りは読む', () => {
  const result = decodeStoredRomajiSettings({
    rules: [rule, { id: 'bad' }, null],
    assignments: { ok: 'rule-a', broken: 5 },
  });
  assert.deepEqual(result.value.rules.map((r) => r.id), ['rule-a']);
  assert.deepEqual(result.value.assignments, { ok: 'rule-a' });
  assert.deepEqual(result.diagnostics.map((d) => d.path), ['rules[1]', 'rules[2]', 'assignments.broken']);
});
