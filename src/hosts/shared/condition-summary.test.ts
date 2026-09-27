import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { DEFAULT_FINGER_ASSIGNMENT, PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { EMPTY_SETTINGS_OVERRIDES, resolveSettings, setSettingsOverride } from '#engine/settings-items.ts';
import { resolveSetupForText } from '#input/setup/index.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { conditionHeaderInfo, conditionHeaderInfoFromResolvedInput, formatOrigin, traceConditionSummary } from './condition-summary.ts';

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
    setup: setupFor('qwerty'),
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
