import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import type { CascadeLevel } from '#input/settings/index.ts';
import {
  EMPTY_SETTINGS_OVERRIDES,
  setSettingsOverride,
  withWorkspaceConditions,
  type SettingsCascadeOverrides,
} from './settings-items.ts';
import { resolveEngineInput, type ResolvedInputResult } from './resolved-input.ts';
import { describeResolvedInputError } from './resolved-input-errors.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

const TEXT = 'かがぱぁを「」っーむろ';

function withShape(overrides: SettingsCascadeOverrides, level: CascadeLevel, shapeId: string): SettingsCascadeOverrides {
  const result = setSettingsOverride(overrides, level, 'defaultShapeId', shapeId);
  assert.ok(result.ok);
  return result.ok ? result.overrides : overrides;
}

function resolve(
  target: AnalysisTarget,
  overrides: SettingsCascadeOverrides,
  setups: readonly Setup[] = [],
  catalog = CATALOG,
): ResolvedInputResult {
  return resolveEngineInput({
    target,
    setups: new Map(setups.map((setup) => [setup.id, setup])),
    catalog,
    userLayouts: new Map(),
    overrides,
    text: TEXT,
    language: 'ja',
  });
}

const JIS_KANA_TARGET: AnalysisTarget = { kind: 'layout', layoutId: 'jis-kana' };

function geometryIdOf(result: ResolvedInputResult): string {
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error.kind));
  return result.ok ? result.input.geometry.id : '';
}

test('JISかな配列を対象にして何も上書きしない時は、JIS系の物理配列と既定のJIS運指で測る', () => {
  const result = resolve(JIS_KANA_TARGET, EMPTY_SETTINGS_OVERRIDES);
  assert.equal(geometryIdOf(result), 'jis-row-staggered');
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.input.geometry.assignment.id, 'jis-default');
  assert.equal(result.input.cascade.defaultShapeId.hasLayoutRecommendation, true);
});

test('全体の物理配列がANSIでも、JISかな配列はJIS系の物理配列で測り、全体が負けていることを持つ', () => {
  const overrides = withShape(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'row-staggered');
  const result = resolve(JIS_KANA_TARGET, overrides);
  assert.equal(geometryIdOf(result), 'jis-row-staggered');
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.ok(result.input.cascade.defaultShapeId.recommendationWins?.shadowed.includes('global'));
  assert.equal(result.input.cascade.defaultShapeId.diagnostics.length, 0);
});

test('Workspaceの物理配列がANSIでも、JISかな配列は推奨のJIS系の物理配列で測る', () => {
  const overrides = withWorkspaceConditions(
    EMPTY_SETTINGS_OVERRIDES,
    { defaultShapeId: 'ortholinear' },
  );
  const result = resolve(JIS_KANA_TARGET, overrides);
  assert.equal(geometryIdOf(result), 'jis-row-staggered');
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.ok(result.input.cascade.defaultShapeId.recommendationWins?.shadowed.includes('workspace'));
});

test('配列のレベルで置いたJIS系の物理配列は、推奨に勝つ', () => {
  const overrides = withShape(EMPTY_SETTINGS_OVERRIDES, { kind: 'layout', layoutId: 'jis-kana' }, 'jis-column-staggered');
  assert.equal(geometryIdOf(resolve(JIS_KANA_TARGET, overrides)), 'jis-column-staggered');
});

test('配列のレベルでキーの足りない物理配列を置くと、計算せずJISの物理配列が要る理由を返す', () => {
  const overrides = withShape(EMPTY_SETTINGS_OVERRIDES, { kind: 'layout', layoutId: 'jis-kana' }, 'row-staggered');
  const result = resolve(JIS_KANA_TARGET, overrides);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, 'keys-missing');
  assert.match(describeResolvedInputError(result.error), /JISの物理配列を選んでください/);
});

test('Setupに、キーの足りない物理配列を置くと、計算せず理由を返す。JISの物理配列なら計算する', () => {
  const ansi: Setup = { id: 'setup-ansi', number: 1, layoutId: 'jis-kana', shapeId: 'row-staggered' };
  const jis: Setup = { id: 'setup-jis', number: 2, layoutId: 'jis-kana', shapeId: 'jis-ortholinear' };
  const setups = [ansi, jis];
  const failed = resolve({ kind: 'setup', setupId: ansi.id }, EMPTY_SETTINGS_OVERRIDES, setups);
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.error.kind, 'keys-missing');
    assert.match(describeResolvedInputError(failed.error), /JISの物理配列/);
  }
  // Setupは自分の物理配列を持つので、全体の値や配列の推奨は読まない
  assert.equal(geometryIdOf(resolve({ kind: 'setup', setupId: jis.id }, EMPTY_SETTINGS_OVERRIDES, setups)), 'jis-ortholinear');
});

test('自作の物理配列でも、配列が使うキーが足りなければ計算せず理由を返す', () => {
  const custom: PhysicalShape = { ...PHYSICAL_SHAPES['jis-row-staggered'], id: 'shape-custom', name: '自作', rowWidths: [12, 11, 11, 10] };
  const catalog = { ...CATALOG, shapes: new Map([...CATALOG.shapes, [custom.id, custom]]) };
  const overrides = withShape(EMPTY_SETTINGS_OVERRIDES, { kind: 'layout', layoutId: 'jis-kana' }, custom.id);
  const result = resolve(JIS_KANA_TARGET, overrides, [], catalog);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, 'keys-missing');
});

test('推奨を持たない配列は、これまでどおり全体の物理配列で測る', () => {
  const overrides = withShape(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'jis-ortholinear');
  const result = resolve({ kind: 'layout', layoutId: 'naginata-v18' }, overrides);
  assert.equal(geometryIdOf(result), 'jis-ortholinear');
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.input.cascade.defaultShapeId.hasLayoutRecommendation, false);
  assert.equal(geometryIdOf(resolve({ kind: 'layout', layoutId: 'naginata-v18' }, EMPTY_SETTINGS_OVERRIDES)), 'row-staggered');
});
