import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUTS_JA, type Layout } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PresetGeometryKind } from '#input/shapes/geometry.ts';
import { defineItem, type ItemRegistry } from './items.ts';
import { resolveCascade } from './resolve.ts';
import { setOverride } from './write.ts';
import { resetItem, resetLevel } from './reset.ts';
import { emptyCascadeOverrides, type CascadeOverrides } from './overrides.ts';
import type { CascadeContext } from './context.ts';
import type { InputMethod } from './levels.ts';

// このファイルはカスケードの「仕組み」（レベル・優先順位・妥当性・適用可否・リセット）だけを
// 検証する。具体の項目（TracePolicy・ChainInterpretation等）とfixture回帰テストは
// src/engine/settings-items.test.ts にある（型・既定値をinput層へ複製しない）。

function findLayout(list: readonly Layout[], id: string): Layout {
  const layout = list.find((l) => l.id === id);
  assert.ok(layout, `未知のlayout id: ${id}`);
  return layout;
}

const naginata = findLayout(LAYOUTS_JA, 'naginata-v18'); // SandS(交代打鍵)を持つ配列。contextの材料に使うだけ
const asuka = findLayout(LAYOUTS_JA, 'asuka'); // SandSを持たない配列

function contextFor(
  layout: Layout,
  options: {
    shapeId?: PresetGeometryKind;
    inputMethod?: InputMethod;
    setupId?: string;
    targetKind?: 'layout' | 'setup';
  } = {},
): CascadeContext {
  const shapeId = options.shapeId ?? 'row-staggered';
  const base = {
    shapeId,
    shape: PHYSICAL_SHAPES[shapeId],
    inputMethod: options.inputMethod ?? 'direct',
    layoutId: layout.id,
    layout,
  };
  const targetKind = options.targetKind ?? (options.setupId === undefined ? 'layout' : 'setup');
  return targetKind === 'layout'
    ? { ...base, targetKind }
    : { ...base, targetKind, setupId: options.setupId };
}

const ANY_LEVEL = new Set<'global' | 'shape' | 'inputMethod' | 'layout' | 'setup'>([
  'global', 'shape', 'inputMethod', 'layout', 'setup',
]);

/** 仕組みだけを見るための小さなテスト用レジストリ。実項目の代わり。 */
const TEST_ITEMS = {
  anyLevelNumber: defineItem<number>({
    id: 'anyLevelNumber',
    allowedLevels: ANY_LEVEL,
    defaultValue: 3,
  }),
  globalOnlyFlag: defineItem<boolean>({
    id: 'globalOnlyFlag',
    allowedLevels: new Set(['global']),
    defaultValue: true,
  }),
  // preferOppositeThumb相当: SandSが無い配列では効かず、反対側の親指キーが無い物理配列では実現できない。
  thumbRequiring: defineItem<boolean>({
    id: 'thumbRequiring',
    allowedLevels: ANY_LEVEL,
    defaultValue: false,
    isApplicable: (context) =>
      context.layout.thumbShiftKeys !== undefined && context.layout.thumbShiftKeys.length > 0,
    validate: (value, context) => {
      if (!value) return { ok: true };
      const hasBothThumbs = context.shape.thumbs.some((t) => t.finger === 'LT')
        && context.shape.thumbs.some((t) => t.finger === 'RT');
      return hasBothThumbs ? { ok: true } : { ok: false, fallback: false, reason: '反対側の親指キーが無い' };
    },
  }),
  // romajiRuleId相当: 既定値がcontext（配列id）に依存する。
  layoutDerived: defineItem<string>({
    id: 'layoutDerived',
    allowedLevels: new Set(['inputMethod', 'layout', 'setup']),
    defaultValue: (context) => `default-for-${context.layoutId}`,
  }),
} as const satisfies ItemRegistry;

type TestOverrides = CascadeOverrides<{
  anyLevelNumber: number;
  globalOnlyFlag: boolean;
  thumbRequiring: boolean;
  layoutDerived: string;
}>;

const EMPTY: TestOverrides = emptyCascadeOverrides();

test('上書きが無ければ全項目が既定値・出どころdefaultで解決する', () => {
  const resolved = resolveCascade(TEST_ITEMS, EMPTY, contextFor(asuka));
  assert.equal(resolved.anyLevelNumber.value, 3);
  assert.equal(resolved.anyLevelNumber.origin.kind, 'default');
  assert.equal(resolved.globalOnlyFlag.value, true);
});

test('既定値がcontextの関数の項目は、contextに応じた値になる（ローマ字規則id相当）', () => {
  const resolved = resolveCascade(TEST_ITEMS, EMPTY, contextFor(asuka));
  assert.equal(resolved.layoutDerived.value, `default-for-${asuka.id}`);
  assert.equal(resolved.layoutDerived.origin.kind, 'default');
});

test('疎な上書き: 1項目だけ書いても他項目は既定値のまま', () => {
  const written = setOverride(TEST_ITEMS, EMPTY, { kind: 'layout', layoutId: asuka.id }, 'anyLevelNumber', 6);
  assert.ok(written.ok);
  const overrides = written.overrides;

  const resolved = resolveCascade(TEST_ITEMS, overrides, contextFor(asuka));
  assert.equal(resolved.anyLevelNumber.value, 6);
  assert.equal(resolved.globalOnlyFlag.value, true); // 上書きしていない項目は既定のまま
  assert.deepEqual(resolved.anyLevelNumber.origin, { kind: 'layout', layoutId: asuka.id });
});

test('優先順位: global < shape < inputMethod < layout < setupの順で強い方が勝つ', () => {
  let overrides = EMPTY;
  const layoutId = asuka.id;
  const shapeId: PresetGeometryKind = 'row-staggered';
  const inputMethod: InputMethod = 'kana-direct';
  const setupId = 'setup-1';

  for (const [level, value] of [
    [{ kind: 'global' as const }, 1],
    [{ kind: 'shape' as const, shapeId }, 2],
    [{ kind: 'inputMethod' as const, inputMethod }, 3],
    [{ kind: 'layout' as const, layoutId }, 4],
  ] as const) {
    const written = setOverride(TEST_ITEMS, overrides, level, 'anyLevelNumber', value);
    assert.ok(written.ok);
    overrides = written.overrides;
  }

  // layoutまでしか書いていない段階ではlayoutの値（4）が勝つ
  let resolved = resolveCascade(TEST_ITEMS, overrides, contextFor(asuka, { shapeId, inputMethod }));
  assert.equal(resolved.anyLevelNumber.value, 4);
  assert.deepEqual(resolved.anyLevelNumber.origin, { kind: 'layout', layoutId });

  // setupへ書くとそちらが勝つ（setupIdをcontextへ渡した時だけ見る）
  const writtenSetup = setOverride(TEST_ITEMS, overrides, { kind: 'setup', setupId }, 'anyLevelNumber', 5);
  assert.ok(writtenSetup.ok);
  overrides = writtenSetup.overrides;
  resolved = resolveCascade(TEST_ITEMS, overrides, contextFor(asuka, { shapeId, inputMethod, setupId }));
  assert.equal(resolved.anyLevelNumber.value, 5);
  assert.deepEqual(resolved.anyLevelNumber.origin, { kind: 'setup', setupId });

  // setupIdを渡さない解決（Setup未確定のプレビュー等）ではsetupレベルを見ないのでlayoutの値のまま
  resolved = resolveCascade(TEST_ITEMS, overrides, contextFor(asuka, { shapeId, inputMethod }));
  assert.equal(resolved.anyLevelNumber.value, 4);
});

test('許可されていないレベルへの書き込みは拒否される（例外ではなく値で返す）', () => {
  // globalOnlyFlagはグローバルのみ許可
  const result = setOverride(TEST_ITEMS, EMPTY, { kind: 'layout', layoutId: asuka.id }, 'globalOnlyFlag', false);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.kind, 'disallowed-level');
    assert.equal(result.error.itemId, 'globalOnlyFlag');
  }
});

test('許可されていないレベルに残っている古い値は解決時に無視され診断が付く', () => {
  // 直接ストアへ不正な形で値を仕込む（インポートした旧データを想定）。
  // setOverrideを経由しないので拒否されない = 「すでにストアに入っている」状態を再現する。
  const overrides: TestOverrides = {
    layout: { [asuka.id]: { globalOnlyFlag: false } },
  };
  const resolved = resolveCascade(TEST_ITEMS, overrides, contextFor(asuka));
  // 既定値のまま（layoutの値は無視した）
  assert.equal(resolved.globalOnlyFlag.value, true);
  assert.equal(resolved.globalOnlyFlag.origin.kind, 'default');
  assert.ok(resolved.globalOnlyFlag.diagnostics.some((d) => d.kind === 'ignored-disallowed-level'));
});

test('妥当性: 反対側の親指キーが無い物理配列では実現できずfallback+警告になる', () => {
  const shapeNoRightThumb = {
    ...PHYSICAL_SHAPES['row-staggered'],
    thumbs: PHYSICAL_SHAPES['row-staggered'].thumbs.filter((thumb) => thumb.finger !== 'RT'),
  };
  const context: CascadeContext = {
    shapeId: 'shape-no-right-thumb',
    shape: shapeNoRightThumb,
    targetKind: 'layout' as const,
    inputMethod: 'kana-direct' as const,
    layoutId: naginata.id,
    layout: naginata,
  };
  const written = setOverride(TEST_ITEMS, EMPTY, { kind: 'global' }, 'thumbRequiring', true);
  assert.ok(written.ok);

  const resolved = resolveCascade(TEST_ITEMS, written.overrides, context);
  assert.equal(resolved.thumbRequiring.value, false); // 実現できる値へ戻る
  assert.deepEqual(resolved.thumbRequiring.origin, { kind: 'global' }); // 出どころ自体は書き込まれた場所のまま
  assert.ok(resolved.thumbRequiring.diagnostics.some((d) => d.kind === 'invalid-fallback'));

  // 両方の親指キーがある物理配列では同じ上書きがそのまま実現できる
  const resolvedOk = resolveCascade(
    TEST_ITEMS,
    written.overrides,
    contextFor(naginata, { inputMethod: 'kana-direct' }),
  );
  assert.equal(resolvedOk.thumbRequiring.value, true);
  assert.equal(resolvedOk.thumbRequiring.diagnostics.length, 0);
});

test('適用可否: その機能を持たない配列ではnot-applicableと報告される（値自体は解決する）', () => {
  const resolvedAsuka = resolveCascade(TEST_ITEMS, EMPTY, contextFor(asuka));
  assert.equal(resolvedAsuka.thumbRequiring.applicable, false);
  assert.ok(resolvedAsuka.thumbRequiring.diagnostics.some((d) => d.kind === 'not-applicable'));

  const resolvedNaginata = resolveCascade(TEST_ITEMS, EMPTY, contextFor(naginata));
  assert.equal(resolvedNaginata.thumbRequiring.applicable, true);
});

test('リセット: 項目単位でそのレベルの1項目だけ消える', () => {
  const level = { kind: 'layout' as const, layoutId: asuka.id };
  let overrides = EMPTY;
  overrides = (setOverride(TEST_ITEMS, overrides, level, 'anyLevelNumber', 6) as { ok: true; overrides: TestOverrides }).overrides;
  overrides = (setOverride(TEST_ITEMS, overrides, level, 'thumbRequiring', true) as { ok: true; overrides: TestOverrides }).overrides;

  overrides = resetItem(overrides, level, 'anyLevelNumber');
  const resolved = resolveCascade(TEST_ITEMS, overrides, contextFor(asuka));
  assert.equal(resolved.anyLevelNumber.value, 3); // 消えて既定に戻る
  assert.equal(resolved.thumbRequiring.value, true); // 別項目は残る
});

test('リセット: レベル単位でそのレベルの上書きが全部消える', () => {
  const level = { kind: 'layout' as const, layoutId: asuka.id };
  let overrides = EMPTY;
  overrides = (setOverride(TEST_ITEMS, overrides, level, 'anyLevelNumber', 6) as { ok: true; overrides: TestOverrides }).overrides;
  overrides = (setOverride(TEST_ITEMS, overrides, level, 'thumbRequiring', true) as { ok: true; overrides: TestOverrides }).overrides;

  overrides = resetLevel(overrides, level);
  assert.deepEqual(overrides, EMPTY);
  const resolved = resolveCascade(TEST_ITEMS, overrides, contextFor(asuka));
  assert.equal(resolved.anyLevelNumber.value, 3);
  assert.equal(resolved.thumbRequiring.value, false);
});

// 配列の組み込みの推奨は、配列のレベルの手前で全体・物理配列・打ち方の値を置き換え、
// 配列・Setupの上書きには負ける。
const RECOMMENDING_ITEMS = {
  rule: defineItem<string>({
    id: 'rule',
    allowedLevels: ANY_LEVEL,
    defaultValue: 'base',
    layoutRecommendation: (context) => (context.layoutId === asuka.id ? 'recommended' : undefined),
  }),
} as const satisfies ItemRegistry;

type RecommendingOverrides = CascadeOverrides<{ rule: string }>;

function writeRule(overrides: RecommendingOverrides, level: Parameters<typeof setOverride>[2], value: string): RecommendingOverrides {
  const written = setOverride(RECOMMENDING_ITEMS, overrides, level, 'rule', value);
  assert.ok(written.ok);
  return (written as { ok: true; overrides: RecommendingOverrides }).overrides;
}

test('配列の推奨: 全体・打ち方の値に勝ち、勝った相手を記録する。出どころは既定値のまま', () => {
  const empty: RecommendingOverrides = emptyCascadeOverrides();
  const overrides = writeRule(writeRule(empty, { kind: 'global' }, 'g'), { kind: 'inputMethod', inputMethod: 'romaji' }, 'm');
  const resolved = resolveCascade(RECOMMENDING_ITEMS, overrides, contextFor(asuka, { inputMethod: 'romaji' }));
  assert.equal(resolved.rule.value, 'recommended');
  assert.equal(resolved.rule.origin.kind, 'default');
  assert.deepEqual(resolved.rule.recommendationWins, { shadowed: ['global', 'inputMethod'] });
});

test('配列の推奨: 推奨の無い配列は全体の値に従う', () => {
  const overrides = writeRule(emptyCascadeOverrides(), { kind: 'global' }, 'g');
  const resolved = resolveCascade(RECOMMENDING_ITEMS, overrides, contextFor(naginata));
  assert.equal(resolved.rule.value, 'g');
  assert.equal(resolved.rule.recommendationWins, undefined);
});

test('配列の推奨: 配列・Setupの上書きは推奨に勝つ', () => {
  const base = writeRule(emptyCascadeOverrides(), { kind: 'global' }, 'g');
  const byLayout = writeRule(base, { kind: 'layout', layoutId: asuka.id }, 'mine');
  const layoutResolved = resolveCascade(RECOMMENDING_ITEMS, byLayout, contextFor(asuka));
  assert.equal(layoutResolved.rule.value, 'mine');
  assert.equal(layoutResolved.rule.recommendationWins, undefined);
  const bySetup = writeRule(base, { kind: 'setup', setupId: 's' }, 'setup-mine');
  assert.equal(resolveCascade(RECOMMENDING_ITEMS, bySetup, contextFor(asuka, { setupId: 's' })).rule.value, 'setup-mine');
});

test('layoutBase: 配列・Setupの上書きを除いた値（全体＞既定値、推奨のある配列は推奨）を返す', () => {
  const global = writeRule(emptyCascadeOverrides(), { kind: 'global' }, 'g');
  const withLayout = writeRule(writeRule(global, { kind: 'layout', layoutId: naginata.id }, 'mine'), { kind: 'setup', setupId: 's' }, 'setup-mine');
  const plain = resolveCascade(RECOMMENDING_ITEMS, withLayout, contextFor(naginata, { setupId: 's' }));
  assert.equal(plain.rule.value, 'setup-mine');
  assert.equal(plain.rule.layoutBase, 'g');
  // 全体の値が無ければ既定値
  assert.equal(resolveCascade(RECOMMENDING_ITEMS, emptyCascadeOverrides(), contextFor(naginata)).rule.layoutBase, 'base');
  // 推奨を持つ配列は、全体の値より推奨。配列の上書きがあっても推奨のまま
  const recommended = writeRule(global, { kind: 'layout', layoutId: asuka.id }, 'mine');
  const resolved = resolveCascade(RECOMMENDING_ITEMS, recommended, contextFor(asuka));
  assert.equal(resolved.rule.value, 'mine');
  assert.equal(resolved.rule.layoutBase, 'recommended');
  assert.equal(resolved.rule.hasLayoutRecommendation, true);
  assert.equal(plain.rule.hasLayoutRecommendation, false);
});

test('promotedBase: 配列の上書きを全体へ移した後の継承値。推奨や全体より上のレベルの値が勝つなら、今の上書きと一致しない', () => {
  // 推奨の無い配列: 移した値がそのまま継承される
  const mine = writeRule(emptyCascadeOverrides(), { kind: 'layout', layoutId: naginata.id }, 'mine');
  assert.equal(resolveCascade(RECOMMENDING_ITEMS, mine, contextFor(naginata)).rule.promotedBase, 'mine');
  // 推奨のある配列: 推奨が全体に勝つので、移しても推奨のまま
  const withRecommendation = writeRule(emptyCascadeOverrides(), { kind: 'layout', layoutId: asuka.id }, 'mine');
  assert.equal(resolveCascade(RECOMMENDING_ITEMS, withRecommendation, contextFor(asuka)).rule.promotedBase, 'recommended');
  // 全体より上（打ち方）の値がある時は、そちらが勝つ
  const withInputMethod = writeRule(mine, { kind: 'inputMethod', inputMethod: 'romaji' }, 'm');
  assert.equal(resolveCascade(RECOMMENDING_ITEMS, withInputMethod, contextFor(naginata, { inputMethod: 'romaji' })).rule.promotedBase, 'm');
  // 配列の上書きが無ければ持たない
  assert.equal(resolveCascade(RECOMMENDING_ITEMS, emptyCascadeOverrides(), contextFor(naginata)).rule.promotedBase, undefined);
});
