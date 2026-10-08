import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeStoredRomajiSettings, type UserRomajiRule } from './rules.ts';
import { USER_ROMAJI_RULES_CODEC } from './user-rules-codec.ts';

const rule = (id: string, overrides: Record<string, string> = { し: 'si' }): UserRomajiRule => ({
  id,
  name: `規則 ${id}`,
  base: 'kunrei',
  overrides,
  generateSokuon: true,
});

test('往復で値が変わらず、版1の文書になる', () => {
  const rules = [rule('rule-a'), rule('rule-b', {})];
  const encoded = USER_ROMAJI_RULES_CODEC.encode(rules);
  assert.equal(encoded.version, 1);
  const decoded = USER_ROMAJI_RULES_CODEC.decode(JSON.parse(JSON.stringify(encoded)));
  assert.deepEqual(decoded, { ok: true, value: rules, diagnostics: [] });
});

test('符号化は入力の規則と上書きを共有しない', () => {
  const rules = [rule('rule-a')];
  const encoded = USER_ROMAJI_RULES_CODEC.encode(rules) as { rules: UserRomajiRule[] };
  encoded.rules[0].overrides['ち'] = 'ti';
  assert.deepEqual(rules[0].overrides, { し: 'si' });
});

test('版の無い値・未来の版は失敗理由を返す', () => {
  assert.deepEqual(USER_ROMAJI_RULES_CODEC.decode({ rules: [] }), { ok: false, reason: { kind: 'missing-version' } });
  assert.deepEqual(USER_ROMAJI_RULES_CODEC.decode({ version: 2, rules: [] }), {
    ok: false,
    reason: { kind: 'future-version', version: 2, currentVersion: 1 },
  });
});

test('rulesが無ければ診断なしの空、配列でなければ診断1件の空', () => {
  assert.deepEqual(USER_ROMAJI_RULES_CODEC.decode({ version: 1 }), { ok: true, value: [], diagnostics: [] });
  const broken = USER_ROMAJI_RULES_CODEC.decode({ version: 1, rules: null });
  assert.ok(broken.ok);
  assert.deepEqual(broken.value, []);
  assert.deepEqual(broken.diagnostics.map((d) => d.path), ['rules']);
});

test('壊れた要素とid重複は捨てて、最初の1件を残し、経路付きの診断を積む', () => {
  const decoded = USER_ROMAJI_RULES_CODEC.decode({
    version: 1,
    rules: [rule('rule-a'), { id: 'bad' }, null, rule('rule-a', { ち: 'ti' }), rule('rule-c')],
  });
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value.map((r) => [r.id, r.overrides]), [['rule-a', { し: 'si' }], ['rule-c', { し: 'si' }]]);
  assert.deepEqual(decoded.diagnostics.map((d) => d.path), ['rules[1]', 'rules[2]', 'rules[3]']);
  assert.match(decoded.diagnostics[2].message, /重複/);
});

test('版を持たない旧形式の読み取りも、id重複を同じ扱いにする', () => {
  const result = decodeStoredRomajiSettings({ rules: [rule('rule-a'), rule('rule-a')], assignments: {} });
  assert.deepEqual(result.value.rules.map((r) => r.id), ['rule-a']);
  assert.deepEqual(result.diagnostics.map((d) => d.path), ['rules[1]']);
});
