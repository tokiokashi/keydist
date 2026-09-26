import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUTS, LAYOUTS_JA, type Layout } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PresetGeometryKind } from '#input/shapes/geometry.ts';
import { resolveCascade } from './resolve.ts';
import { setOverride } from './write.ts';
import { resetItem, resetLevel } from './reset.ts';
import { EMPTY_CASCADE_OVERRIDES, type CascadeOverrides } from './overrides.ts';
import type { CascadeContext } from './context.ts';
import type { InputMethod } from './levels.ts';

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

function findLayout(list: readonly Layout[], id: string): Layout {
  const layout = list.find((l) => l.id === id);
  assert.ok(layout, `未知のlayout id: ${id}`);
  return layout;
}

const naginata = findLayout(LAYOUTS_JA, 'naginata-v18'); // SandS(交代打鍵)を持つ配列
const asuka = findLayout(LAYOUTS_JA, 'asuka'); // SandSを持たない配列
const nicola = findLayout(LAYOUTS_JA, 'nicola'); // かな直接（ローマ字表を持たない）
const qwertyJa = findLayout(LAYOUTS_JA, 'qwerty'); // ローマ字入力（既定でkunreiが焼き込み済み）
const colemakEn = findLayout(LAYOUTS, 'colemak'); // 英字配列（ローマ字表を持たない）

function contextFor(
  layout: Layout,
  options: { shapeId?: PresetGeometryKind; inputMethod?: InputMethod; setupId?: string } = {},
): CascadeContext {
  const shapeId = options.shapeId ?? 'row-staggered';
  return {
    shapeId,
    shape: PHYSICAL_SHAPES[shapeId],
    inputMethod: options.inputMethod ?? 'direct',
    layoutId: layout.id,
    layout,
    setupId: options.setupId,
  };
}

test('上書きが無ければ全項目が既定値・出どころdefaultで解決する', () => {
  const resolved = resolveCascade(EMPTY_CASCADE_OVERRIDES, contextFor(asuka));
  assert.equal(resolved.windowSize.value, 3);
  assert.equal(resolved.windowSize.origin.kind, 'default');
  assert.equal(resolved.sfbHomeCost.value, true);
  assert.equal(resolved.preferOppositeThumb.value, false);
});

test('疎な上書き: 1項目だけ書いても他項目は既定値のまま', () => {
  let overrides = EMPTY_CASCADE_OVERRIDES;
  const written = setOverride(overrides, { kind: 'layout', layoutId: asuka.id }, 'windowSize', 6);
  assert.ok(written.ok);
  overrides = written.overrides;

  const resolved = resolveCascade(overrides, contextFor(asuka));
  assert.equal(resolved.windowSize.value, 6);
  assert.equal(resolved.sfbHomeCost.value, true); // 上書きしていない項目は既定のまま
  assert.deepEqual(resolved.windowSize.origin, { kind: 'layout', layoutId: asuka.id });
});

test('優先順位: global < shape < inputMethod < layout < setupの順で強い方が勝つ', () => {
  let overrides = EMPTY_CASCADE_OVERRIDES;
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
    const written = setOverride(overrides, level, 'windowSize', value);
    assert.ok(written.ok);
    overrides = written.overrides;
  }

  // layoutまでしか書いていない段階ではlayoutの値（4）が勝つ
  let resolved = resolveCascade(overrides, contextFor(asuka, { shapeId, inputMethod }));
  assert.equal(resolved.windowSize.value, 4);
  assert.deepEqual(resolved.windowSize.origin, { kind: 'layout', layoutId });

  // setupへ書くとそちらが勝つ（setupIdをcontextへ渡した時だけ見る）
  const writtenSetup = setOverride(overrides, { kind: 'setup', setupId }, 'windowSize', 5);
  assert.ok(writtenSetup.ok);
  overrides = writtenSetup.overrides;
  resolved = resolveCascade(overrides, contextFor(asuka, { shapeId, inputMethod, setupId }));
  assert.equal(resolved.windowSize.value, 5);
  assert.deepEqual(resolved.windowSize.origin, { kind: 'setup', setupId });

  // setupIdを渡さない解決（Setup未確定のプレビュー等）ではsetupレベルを見ないのでlayoutの値のまま
  resolved = resolveCascade(overrides, contextFor(asuka, { shapeId, inputMethod }));
  assert.equal(resolved.windowSize.value, 4);
});

test('許可されていないレベルへの書き込みは拒否される（例外ではなく値で返す）', () => {
  // chainInterpretationはグローバルのみ許可
  const result = setOverride(
    EMPTY_CASCADE_OVERRIDES,
    { kind: 'layout', layoutId: asuka.id },
    'chainInterpretation',
    { breakOnSameFinger: false, breakOnTriggerOnly: false, breakOnThumbOnly: false, breakOnOppositeHandSimultaneous: false },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.kind, 'disallowed-level');
    assert.equal(result.error.itemId, 'chainInterpretation');
  }
});

test('許可されていないレベルに残っている古い値は解決時に無視され診断が付く', () => {
  // 直接ストアへ不正な形で値を仕込む（インポートした旧データを想定）。
  // setOverrideを経由しないので拒否されない = 「すでにストアに入っている」状態を再現する。
  const overrides: CascadeOverrides = {
    layout: { [asuka.id]: { chainInterpretation: { breakOnSameFinger: false, breakOnTriggerOnly: false, breakOnThumbOnly: false, breakOnOppositeHandSimultaneous: false } } },
  };
  const resolved = resolveCascade(overrides, contextFor(asuka));
  // 既定値のまま（layoutの値は無視した）
  assert.equal(resolved.chainInterpretation.value.breakOnSameFinger, true);
  assert.equal(resolved.chainInterpretation.origin.kind, 'default');
  assert.ok(resolved.chainInterpretation.diagnostics.some((d) => d.kind === 'ignored-disallowed-level'));
});

test('妥当性: 反対側の親指キーが無い形状ではpreferOppositeThumbが実現できずfallback+警告になる', () => {
  const shapeNoRightThumb = {
    ...PHYSICAL_SHAPES['row-staggered'],
    thumbs: PHYSICAL_SHAPES['row-staggered'].thumbs.filter((thumb) => thumb.finger !== 'RT'),
  };
  const context: CascadeContext = {
    shapeId: 'shape-no-right-thumb',
    shape: shapeNoRightThumb,
    inputMethod: 'kana-direct',
    layoutId: naginata.id,
    layout: naginata,
  };
  const written = setOverride(EMPTY_CASCADE_OVERRIDES, { kind: 'global' }, 'preferOppositeThumb', true);
  assert.ok(written.ok);

  const resolved = resolveCascade(written.overrides, context);
  assert.equal(resolved.preferOppositeThumb.value, false); // 実現できる値へ戻る
  assert.deepEqual(resolved.preferOppositeThumb.origin, { kind: 'global' }); // 出どころ自体は書き込まれた場所のまま
  assert.ok(resolved.preferOppositeThumb.diagnostics.some((d) => d.kind === 'invalid-fallback'));

  // 両方の親指キーがある形状では同じ上書きがそのまま実現できる
  const resolvedOk = resolveCascade(written.overrides, contextFor(naginata, { inputMethod: 'kana-direct' }));
  assert.equal(resolvedOk.preferOppositeThumb.value, true);
  assert.equal(resolvedOk.preferOppositeThumb.diagnostics.length, 0);
});

test('適用可否: SandSを持たない配列ではpreferOppositeThumbがnot-applicableと報告される', () => {
  const resolvedAsuka = resolveCascade(EMPTY_CASCADE_OVERRIDES, contextFor(asuka));
  assert.equal(resolvedAsuka.preferOppositeThumb.applicable, false);
  assert.ok(resolvedAsuka.preferOppositeThumb.diagnostics.some((d) => d.kind === 'not-applicable'));

  const resolvedNaginata = resolveCascade(EMPTY_CASCADE_OVERRIDES, contextFor(naginata));
  assert.equal(resolvedNaginata.preferOppositeThumb.applicable, true);
});

test('適用可否: ローマ字表を持たない配列（かな直接・英字）ではromajiRuleIdがnot-applicable', () => {
  const resolvedNicola = resolveCascade(EMPTY_CASCADE_OVERRIDES, contextFor(nicola));
  assert.equal(resolvedNicola.romajiRuleId.applicable, false);

  const resolvedEn = resolveCascade(EMPTY_CASCADE_OVERRIDES, contextFor(colemakEn));
  assert.equal(resolvedEn.romajiRuleId.applicable, false);

  const resolvedQwertyJa = resolveCascade(EMPTY_CASCADE_OVERRIDES, contextFor(qwertyJa, { inputMethod: 'romaji' }));
  assert.equal(resolvedQwertyJa.romajiRuleId.applicable, true);
});

test('リセット: 項目単位でそのレベルの1項目だけ消える', () => {
  let overrides = EMPTY_CASCADE_OVERRIDES;
  const level = { kind: 'layout' as const, layoutId: asuka.id };
  overrides = (setOverride(overrides, level, 'windowSize', 6) as { ok: true; overrides: CascadeOverrides }).overrides;
  overrides = (setOverride(overrides, level, 'sfbHomeCost', false) as { ok: true; overrides: CascadeOverrides }).overrides;

  overrides = resetItem(overrides, level, 'windowSize');
  const resolved = resolveCascade(overrides, contextFor(asuka));
  assert.equal(resolved.windowSize.value, 3); // 消えて既定に戻る
  assert.equal(resolved.sfbHomeCost.value, false); // 別項目は残る
});

test('リセット: レベル単位でそのレベルの上書きが全部消える', () => {
  let overrides = EMPTY_CASCADE_OVERRIDES;
  const level = { kind: 'layout' as const, layoutId: asuka.id };
  overrides = (setOverride(overrides, level, 'windowSize', 6) as { ok: true; overrides: CascadeOverrides }).overrides;
  overrides = (setOverride(overrides, level, 'sfbHomeCost', false) as { ok: true; overrides: CascadeOverrides }).overrides;

  overrides = resetLevel(overrides, level);
  assert.deepEqual(overrides, EMPTY_CASCADE_OVERRIDES);
  const resolved = resolveCascade(overrides, contextFor(asuka));
  assert.equal(resolved.windowSize.value, 3);
  assert.equal(resolved.sfbHomeCost.value, true);
});

// #544 Phase 2完了条件: 「同じ入力で旧実装と同じ数値が出ることがfixtureで確認されている」を
// カスケードの既定値についても満たす。test/fixtures/analyzer-regression.json の
// 上書き無しシナリオ（id末尾が default/legacy/modern で、それ以外の分岐名を含まないもの）は
// 全て「アプリの現在の既定値」を記録しているので、上書き無しの解決結果と一致するはずである。
test('上書き無しの解決結果は、全組み込み配列でfixtureに記録された既定条件と一致する', () => {
  const fixturePath = join(ROOT, 'test', 'fixtures', 'analyzer-regression.json');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    cases: Array<{
      id: string;
      language: 'en' | 'ja';
      layoutId: string;
      conditions: {
        windowSize: number;
        sfbHomeCost: boolean;
        preferOppositeThumb: boolean;
        triggerRealizationPolicy: unknown;
        actionRealizationPolicy: unknown;
        chainInterpretation: unknown;
        arpeggioInterpretation: unknown;
        geometryShapeId: string;
      };
    }>;
  };

  const defaultScenarios = fixture.cases.filter((c) => c.id.split(':').length === 3);
  assert.ok(defaultScenarios.length > 0);

  for (const scenario of defaultScenarios) {
    const list = scenario.language === 'en' ? LAYOUTS : LAYOUTS_JA;
    const layout = findLayout(list, scenario.layoutId);
    const context = contextFor(layout, { shapeId: scenario.conditions.geometryShapeId as PresetGeometryKind });
    const resolved = resolveCascade(EMPTY_CASCADE_OVERRIDES, context);

    assert.equal(resolved.windowSize.value, scenario.conditions.windowSize, scenario.id);
    assert.equal(resolved.sfbHomeCost.value, scenario.conditions.sfbHomeCost, scenario.id);
    assert.equal(resolved.preferOppositeThumb.value, scenario.conditions.preferOppositeThumb, scenario.id);
    assert.deepEqual(
      resolved.triggerRealizationPolicy.value,
      scenario.conditions.triggerRealizationPolicy,
      scenario.id,
    );
    assert.deepEqual(
      resolved.actionRealizationPolicy.value,
      scenario.conditions.actionRealizationPolicy,
      scenario.id,
    );
    assert.deepEqual(resolved.chainInterpretation.value, scenario.conditions.chainInterpretation, scenario.id);
    assert.deepEqual(
      resolved.arpeggioInterpretation.value,
      scenario.conditions.arpeggioInterpretation,
      scenario.id,
    );
  }
});
