import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnalysisTarget } from '#input/setup/index.ts';
import { MULTI_TARGET_SELECTION_CODEC } from './multi-target-selection-codec.ts';
import { effectiveMultiBaseline } from './multi-target-selection.ts';

const A: AnalysisTarget = { kind: 'setup', setupId: 'a' };
const B: AnalysisTarget = { kind: 'setup', setupId: 'b' };
const C: AnalysisTarget = { kind: 'layout', layoutId: 'c' };

function decodeValue(raw: unknown) {
  const decoded = MULTI_TARGET_SELECTION_CODEC.decode(raw);
  assert.equal(decoded.ok, true);
  return decoded.ok ? decoded : assert.fail('decodeに失敗した');
}

test('MULTI_TARGET_SELECTION_CODEC: encode→decodeで往復する', () => {
  for (const state of [
    { targets: [A, B, C], baseline: A, colorSlots: [2, 0, 1] },
    { targets: [], baseline: undefined, colorSlots: [] },
  ]) {
    assert.deepEqual(decodeValue(MULTI_TARGET_SELECTION_CODEC.encode(state)).value, state);
  }
});

test('MULTI_TARGET_SELECTION_CODEC: Analyzer idで引かない1つの集合として保存する', () => {
  const encoded = MULTI_TARGET_SELECTION_CODEC.encode({ targets: [A], baseline: undefined, colorSlots: [0] });
  assert.deepEqual(encoded, { version: 1, targets: [A], colorSlots: [0] });
});

test('MULTI_TARGET_SELECTION_CODEC: 重複した対象は1つに畳んで読む', () => {
  const decoded = decodeValue({ version: 1, targets: [A, B, A] });
  assert.deepEqual(decoded.value.targets, [A, B]);
  assert.ok(decoded.diagnostics.length > 0, '重複を畳んだことの診断が残る');
});

test('MULTI_TARGET_SELECTION_CODEC: 選択に含まれないbaselineも記録として残り、効く基準はなし', () => {
  const decoded = decodeValue({ version: 1, targets: [A], baseline: B });
  assert.deepEqual(decoded.value.baseline, B);
  assert.equal(effectiveMultiBaseline(decoded.value), undefined);
  const again = decodeValue(MULTI_TARGET_SELECTION_CODEC.encode(decoded.value));
  assert.deepEqual(again.value.baseline, B, '外している間の記録もencode→decodeで残る');
});

test('MULTI_TARGET_SELECTION_CODEC: 壊れた対象（未知kind）はその1件だけ捨てて読む', () => {
  const decoded = decodeValue({ version: 1, targets: [A, { kind: 'workspace', workspaceId: 'x' }, B] });
  assert.deepEqual(decoded.value.targets, [A, B]);
});

test('MULTI_TARGET_SELECTION_CODEC: targetsが無ければ空の集合、配列でなければ診断付きで空の集合', () => {
  assert.deepEqual(decodeValue({ version: 1 }).value, { targets: [], baseline: undefined, colorSlots: [] });
  const broken = decodeValue({ version: 1, targets: 'not-an-array' });
  assert.deepEqual(broken.value.targets, []);
  assert.ok(broken.diagnostics.length > 0);
});

test('MULTI_TARGET_SELECTION_CODEC: object形式でなければdecode自体が失敗する', () => {
  assert.equal(MULTI_TARGET_SELECTION_CODEC.decode('not-an-object').ok, false);
});

test('MULTI_TARGET_SELECTION_CODEC: 色の番号が無ければ並びの順に配り直す（診断なし）', () => {
  const decoded = decodeValue({ version: 1, targets: [A, B] });
  assert.deepEqual(decoded.value.colorSlots, [0, 1]);
  assert.deepEqual(decoded.diagnostics, []);
});

test('MULTI_TARGET_SELECTION_CODEC: 捨てた対象の番号は読まず、残った対象は自分の番号を保つ', () => {
  const decoded = decodeValue({ version: 1, targets: [A, { kind: 'workspace', workspaceId: 'x' }, B], colorSlots: [3, 0, 1] });
  assert.deepEqual(decoded.value.colorSlots, [3, 1]);
});

test('MULTI_TARGET_SELECTION_CODEC: 範囲外の色の番号は壊れた値として配り直す', () => {
  const decoded = decodeValue({ version: 1, targets: [A, B], colorSlots: [0, 12] });
  assert.deepEqual(decoded.value.colorSlots, [0, 1]);
});

test('MULTI_TARGET_SELECTION_CODEC: colorSlotsが配列でなければ診断を1件積んで配り直す。undefinedは診断なし', () => {
  for (const broken of ['0,1', { 0: 1 }, 5, null]) {
    const decoded = decodeValue({ version: 1, targets: [A, B], colorSlots: broken });
    assert.deepEqual(decoded.value.colorSlots, [0, 1]);
    assert.deepEqual(decoded.diagnostics.map((d) => d.path), ['payload.colorSlots'], `値: ${JSON.stringify(broken)}`);
  }
  const absent = decodeValue({ version: 1, targets: [A, B], colorSlots: undefined });
  assert.deepEqual(absent.diagnostics, []);
});
