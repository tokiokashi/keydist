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
  formatOrigin,
  nonDefaultConditionRows,
  summarizeNonDefaultConditions,
  traceConditionSummary,
} from './condition-summary.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};
const NO_USER_LAYOUTS = new Map();

function setupFor(layoutId: string, shapeId = 'row-staggered'): Setup {
  return { id: 'setup-1', layoutId, shapeId, colorIndex: 0 };
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

test('traceConditionSummary: オブジェクト値の項目はformatがobjectになる', () => {
  const resolution = resolveSetupForText(setupFor('qwerty'), CATALOG, NO_USER_LAYOUTS, 'en');
  assert.ok(resolution.ok);
  if (!resolution.ok) return;
  const cascade = resolveSettings(EMPTY_SETTINGS_OVERRIDES, resolution.context);
  const rows = traceConditionSummary(cascade);
  const trigger = rows.find((row) => row.id === 'triggerRealizationPolicy');
  assert.equal(trigger?.format, 'object');
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

test('nonDefaultConditionRows: 効かない行（Setup対象の既定の形状）は上書きされていても併記しない（レビュー指摘M1）', () => {
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

test('nonDefaultConditionRows: 配列対象の既定の形状は効くので、idでなく形状名で併記する', () => {
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'defaultShapeId', 'ortholinear');
  assert.ok(written.ok);
  if (!written.ok) return;
  const input = resolveWith({ kind: 'layout', layoutId: 'qwerty' }, [], written.overrides, 'en');
  const rows = nonDefaultConditionRows(traceConditionSummary(input.cascade, { shapes: CATALOG.shapes }));
  assert.deepEqual(rows.map((row) => row.id), ['defaultShapeId']);
  assert.equal(rows[0]!.displayValue, PHYSICAL_SHAPES.ortholinear.name);
  assert.notEqual(rows[0]!.displayValue, 'ortholinear');
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
