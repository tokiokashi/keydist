import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUTS_JA, type Layout } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { defineItem, type ItemRegistry } from './items.ts';
import { resolveCascade } from './resolve.ts';
import { setOverride } from './write.ts';
import { emptyCascadeOverrides, levelOverrides, withLevelOverrides, type CascadeOverrides } from './overrides.ts';
import type { CascadeContext } from './context.ts';
import type { CascadeLevel, InputMethod } from './levels.ts';
import { CASCADE_LEVEL_ORDER } from './levels.ts';

// Workspaceのレベル（#655）。全体のすぐ上、物理配列より前に1レベルとして重なる。
// 値は`overrides.workspace`（Workspaceの画面が解決の前に差し込む。単体ページは差し込まない）。

function findLayout(list: readonly Layout[], id: string): Layout {
  const layout = list.find((l) => l.id === id);
  assert.ok(layout, `未知のlayout id: ${id}`);
  return layout;
}

const naginata = findLayout(LAYOUTS_JA, 'naginata-v18');
const asuka = findLayout(LAYOUTS_JA, 'asuka');

function contextFor(layout: Layout, options: { inputMethod?: InputMethod; setupId?: string } = {}): CascadeContext {
  const base = {
    shapeId: 'row-staggered',
    shape: PHYSICAL_SHAPES['row-staggered'],
    inputMethod: options.inputMethod ?? 'direct',
    layoutId: layout.id,
    layout,
  };
  return options.setupId === undefined
    ? { ...base, targetKind: 'layout' }
    : { ...base, targetKind: 'setup', setupId: options.setupId };
}

const ITEMS = {
  n: defineItem<number>({
    id: 'n',
    allowedLevels: new Set(['global', 'workspace', 'shape', 'inputMethod', 'layout', 'setup']),
    defaultValue: 3,
  }),
  globalOnly: defineItem<boolean>({
    id: 'globalOnly',
    allowedLevels: new Set(['global']),
    defaultValue: true,
  }),
  rule: defineItem<string>({
    id: 'rule',
    allowedLevels: new Set(['global', 'workspace', 'layout']),
    defaultValue: 'base',
    layoutRecommendation: (context) => (context.layoutId === asuka.id ? 'recommended' : undefined),
  }),
} as const satisfies ItemRegistry;

type Overrides = CascadeOverrides<{ n: number; globalOnly: boolean; rule: string }>;

test('レベルの並び: 全体の次がWorkspace、その次が物理配列', () => {
  assert.deepEqual(CASCADE_LEVEL_ORDER, ['global', 'workspace', 'shape', 'inputMethod', 'layout', 'setup']);
});

test('全体より強く、物理配列・打ち方・配列・Setupより弱い', () => {
  const context = contextFor(naginata, { inputMethod: 'romaji', setupId: 's' });
  const base: Overrides = { global: { n: 1 }, workspace: { n: 2 } };
  const atWorkspace = resolveCascade(ITEMS, base, context);
  assert.equal(atWorkspace.n.value, 2);
  assert.deepEqual(atWorkspace.n.origin, { kind: 'workspace' });

  const shape = withLevelOverrides(base, { kind: 'shape', shapeId: 'row-staggered' }, { n: 3 });
  const atShape = resolveCascade(ITEMS, shape, context);
  assert.equal(atShape.n.value, 3);
  assert.deepEqual(atShape.n.origin, { kind: 'shape', shapeId: 'row-staggered' });
  const layout = withLevelOverrides(shape, { kind: 'layout', layoutId: naginata.id }, { n: 4 });
  assert.equal(resolveCascade(ITEMS, layout, context).n.value, 4);
  const setup = withLevelOverrides(layout, { kind: 'setup', setupId: 's' }, { n: 5 });
  assert.equal(resolveCascade(ITEMS, setup, context).n.value, 5);
});

test('Workspaceの値を持たない解決（単体ページ）は、全体の値だけで決まる', () => {
  const resolved = resolveCascade(ITEMS, { global: { n: 1 } }, contextFor(naginata));
  assert.equal(resolved.n.value, 1);
  assert.deepEqual(resolved.n.origin, { kind: 'global' });
  // Workspaceに別の項目だけがあっても、他の項目は変わらない
  const other = resolveCascade(ITEMS, { global: { n: 1 }, workspace: { rule: 'w' } }, contextFor(naginata));
  assert.equal(other.n.value, 1);
  assert.equal(other.rule.value, 'w');
});

test('Workspaceに置けない項目: 書き込みは拒否し、残っている値は無視して診断を出す', () => {
  const rejected = setOverride(ITEMS, emptyCascadeOverrides(), { kind: 'workspace' }, 'globalOnly', false);
  assert.equal(rejected.ok, false);
  const resolved = resolveCascade(ITEMS, { workspace: { globalOnly: false } }, contextFor(naginata));
  assert.equal(resolved.globalOnly.value, true);
  assert.equal(resolved.globalOnly.origin.kind, 'default');
  assert.deepEqual(resolved.globalOnly.diagnostics.map((d) => d.kind), ['ignored-disallowed-level']);
});

test('配列の推奨はWorkspaceの値にも勝ち、勝った相手に記録する。推奨の無い配列はWorkspaceの値に従う', () => {
  const overrides: Overrides = { global: { rule: 'g' }, workspace: { rule: 'w' } };
  const recommended = resolveCascade(ITEMS, overrides, contextFor(asuka));
  assert.equal(recommended.rule.value, 'recommended');
  assert.deepEqual(recommended.rule.recommendationWins, { shadowed: ['global', 'workspace'] });
  const plain = resolveCascade(ITEMS, overrides, contextFor(naginata));
  assert.equal(plain.rule.value, 'w');
  // 配列のレベルの継承値にWorkspaceの値が入る
  assert.equal(plain.rule.layoutBase, 'w');
});

test('Workspaceに値が無くても、継承値が推奨と違えば推奨が勝った相手にWorkspaceを記録する', () => {
  // 全体にも保存値が無い（既定のbase）。大西配列のように推奨が既定と違う配列をWorkspaceで開いた時の理由に使う
  const bare = resolveCascade(ITEMS, emptyCascadeOverrides(), contextFor(asuka));
  assert.deepEqual(bare.rule.recommendationWins, { shadowed: ['global', 'workspace'] });
  // 全体に保存した値があっても同じ
  const withGlobal = resolveCascade(ITEMS, { global: { rule: 'g' } }, contextFor(asuka));
  assert.deepEqual(withGlobal.rule.recommendationWins, { shadowed: ['global', 'workspace'] });
  // 継承値が推奨と同じなら負けた相手は無い
  const same = resolveCascade(ITEMS, { global: { rule: 'recommended' } }, contextFor(asuka));
  assert.equal(same.rule.recommendationWins, undefined);
  // Workspaceに置けない項目は記録しない
  const noWorkspace = resolveCascade({
    rule: defineItem<string>({
      id: 'rule',
      allowedLevels: new Set(['global', 'layout']),
      defaultValue: 'base',
      layoutRecommendation: () => 'recommended',
    }),
  }, emptyCascadeOverrides(), contextFor(asuka));
  assert.deepEqual(noWorkspace.rule.recommendationWins, { shadowed: ['global'] });
});

test('配列の上書きを全体へ移した後の継承値は、Workspaceの値が勝つ（移すと画面の値が変わる）', () => {
  const overrides: Overrides = { workspace: { rule: 'w' }, layout: { [naginata.id]: { rule: 'mine' } } };
  const resolved = resolveCascade(ITEMS, overrides, contextFor(naginata));
  assert.equal(resolved.rule.value, 'mine');
  assert.equal(resolved.rule.promotedBase, 'w');
});

test('レベルの読み書き: Workspaceは全体と別の1レベル。条件が無い時の消去は参照を変えない', () => {
  const level: CascadeLevel = { kind: 'workspace' };
  const empty: Overrides = emptyCascadeOverrides();
  const written = withLevelOverrides(empty, level, { n: 5 });
  assert.deepEqual(written, { workspace: { n: 5 } });
  assert.deepEqual(levelOverrides(written, level), { n: 5 });
  assert.equal(levelOverrides(written, { kind: 'global' }), undefined);
  assert.deepEqual(withLevelOverrides(written, level, undefined), {});
  assert.equal(withLevelOverrides(empty, level, undefined), empty);
});
