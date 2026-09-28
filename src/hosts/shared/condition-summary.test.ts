import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { DEFAULT_FINGER_ASSIGNMENT, PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES, resolveSettings, setSettingsOverride } from '#engine/settings-items.ts';
import { resolveSetupForText } from '#input/setup/index.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import {
  conditionHeaderInfo,
  conditionHeaderInfoFromResolvedInput,
  conditionDiagnosticText,
  formatOrigin,
  nonDefaultConditionRows,
  type ConditionSummaryRow,
  summarizeNonDefaultConditions,
  traceConditionSummary,
} from './condition-summary.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};
const NO_USER_LAYOUTS = new Map();

function setupFor(layoutId: string, shapeId = 'row-staggered'): Setup {
  return { id: 'setup-1', layoutId, shapeId };
}

test('traceConditionSummary: 既定値のみなら全項目がdefault originになる', () => {
  const resolution = resolveSetupForText(setupFor('qwerty'), CATALOG, NO_USER_LAYOUTS, 'en');
  assert.ok(resolution.ok);
  if (!resolution.ok) return;
  const cascade = resolveSettings(EMPTY_SETTINGS_OVERRIDES, resolution.context);
  const rows = traceConditionSummary(cascade);
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(row.origin.kind, row.id === 'fingerAssignmentId' || row.id === 'romajiRuleId' ? row.origin.kind : 'default');
  }
  const windowSize = rows.find((row) => row.id === 'windowSize');
  assert.equal(windowSize?.format, 'primitive');
  assert.equal(windowSize?.displayValue, '3');
});

test('traceConditionSummary: setupレベルで上書きすると出どころがそのレベルになる', () => {
  const resolution = resolveSetupForText(setupFor('qwerty'), CATALOG, NO_USER_LAYOUTS, 'en');
  assert.ok(resolution.ok);
  if (!resolution.ok) return;
  const written = setSettingsOverride(
    EMPTY_SETTINGS_OVERRIDES,
    { kind: 'setup', setupId: 'setup-1' },
    'windowSize',
    5,
  );
  assert.ok(written.ok);
  const cascade = resolveSettings(written.ok ? written.overrides : EMPTY_SETTINGS_OVERRIDES, resolution.context);
  const rows = traceConditionSummary(cascade);
  const windowSize = rows.find((row) => row.id === 'windowSize');
  assert.equal(windowSize?.displayValue, '5');
  assert.deepEqual(windowSize?.origin, { kind: 'setup', setupId: 'setup-1' });
  assert.equal(formatOrigin(windowSize!.origin), '上書き: このSetup');
});

test('traceConditionSummary: シフト系キーの項目もオブジェクトのまま出さず、短い値へ要約する', () => {
  const resolution = resolveSetupForText(setupFor('qwerty'), CATALOG, NO_USER_LAYOUTS, 'en');
  assert.ok(resolution.ok);
  if (!resolution.ok) return;
  const cascade = resolveSettings(EMPTY_SETTINGS_OVERRIDES, resolution.context);
  const rows = traceConditionSummary(cascade);
  const trigger = rows.find((row) => row.id === 'triggerRealizationPolicy');
  assert.equal(trigger?.format, 'primitive');
});

test('conditionHeaderInfo: 配列・形状・指割当の名前を集める', () => {
  const resolution = resolveSetupForText(setupFor('qwerty'), CATALOG, NO_USER_LAYOUTS, 'en');
  assert.ok(resolution.ok);
  if (!resolution.ok) return;
  const info = conditionHeaderInfo(resolution.layout, resolution.shape, DEFAULT_FINGER_ASSIGNMENT);
  assert.equal(info.layoutName, resolution.layout.name);
  assert.equal(info.shapeName, resolution.shape.name);
  assert.equal(info.fingerAssignmentName, DEFAULT_FINGER_ASSIGNMENT.name);
});

test('conditionHeaderInfoFromResolvedInput: ResolvedInputのgeometryから名前を集める', () => {
  const result = resolveEngineInput({
    target: { kind: 'setup', setupId: (setupFor('qwerty')).id },
    setups: new Map([[(setupFor('qwerty')).id, setupFor('qwerty')]]),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'hello',
    language: 'en',
  });
  assert.ok(result.ok);
  if (!result.ok) return;
  const info = conditionHeaderInfoFromResolvedInput(result.input.layout, result.input.geometry);
  assert.equal(info.layoutName, result.input.layout.name);
  assert.equal(info.shapeName, result.input.geometry.name);
  assert.equal(info.fingerAssignmentName, result.input.geometry.assignment.name);
});

function resolveWith(
  target: { kind: 'layout'; layoutId: string } | { kind: 'setup'; setupId: string },
  setups: readonly Setup[],
  overrides: typeof EMPTY_SETTINGS_OVERRIDES,
  language: 'en' | 'ja',
) {
  const result = resolveEngineInput({
    target,
    setups: new Map(setups.map((setup) => [setup.id, setup])),
    catalog: CATALOG,
    userLayouts: NO_USER_LAYOUTS,
    overrides,
    text: language === 'ja' ? 'あいうえお' : 'hello',
    language,
  });
  assert.ok(result.ok);
  if (!result.ok) throw new Error('unreachable');
  return result.input;
}

test('nonDefaultConditionRows: 効かない行（Setup対象の既定の物理配列）は上書きされていても併記しない（レビュー指摘M1）', () => {
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'defaultShapeId', 'ortholinear');
  assert.ok(written.ok);
  if (!written.ok) return;
  const setups = [setupFor('qwerty'), { ...setupFor('colemak-dh'), id: 'setup-2' }];
  for (const setup of setups) {
    const input = resolveWith({ kind: 'setup', setupId: setup.id }, setups, written.overrides, 'en');
    const rows = nonDefaultConditionRows(traceConditionSummary(input.cascade, { shapes: CATALOG.shapes }));
    assert.deepEqual(rows.map((row) => row.id), []);
    assert.equal(summarizeNonDefaultConditions(rows), undefined);
  }
});

test('traceConditionSummary: 既定の物理配列はidでなく形状名で出す', () => {
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'defaultShapeId', 'ortholinear');
  assert.ok(written.ok);
  if (!written.ok) return;
  const input = resolveWith({ kind: 'layout', layoutId: 'qwerty' }, [], written.overrides, 'en');
  const row = traceConditionSummary(input.cascade, CATALOG).find((r) => r.id === 'defaultShapeId')!;
  assert.equal(row.displayValue, PHYSICAL_SHAPES.ortholinear.name);
  assert.equal(row.originLabel, '上書き: 全体');
});

test('nonDefaultConditionRows: 既定の物理配列は形状名として別に出しているので、併記には含めない（レビュー指摘L-c）', () => {
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'defaultShapeId', 'ortholinear');
  assert.ok(written.ok);
  if (!written.ok) return;
  const input = resolveWith({ kind: 'layout', layoutId: 'qwerty' }, [], written.overrides, 'en');
  const rows = nonDefaultConditionRows(traceConditionSummary(input.cascade, CATALOG));
  assert.deepEqual(rows.map((row) => row.id), []);
});

test('traceConditionSummary: 値・上書きの置き場所のidは名前へ引き、引けないidも画面に出さない', () => {
  let overrides = EMPTY_SETTINGS_OVERRIDES;
  for (const [level, id, value] of [
    [{ kind: 'layout', layoutId: 'qwerty' }, 'romajiRuleId', 'kunrei'],
    [{ kind: 'shape', shapeId: 'row-staggered' }, 'fingerAssignmentId', 'finger-deleted-custom'],
  ] as const) {
    const written = setSettingsOverride(overrides, level, id, value);
    assert.ok(written.ok, id);
    if (!written.ok) return;
    overrides = written.overrides;
  }
  const input = resolveWith({ kind: 'layout', layoutId: 'qwerty' }, [], overrides, 'ja');
  const rows = traceConditionSummary(input.cascade, CATALOG);
  const romaji = rows.find((row) => row.id === 'romajiRuleId')!;
  assert.match(romaji.displayValue, /訓令式/);
  assert.equal(romaji.originLabel, `上書き: 配列「${LAYOUT_BY_ID.get('qwerty')!.name}」`);
  const finger = rows.find((row) => row.id === 'fingerAssignmentId')!;
  assert.equal(finger.originLabel, `上書き: 物理配列「${PHYSICAL_SHAPES['row-staggered'].name}」`);
  for (const row of rows) {
    const texts = [row.label, row.displayValue, row.originLabel, ...row.diagnostics.map((d) => conditionDiagnosticText(row, d) ?? '')];
    for (const text of texts) assert.doesNotMatch(text, /finger-deleted-custom|kunrei|row-staggered|qwerty|Realization|Policy/, text);
  }
});

test('conditionDiagnosticText: 項目id・レベル名を含む診断文は出さず、「効かない」は行の目印に任せる', () => {
  const row = { id: 'windowSize', label: '先読みN' } as ConditionSummaryRow;
  assert.equal(conditionDiagnosticText(row, { kind: 'not-applicable', message: '項目「windowSize」は効かない' }), undefined);
  const ignored = conditionDiagnosticText(row, { kind: 'ignored-disallowed-level', message: '項目「windowSize」のsetupレベル' })!;
  assert.match(ignored, /先読みN/);
  assert.doesNotMatch(ignored, /windowSize|setup/);
});

test('nonDefaultConditionRows: かな直接の配列ではローマ字規則の上書きを併記しない', () => {
  const written = setSettingsOverride(
    EMPTY_SETTINGS_OVERRIDES,
    { kind: 'layout', layoutId: 'nicola' },
    'romajiRuleId',
    'hepburn',
  );
  assert.ok(written.ok);
  if (!written.ok) return;
  const input = resolveWith({ kind: 'layout', layoutId: 'nicola' }, [], written.overrides, 'ja');
  const summary = traceConditionSummary(input.cascade);
  assert.equal(summary.find((row) => row.id === 'romajiRuleId')?.origin.kind, 'layout');
  assert.deepEqual(nonDefaultConditionRows(summary).map((row) => row.id), []);
});

test('traceConditionSummary: シフト系キーの2項目は「する/しない」で値を出す（「(詳細設定)」にしない）', () => {
  const defaults = traceConditionSummary(resolveWith({ kind: 'layout', layoutId: 'qwerty' }, [], EMPTY_SETTINGS_OVERRIDES, 'en').cascade, CATALOG);
  const hold = defaults.find((row) => row.id === 'triggerRealizationPolicy')!;
  const action = defaults.find((row) => row.id === 'actionRealizationPolicy')!;
  assert.equal(hold.label, 'シフト系キーの押し続け');
  assert.equal(hold.displayValue, 'しない');
  assert.equal(action.label, 'シフト系キーを別の動作として数える');
  assert.equal(action.displayValue, 'しない');

  let overrides = EMPTY_SETTINGS_OVERRIDES;
  for (const [id, value] of [
    ['triggerRealizationPolicy', { useHold: true }],
    ['actionRealizationPolicy', {
      triggerActivation: 'semantic',
      triggerActivationClassOverrides: { 'order-free': 'separate' },
      triggerActivationOverrides: [],
    }],
  ] as const) {
    const written = setSettingsOverride(overrides, { kind: 'global' }, id, value as never);
    assert.ok(written.ok, id);
    if (!written.ok) return;
    overrides = written.overrides;
  }
  const rows = traceConditionSummary(resolveWith({ kind: 'layout', layoutId: 'qwerty' }, [], overrides, 'en').cascade, CATALOG);
  assert.equal(rows.find((row) => row.id === 'triggerRealizationPolicy')!.displayValue, 'する');
  assert.equal(rows.find((row) => row.id === 'actionRealizationPolicy')!.displayValue, 'する（キーごとの例外あり）');
  for (const row of rows) assert.doesNotMatch(row.displayValue, /[()]/, row.displayValue);
});
