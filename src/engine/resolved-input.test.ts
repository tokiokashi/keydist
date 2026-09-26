import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { tableForRule } from '#input/romaji/rules.ts';
import { DEFAULT_FINGER_ASSIGNMENT, JIS_FINGER_ASSIGNMENT } from '#input/shapes/geometry.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride } from './settings-items.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { traceKeyOf } from './keys.ts';
import { generateTrace } from '#trace/generate.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

const NO_USER_LAYOUTS = new Map();

function setupFor(layoutId: string, shapeId = 'row-staggered'): Setup {
  return { id: 'setup-1', layoutId, shapeId, colorIndex: 0 };
}

test('ローマ字入力: qwerty + 日本語テキストはkunreiで組んだromajiTableを持つ', () => {
  const result = resolveEngineInput({
    setup: setupFor('qwerty'),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'あいうえお',
    language: 'ja',
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  if (!result.ok) return;
  assert.equal(result.input.romajiRuleId, 'kunrei');
  assert.deepEqual(result.input.layout.romajiTable, tableForRule('kunrei'));
});

test('かな直接入力: nicola + 日本語テキストはromajiTableを持たない', () => {
  const result = resolveEngineInput({
    setup: setupFor('nicola'),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'あいうえお',
    language: 'ja',
  });
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.input.romajiRuleId, null);
  assert.equal(result.input.layout.romajiTable, undefined);
});

// LAYOUT_BY_ID は同じidの配列について、後勝ちでromajiTable付きの実体（LAYOUTS_JA側）を
// 保持している（#input/layouts/kind.ts参照）。英語テキストを直接入力する場面でも
// その静的なromajiTableをそのまま使ってしまうと打ち方が誤って変わるので、
// resolveEngineInputが打ち方（romajiRuleIdの適用可否）で正しく上書きすることを確認する。
test('英字直接入力: qwerty + 英語テキストはLAYOUT_BY_IDの静的romajiTableを引き継がない', () => {
  const catalogEntry = CATALOG.layouts.get('qwerty');
  assert.ok(catalogEntry?.romajiTable, '前提: LAYOUT_BY_IDのqwertyは静的なromajiTableを持つ');

  const result = resolveEngineInput({
    setup: setupFor('qwerty'),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'the quick brown fox',
    language: 'en',
  });
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.input.romajiRuleId, null);
  assert.equal(result.input.layout.romajiTable, undefined);
});

test('参照エラー: 手持ちに無いlayoutIdは値でreference失敗を返す', () => {
  const result = resolveEngineInput({
    setup: setupFor('no-such-layout'),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'hello',
    language: 'en',
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, 'reference');
});

test('テキスト不一致: かな配列に英語テキストは値でincompatible-text失敗を返す', () => {
  const result = resolveEngineInput({
    setup: setupFor('nicola'),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'hello',
    language: 'en',
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, 'incompatible-text');
});

test('指割り当て: 既定はDEFAULT_FINGER_ASSIGNMENT、setupレベルの上書きでJIS既定へ切り替わる', () => {
  const defaultResult = resolveEngineInput({
    setup: setupFor('qwerty'),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'hello',
    language: 'en',
  });
  assert.ok(defaultResult.ok);
  if (defaultResult.ok) assert.equal(defaultResult.input.geometry.assignment.id, DEFAULT_FINGER_ASSIGNMENT.id);

  const write = setSettingsOverride(
    EMPTY_SETTINGS_OVERRIDES,
    { kind: 'setup', setupId: 'setup-1' },
    'fingerAssignmentId',
    JIS_FINGER_ASSIGNMENT.id,
  );
  assert.ok(write.ok);
  if (!write.ok) return;

  const overriddenResult = resolveEngineInput({
    setup: setupFor('qwerty'),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    overrides: write.overrides,
    text: 'hello',
    language: 'en',
  });
  assert.ok(overriddenResult.ok);
  if (overriddenResult.ok) {
    assert.equal(overriddenResult.input.geometry.assignment.id, JIS_FINGER_ASSIGNMENT.id);
  }
});

test('自作の指割り当て: customFingerAssignmentsの手持ちから解決する', () => {
  const custom = { ...DEFAULT_FINGER_ASSIGNMENT, id: 'finger-custom', name: '自作運指' };
  const write = setSettingsOverride(
    EMPTY_SETTINGS_OVERRIDES,
    { kind: 'setup', setupId: 'setup-1' },
    'fingerAssignmentId',
    custom.id,
  );
  assert.ok(write.ok);
  if (!write.ok) return;

  const result = resolveEngineInput({
    setup: setupFor('qwerty'),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    customFingerAssignments: new Map([[custom.id, custom]]),
    overrides: write.overrides,
    text: 'hello',
    language: 'en',
  });
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.input.geometry.assignment.id, custom.id);
  assert.equal(result.input.cascade.fingerAssignmentId.diagnostics.length, 0);
});

test('自作の指割り当て: 存在しないidは既定へfallbackし、診断を積む（手持ちが空のケース）', () => {
  const write = setSettingsOverride(
    EMPTY_SETTINGS_OVERRIDES,
    { kind: 'setup', setupId: 'setup-1' },
    'fingerAssignmentId',
    'finger-deleted',
  );
  assert.ok(write.ok);
  if (!write.ok) return;

  const result = resolveEngineInput({
    setup: setupFor('qwerty'),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    overrides: write.overrides,
    text: 'hello',
    language: 'en',
  });
  assert.ok(result.ok);
  if (!result.ok) return;
  // 自作割り当てを削除した後にそれを指す上書きが残っているケースと同じ形（engine/commands.tsの
  // deleteFingerAssignmentCommandコメント参照）。値でfallbackし、診断を残す。
  assert.equal(result.input.geometry.assignment.id, DEFAULT_FINGER_ASSIGNMENT.id);
  assert.equal(result.input.cascade.fingerAssignmentId.value, DEFAULT_FINGER_ASSIGNMENT.id);
  assert.equal(result.input.cascade.fingerAssignmentId.diagnostics.length, 1);
  assert.equal(result.input.cascade.fingerAssignmentId.diagnostics[0]!.kind, 'invalid-fallback');
});

test('自作の指割り当て: 中身が変わるとTraceのキーが変わる（Geometryを丸ごとキーにしているため）', () => {
  const customA = { ...DEFAULT_FINGER_ASSIGNMENT, id: 'finger-x', name: 'A', keyFinger: { ...DEFAULT_FINGER_ASSIGNMENT.keyFinger } };
  assert.notEqual(customA.keyFinger.q, 'RP', '前提: qは既定でLPを担当する（列固定の既定）');
  const customB = { ...customA, keyFinger: { ...customA.keyFinger, q: 'RP' as const } };

  const write = setSettingsOverride(
    EMPTY_SETTINGS_OVERRIDES,
    { kind: 'setup', setupId: 'setup-1' },
    'fingerAssignmentId',
    'finger-x',
  );
  assert.ok(write.ok);
  if (!write.ok) return;

  const resultA = resolveEngineInput({
    setup: setupFor('qwerty'),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    customFingerAssignments: new Map([[customA.id, customA]]),
    overrides: write.overrides,
    text: 'hello',
    language: 'en',
  });
  const resultB = resolveEngineInput({
    setup: setupFor('qwerty'),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    customFingerAssignments: new Map([[customB.id, customB]]),
    overrides: write.overrides,
    text: 'hello',
    language: 'en',
  });
  assert.ok(resultA.ok && resultB.ok);
  if (!resultA.ok || !resultB.ok) return;
  assert.notDeepEqual(resultA.input.geometry, resultB.input.geometry);
  assert.notEqual(traceKeyOf(resultA.input), traceKeyOf(resultB.input));
});

test('自作の指割り当て: 組み込みdefaultと同じ中身（keyFinger/homeKey）を作ると同じ数値が出る', () => {
  // idと名前だけ変え、中身（keyFinger/homeKey）はDEFAULT_FINGER_ASSIGNMENTと完全に同じにする。
  // 数値そのものはassignment.id・nameを見ない（generateTraceはgeometry.keys/homesしか見ない）ので、
  // 「中身が同じなら同じ数値」が実行して確かめられるはず（AGENTS.md「数値は必ず実行して出す」）。
  const sameContent = {
    ...DEFAULT_FINGER_ASSIGNMENT,
    id: 'finger-same-as-default',
    name: '既定と同じ中身の自作運指',
  };
  const write = setSettingsOverride(
    EMPTY_SETTINGS_OVERRIDES,
    { kind: 'setup', setupId: 'setup-1' },
    'fingerAssignmentId',
    sameContent.id,
  );
  assert.ok(write.ok);
  if (!write.ok) return;

  const text = 'the quick brown fox jumps over the lazy dog';
  const builtinResult = resolveEngineInput({
    setup: setupFor('qwerty'),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language: 'en',
  });
  const customResult = resolveEngineInput({
    setup: setupFor('qwerty'),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    customFingerAssignments: new Map([[sameContent.id, sameContent]]),
    overrides: write.overrides,
    text,
    language: 'en',
  });
  assert.ok(builtinResult.ok && customResult.ok);
  if (!builtinResult.ok || !customResult.ok) return;

  const builtinTrace = generateTrace(text, builtinResult.input.layout, builtinResult.input.geometry, builtinResult.input.tracePolicy);
  const customTrace = generateTrace(text, customResult.input.layout, customResult.input.geometry, customResult.input.tracePolicy);

  const totalDistance = (trace: typeof builtinTrace) => trace.strokes.reduce((sum, stroke) => sum + stroke.distance, 0);
  assert.equal(totalDistance(customTrace), totalDistance(builtinTrace));
  assert.equal(customTrace.strokes.length, builtinTrace.strokes.length);
  assert.notEqual(customResult.input.geometry.assignment.id, builtinResult.input.geometry.assignment.id, '前提: idそのものは違う');
});

test('形状エラー: 指割り当てが噛み合わない自作形状は値でgeometry失敗を返す', () => {
  const brokenShape: PhysicalShape = {
    ...PHYSICAL_SHAPES['row-staggered'],
    id: 'shape-broken',
    // 最下段だけ既定の指割り当てが持たない列数まで広げる。
    rowWidths: [12, 12, 11, 14],
  };
  const catalog = {
    layouts: CATALOG.layouts,
    shapes: new Map([[brokenShape.id, brokenShape]]),
  };
  const result = resolveEngineInput({
    setup: setupFor('qwerty', 'shape-broken'),
    catalog,
    userLayouts: NO_USER_LAYOUTS,
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'hello',
    language: 'en',
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, 'geometry');
});
