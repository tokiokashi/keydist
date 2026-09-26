import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUTS, LAYOUTS_JA, type Layout } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PresetGeometryKind } from '#input/shapes/geometry.ts';
import type { CascadeContext, InputMethod } from '#input/settings/index.ts';
import {
  EMPTY_SETTINGS_OVERRIDES,
  resolveSettings,
  resetSettingsItem,
  resetSettingsLevel,
  setSettingsOverride,
  type SettingsCascadeOverrides,
} from './settings-items.ts';

// カスケードの仕組み自体のテストは src/input/settings/resolve.test.ts にある。
// ここでは #544 Phase 2 の具体的な項目（TracePolicy・ChainInterpretation・ローマ字規則id等）
// が正しく登録されていること、特にfixtureとの一致を検証する。

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function findLayout(list: readonly Layout[], id: string): Layout {
  const layout = list.find((l) => l.id === id);
  assert.ok(layout, `未知のlayout id: ${id}`);
  return layout;
}

const naginata = findLayout(LAYOUTS_JA, 'naginata-v18'); // SandS(交代打鍵)を持つ配列
const asuka = findLayout(LAYOUTS_JA, 'asuka'); // SandSを持たない配列
const nicola = findLayout(LAYOUTS_JA, 'nicola'); // かな直接（ローマ字表を持たない）
const qwertyJa = findLayout(LAYOUTS_JA, 'qwerty'); // ローマ字入力（既定でkunreiが焼き込み済み）
const oonishiJa = findLayout(LAYOUTS_JA, 'oonishi'); // ローマ字入力だが既定がoonishi
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

test('上書きが無ければ全項目が現行アプリの既定値で解決する', () => {
  const resolved = resolveSettings(EMPTY_SETTINGS_OVERRIDES, contextFor(asuka));
  assert.equal(resolved.windowSize.value, 3);
  assert.equal(resolved.sfbHomeCost.value, true);
  assert.equal(resolved.preferOppositeThumb.value, false);
  assert.equal(resolved.playbackRateAverage.value, 'sma');
  assert.equal(resolved.playbackRateWindow.value, 10);
  assert.equal(resolved.playbackRateHalfLifeSeconds.value, 1);
});

test('windowSize/sfbHomeCostはglobal/layout/setupのみ許可（shape/inputMethodは拒否）', () => {
  const toShape = setSettingsOverride(
    EMPTY_SETTINGS_OVERRIDES,
    { kind: 'shape', shapeId: 'row-staggered' },
    'windowSize',
    6,
  );
  assert.equal(toShape.ok, false);
  const toLayout = setSettingsOverride(
    EMPTY_SETTINGS_OVERRIDES,
    { kind: 'layout', layoutId: asuka.id },
    'windowSize',
    6,
  );
  assert.ok(toLayout.ok);
});

test('romajiRuleId: 既定値は配列ごとに違う（大西配列だけoonishi、それ以外はkunrei）', () => {
  const resolvedQwerty = resolveSettings(EMPTY_SETTINGS_OVERRIDES, contextFor(qwertyJa, { inputMethod: 'romaji' }));
  assert.equal(resolvedQwerty.romajiRuleId.value, 'kunrei');
  assert.equal(resolvedQwerty.romajiRuleId.origin.kind, 'default');
  assert.equal(resolvedQwerty.romajiRuleId.applicable, true);

  const resolvedOonishi = resolveSettings(EMPTY_SETTINGS_OVERRIDES, contextFor(oonishiJa, { inputMethod: 'romaji' }));
  assert.equal(resolvedOonishi.romajiRuleId.value, 'oonishi');
});

test('romajiRuleId: globalへは書き込めない。inputMethodレベルで「ローマ字入力は全部Xにする」ができる', () => {
  const toGlobal = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'romajiRuleId', 'azik');
  assert.equal(toGlobal.ok, false);

  const toInputMethod = setSettingsOverride(
    EMPTY_SETTINGS_OVERRIDES,
    { kind: 'inputMethod', inputMethod: 'romaji' },
    'romajiRuleId',
    'azik',
  );
  assert.ok(toInputMethod.ok);
  const resolved = resolveSettings(
    toInputMethod.overrides,
    contextFor(qwertyJa, { inputMethod: 'romaji' }),
  );
  assert.equal(resolved.romajiRuleId.value, 'azik'); // layoutの既定（kunrei）より強い
  assert.deepEqual(resolved.romajiRuleId.origin, { kind: 'inputMethod', inputMethod: 'romaji' });
});

test('romajiRuleId: ローマ字表を持たない配列（かな直接・英字）ではnot-applicable', () => {
  assert.equal(resolveSettings(EMPTY_SETTINGS_OVERRIDES, contextFor(nicola)).romajiRuleId.applicable, false);
  assert.equal(resolveSettings(EMPTY_SETTINGS_OVERRIDES, contextFor(colemakEn)).romajiRuleId.applicable, false);
});

test('preferOppositeThumb: SandSを持たない配列ではnot-applicable、反対の親指キーが無い形状ではfallback', () => {
  const resolvedAsuka = resolveSettings(EMPTY_SETTINGS_OVERRIDES, contextFor(asuka));
  assert.equal(resolvedAsuka.preferOppositeThumb.applicable, false);

  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'preferOppositeThumb', true);
  assert.ok(written.ok);
  const shapeNoRightThumb = {
    ...PHYSICAL_SHAPES['row-staggered'],
    thumbs: PHYSICAL_SHAPES['row-staggered'].thumbs.filter((thumb) => thumb.finger !== 'RT'),
  };
  const resolved = resolveSettings(written.overrides, {
    shapeId: 'shape-no-right-thumb',
    shape: shapeNoRightThumb,
    inputMethod: 'kana-direct',
    layoutId: naginata.id,
    layout: naginata,
  });
  assert.equal(resolved.preferOppositeThumb.value, false);
  assert.ok(resolved.preferOppositeThumb.diagnostics.some((d) => d.kind === 'invalid-fallback'));
});

test('リセット: 項目単位・レベル単位が実レジストリでも動く', () => {
  const level = { kind: 'layout' as const, layoutId: asuka.id };
  let overrides: SettingsCascadeOverrides = EMPTY_SETTINGS_OVERRIDES;
  overrides = (setSettingsOverride(overrides, level, 'windowSize', 6) as { ok: true; overrides: SettingsCascadeOverrides }).overrides;
  overrides = (setSettingsOverride(overrides, level, 'sfbHomeCost', false) as { ok: true; overrides: SettingsCascadeOverrides }).overrides;

  overrides = resetSettingsItem(overrides, level, 'windowSize');
  assert.equal(resolveSettings(overrides, contextFor(asuka)).windowSize.value, 3);
  assert.equal(resolveSettings(overrides, contextFor(asuka)).sfbHomeCost.value, false);

  overrides = resetSettingsLevel(overrides, level);
  assert.deepEqual(overrides, EMPTY_SETTINGS_OVERRIDES);
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
        romajiRuleId: string | null;
      };
    }>;
  };

  const defaultScenarios = fixture.cases.filter((c) => c.id.split(':').length === 3);
  assert.ok(defaultScenarios.length > 0);

  for (const scenario of defaultScenarios) {
    const list = scenario.language === 'en' ? LAYOUTS : LAYOUTS_JA;
    const layout = findLayout(list, scenario.layoutId);
    // romajiRuleIdはinputMethodに依存しない（layout側の既定のみ）ため、direct/kana-direct/romajiの
    // どれを渡しても値は変わらない。ここではローマ字が絡む配列は'romaji'を使う。
    const inputMethod: InputMethod = scenario.conditions.romajiRuleId !== null ? 'romaji' : 'direct';
    const context = contextFor(layout, {
      shapeId: scenario.conditions.geometryShapeId as PresetGeometryKind,
      inputMethod,
    });
    const resolved = resolveSettings(EMPTY_SETTINGS_OVERRIDES, context);

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
    // romajiRuleIdはローマ字入力の配列のみ厳密照合する（かな直接・英字はnot-applicableなので対象外）。
    if (scenario.conditions.romajiRuleId !== null) {
      assert.equal(resolved.romajiRuleId.value, scenario.conditions.romajiRuleId, scenario.id);
      assert.equal(resolved.romajiRuleId.applicable, true, scenario.id);
    } else {
      assert.equal(resolved.romajiRuleId.applicable, false, scenario.id);
    }
  }
});
