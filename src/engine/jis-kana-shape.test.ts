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

test('JISかな配列を対象にして何も上書きしない時は、既定の形のJISの物理配列と既定のJIS運指で測る', () => {
  const result = resolve(JIS_KANA_TARGET, EMPTY_SETTINGS_OVERRIDES);
  assert.equal(geometryIdOf(result), 'jis-row-staggered');
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.input.geometry.assignment.id, 'jis-default');
});

test('全体の物理配列がANSIの各形の時、JISかな配列は同じ形のJISの物理配列で測る。全体の値は負けた値として扱わない', () => {
  const pairs = [
    ['row-staggered', 'jis-row-staggered'],
    ['ortholinear', 'jis-ortholinear'],
    ['split-ortholinear', 'jis-split-ortholinear'],
    ['column-staggered', 'jis-column-staggered'],
  ] as const;
  for (const [ansi, jis] of pairs) {
    const result = resolve(JIS_KANA_TARGET, withShape(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, ansi));
    assert.equal(geometryIdOf(result), jis, ansi);
    assert.ok(result.ok);
    if (!result.ok) continue;
    // 導いたJISの物理配列に合う指の割り当てになる
    assert.equal(result.input.geometry.assignment.id, 'jis-default', ansi);
    const item = result.input.cascade.defaultShapeId;
    assert.equal(item.recommendationWins, undefined, ansi);
    assert.equal(item.hasLayoutRecommendation, false, ansi);
    assert.equal(item.diagnostics.length, 0, ansi);
  }
});

test('全体の物理配列が既にJISの時は、そのまま使う', () => {
  for (const jis of ['jis-row-staggered', 'jis-ortholinear', 'jis-split-ortholinear', 'jis-column-staggered']) {
    assert.equal(geometryIdOf(resolve(JIS_KANA_TARGET, withShape(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, jis))), jis);
  }
});

test('Workspaceの値がANSIのオーソリニアで全体の値が別の形の時は、JISのオーソリニアで測る', () => {
  const global = withShape(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'column-staggered');
  const overrides = withWorkspaceConditions(global, { defaultShapeId: 'ortholinear' });
  assert.equal(geometryIdOf(resolve(JIS_KANA_TARGET, overrides)), 'jis-ortholinear');
});

test('配列のレベルで置いたJIS系の物理配列は、全体の値から導く物理配列に勝つ', () => {
  const global = withShape(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'ortholinear');
  const overrides = withShape(global, { kind: 'layout', layoutId: 'jis-kana' }, 'jis-column-staggered');
  assert.equal(geometryIdOf(resolve(JIS_KANA_TARGET, overrides)), 'jis-column-staggered');
});

test('配列のレベルの上書きが手持ちに無い物理配列を指す時は、全体の値から導いた物理配列で測り、他の配列と同じ診断を出す', () => {
  const global = withShape(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'ortholinear');
  const overrides = withShape(global, { kind: 'layout', layoutId: 'jis-kana' }, 'shape-deleted');
  const result = resolve(JIS_KANA_TARGET, overrides);
  assert.equal(geometryIdOf(result), 'jis-ortholinear');
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(result.input.cascade.defaultShapeId.diagnostics.map((d) => d.message), [
    '既定に選んでいた物理配列が見つからないため、「オーソリニア（JIS）」で測りました',
  ]);
});

test('全体の値が手持ちに無い物理配列を指す時も、JISかな配列は既定の形から導き、診断を出す。導出でidが変わるだけなら出さない', () => {
  const missing = resolve(JIS_KANA_TARGET, withShape(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'shape-deleted'));
  assert.equal(geometryIdOf(missing), 'jis-row-staggered');
  assert.ok(missing.ok);
  if (missing.ok) assert.equal(missing.input.cascade.defaultShapeId.diagnostics.length, 1);
  // 他の配列と同じ診断（文も同じ）
  const other = resolve({ kind: 'layout', layoutId: 'naginata-v18' }, withShape(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'shape-deleted'));
  assert.ok(other.ok);
  if (missing.ok && other.ok) {
    assert.equal(other.input.cascade.defaultShapeId.diagnostics.length, 1);
    assert.equal(other.input.cascade.defaultShapeId.diagnostics[0]!.kind, missing.input.cascade.defaultShapeId.diagnostics[0]!.kind);
  }
  // ortholinearからjis-ortholinearへ変わるだけの時は出さない（上のテストでも確かめている）
  const derived = resolve(JIS_KANA_TARGET, withShape(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'ortholinear'));
  assert.ok(derived.ok);
  if (derived.ok) assert.equal(derived.input.cascade.defaultShapeId.diagnostics.length, 0);
});

test('全体の値が自作の物理配列の時は、配列が使うキーを全部持てばそのまま使い、足りなければロウスタッガード（JIS）で測る', () => {
  const full: PhysicalShape = { ...PHYSICAL_SHAPES['jis-ortholinear'], id: 'shape-full', name: '自作（足りる）' };
  const short: PhysicalShape = { ...PHYSICAL_SHAPES['jis-ortholinear'], id: 'shape-short', name: '自作（足りない）', rowWidths: [12, 11, 11, 10] };
  const catalog = { ...CATALOG, shapes: new Map([...CATALOG.shapes, [full.id, full], [short.id, short]]) };
  // 自作の物理配列は規格を持たないので、指の割り当てはJIS用を明示する
  const jisAssignment = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'fingerAssignmentId', 'jis-default');
  assert.ok(jisAssignment.ok);
  const base = jisAssignment.ok ? jisAssignment.overrides : EMPTY_SETTINGS_OVERRIDES;
  assert.equal(
    geometryIdOf(resolve(JIS_KANA_TARGET, withShape(base, { kind: 'global' }, full.id), [], catalog)),
    'shape-full',
  );
  assert.equal(
    geometryIdOf(resolve(JIS_KANA_TARGET, withShape(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, short.id), [], catalog)),
    'jis-row-staggered',
  );
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
  // Setupは自分の物理配列を持つので、全体の値からJISの物理配列を導かない
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

test('JISの物理配列が要らない配列は、これまでどおり全体の物理配列で測る', () => {
  const overrides = withShape(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'jis-ortholinear');
  const result = resolve({ kind: 'layout', layoutId: 'naginata-v18' }, overrides);
  assert.equal(geometryIdOf(result), 'jis-ortholinear');
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.input.cascade.defaultShapeId.hasLayoutRecommendation, false);
  assert.equal(geometryIdOf(resolve({ kind: 'layout', layoutId: 'naginata-v18' }, EMPTY_SETTINGS_OVERRIDES)), 'row-staggered');
});
