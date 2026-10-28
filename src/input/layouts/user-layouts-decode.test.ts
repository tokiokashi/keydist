import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeUserLayouts, USER_LAYOUTS_CODEC, type StageUserLayout } from './user-layouts.ts';

const layout = (id: string): StageUserLayout => ({
  kind: 'alpha',
  id,
  name: `配列 ${id}`,
  rows: ['1234567890', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'],
  romaji: 'kunrei',
});

test('配列でない値は空にして診断を1件積む（nullを含む）', () => {
  for (const value of ['text', { a: 1 }, 3, null]) {
    const result = decodeUserLayouts(value);
    assert.deepEqual(result.value, [], JSON.stringify(value));
    assert.equal(result.diagnostics.length, 1, JSON.stringify(value));
  }
});

test('undefinedは診断なしの空', () => {
  assert.deepEqual(decodeUserLayouts(undefined), { value: [], diagnostics: [] });
});

test('正常な一覧は値が変わらず診断も無い', () => {
  const layouts = [layout('user-a'), { ...layout('user-b'), homeKeys: { 'L-index': 'f' } }];
  const result = decodeUserLayouts(structuredClone(layouts));
  assert.deepEqual(result.value, layouts);
  assert.deepEqual(result.diagnostics, []);
});

test('かなを直接打つ段の形（direct）の配列は、面の形でしか持てないので捨てて診断を積む', () => {
  const result = decodeUserLayouts([layout('user-a'), { ...layout('user-b'), direct: true }]);
  assert.deepEqual(
    result.value.map((l) => l.id),
    ['user-a'],
  );
  assert.deepEqual(
    result.diagnostics.map((d) => d.path),
    ['[1]'],
  );
});

test('壊れた要素とid重複は捨てて、その数だけ診断を積む', () => {
  const result = decodeUserLayouts([layout('user-a'), { id: 1 }, null, layout('user-a'), layout('user-c')]);
  assert.deepEqual(
    result.value.map((l) => l.id),
    ['user-a', 'user-c'],
  );
  assert.deepEqual(
    result.diagnostics.map((d) => d.path),
    ['[1]', '[2]', '[3]'],
  );
});

test('USER_LAYOUTS_CODEC: 往復で値が変わらず、版1の文書になる', () => {
  const layouts = [layout('user-a'), { ...layout('user-b'), homeKeys: { LI: 'f' } }];
  const encoded = USER_LAYOUTS_CODEC.encode(layouts);
  assert.equal(encoded.version, 1);
  const decoded = USER_LAYOUTS_CODEC.decode(JSON.parse(JSON.stringify(encoded)));
  assert.deepEqual(decoded, { ok: true, value: layouts, diagnostics: [] });
});

test('USER_LAYOUTS_CODEC: 版の無い値・未来の版は失敗理由を返す', () => {
  assert.deepEqual(USER_LAYOUTS_CODEC.decode([layout('user-a')]), { ok: false, reason: { kind: 'not-an-object' } });
  assert.deepEqual(USER_LAYOUTS_CODEC.decode({ layouts: [] }), { ok: false, reason: { kind: 'missing-version' } });
  assert.deepEqual(USER_LAYOUTS_CODEC.decode({ version: 2, layouts: [] }), {
    ok: false,
    reason: { kind: 'future-version', version: 2, currentVersion: 1 },
  });
});

test('USER_LAYOUTS_CODEC: layoutsが無ければ診断なしの空、配列でなければ診断1件の空', () => {
  assert.deepEqual(USER_LAYOUTS_CODEC.decode({ version: 1 }), { ok: true, value: [], diagnostics: [] });
  const broken = USER_LAYOUTS_CODEC.decode({ version: 1, layouts: 'x' });
  assert.ok(broken.ok);
  assert.deepEqual(broken.value, []);
  assert.deepEqual(
    broken.diagnostics.map((d) => d.path),
    ['layouts'],
  );
});

test('USER_LAYOUTS_CODEC: 壊れた要素・romajiが文字列でない要素・id重複は捨てて、経路付きの診断を積む', () => {
  const badRomaji = { id: 'user-x', name: 'x', rows: ['', 'q', 'a', 'z'], romaji: 1 };
  const decoded = USER_LAYOUTS_CODEC.decode({
    version: 1,
    layouts: [layout('user-a'), { id: 1 }, badRomaji, layout('user-a'), layout('user-c')],
  });
  assert.ok(decoded.ok);
  assert.deepEqual(
    decoded.value.map((l) => l.id),
    ['user-a', 'user-c'],
  );
  assert.deepEqual(
    decoded.diagnostics.map((d) => d.path),
    ['layouts[1]', 'layouts[2]', 'layouts[3]'],
  );
});

test('USER_LAYOUTS_CODEC: romajiの無い要素は、推奨の規則を持たない配列として残す', () => {
  const decoded = USER_LAYOUTS_CODEC.decode({ version: 1, layouts: [{ kind: 'alpha', id: 'user-x', name: 'x', rows: ['', 'q', 'a', 'z'] }] });
  assert.ok(decoded.ok);
  assert.deepEqual(
    decoded.value.map((l) => l.id),
    ['user-x'],
  );
  assert.deepEqual(decoded.diagnostics, []);
});
