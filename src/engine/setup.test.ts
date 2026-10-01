import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUTS, LAYOUTS_JA, type Layout } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PresetGeometryKind } from '#input/shapes/geometry.ts';
import {
  resolveSetup,
  type AnalysisTarget,
  type Setup,
  type SetupCatalog,
} from '#input/setup/index.ts';
import {
  DEFAULT_SHAPE_ID,
  EMPTY_SETTINGS_OVERRIDES,
  resolveSettings,
  setSettingsOverride,
  type SettingsCascadeOverrides,
} from './settings-items.ts';
import { resolveTargetForText } from './target-resolution.ts';

// Setup（src/input/setup/）が、engineが持つ具体のカスケード項目（SETTINGS_ITEMS）と
// 実レジストリを通して噛み合うことを確認する。Setup自体のテストはsrc/input/setup/*.test.ts、
// カスケードの仕組み自体のテストはsrc/input/settings/resolve.test.ts、
// カスケードの具体項目単体のfixture一致はsrc/engine/settings-items.test.tsにある。
// ここはその橋渡し（resolveSetup → resolveSettings）だけを見る。

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function findLayout(list: readonly Layout[], id: string): Layout {
  const layout = list.find((l) => l.id === id);
  assert.ok(layout, `未知のlayout id: ${id}`);
  return layout;
}

function catalogFor(layout: Layout, shapeId: PresetGeometryKind = 'row-staggered'): SetupCatalog {
  return {
    layouts: new Map([[layout.id, layout]]),
    shapes: new Map([[shapeId, PHYSICAL_SHAPES[shapeId]]]),
  };
}

const asuka = findLayout(LAYOUTS_JA, 'asuka');

test('カスケードの追従: 上書きの無いSetupはグローバルの変更に追従し、Setupレベルで上書きしたSetupは追従しない', () => {
  const followingSetup: Setup = { id: 'setup-follow', number: 1, layoutId: asuka.id, shapeId: 'row-staggered' };
  const overridingSetup: Setup = { id: 'setup-override', number: 1, layoutId: asuka.id, shapeId: 'row-staggered' };
  const catalog = catalogFor(asuka);

  // まずグローバルにwindowSizeを書く。
  const globalWritten = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'windowSize', 5);
  assert.ok(globalWritten.ok);
  let overrides: SettingsCascadeOverrides = globalWritten.overrides;

  // overridingSetupだけにSetupレベルの上書きを足す。
  const setupWritten = setSettingsOverride(
    overrides,
    { kind: 'setup', setupId: overridingSetup.id },
    'windowSize',
    9,
  );
  assert.ok(setupWritten.ok);
  overrides = setupWritten.overrides;

  const followingResolution = resolveSetup(followingSetup, catalog, 'kana-direct');
  const overridingResolution = resolveSetup(overridingSetup, catalog, 'kana-direct');
  assert.ok(followingResolution.ok);
  assert.ok(overridingResolution.ok);
  if (!followingResolution.ok || !overridingResolution.ok) return;

  assert.equal(resolveSettings(overrides, followingResolution.context).windowSize.value, 5);
  assert.equal(resolveSettings(overrides, overridingResolution.context).windowSize.value, 9);

  // グローバルをさらに変えると、上書きの無いSetupだけ追従する（#544 §4「上位レベルの設定を
  // 変えると、上書きしていない全Setupが追従する」）。
  const globalChanged = setSettingsOverride(overrides, { kind: 'global' }, 'windowSize', 7);
  assert.ok(globalChanged.ok);
  overrides = globalChanged.overrides;

  assert.equal(resolveSettings(overrides, followingResolution.context).windowSize.value, 7); // 追従した
  assert.equal(resolveSettings(overrides, overridingResolution.context).windowSize.value, 9); // 変わらない
});

test('配列・物理配列が同じ2つのSetupはポリシーだけ変えて比較できる', () => {
  const catalog = catalogFor(asuka);
  const setupA: Setup = { id: 'setup-a', number: 1, layoutId: asuka.id, shapeId: 'row-staggered' };
  const setupB: Setup = { id: 'setup-b', number: 1, layoutId: asuka.id, shapeId: 'row-staggered' };

  const written = setSettingsOverride(
    EMPTY_SETTINGS_OVERRIDES,
    { kind: 'setup', setupId: setupB.id },
    'windowSize',
    6,
  );
  assert.ok(written.ok);
  const overrides = written.overrides;

  const resolutionA = resolveSetup(setupA, catalog, 'kana-direct');
  const resolutionB = resolveSetup(setupB, catalog, 'kana-direct');
  assert.ok(resolutionA.ok);
  assert.ok(resolutionB.ok);
  if (!resolutionA.ok || !resolutionB.ok) return;

  // 配列・物理配列は同じ実体を指す。
  assert.equal(resolutionA.layout, resolutionB.layout);
  assert.equal(resolutionA.shape, resolutionB.shape);
  // ただし解決結果（実効値）はSetup固有の上書きだけ違う。
  assert.equal(resolveSettings(overrides, resolutionA.context).windowSize.value, 3); // 既定
  assert.equal(resolveSettings(overrides, resolutionB.context).windowSize.value, 6); // 上書き
});

test('resolveSetup: 配列が削除されたSetupは値としてエラーを返し、例外にしない', () => {
  const setup: Setup = { id: 'setup-x', number: 1, layoutId: 'deleted-layout', shapeId: 'row-staggered' };
  const result = resolveSetup(setup, catalogFor(asuka), 'kana-direct');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.errors, [{ kind: 'layout-missing', layoutId: 'deleted-layout' }]);
});

// #544 Phase 2完了条件と同じ基準（「同じ入力で旧実装と同じ数値が出る」）を、配列を対象
// （#578指摘1「対象を配列かSetupにする」の`AnalysisTarget`）にした解決結果についても
// 満たすことを確認する。fixtureの「上書き無しシナリオ」（id末尾が default/legacy/modern）は
// すべて`row-staggered`（＝`defaultShapeId`の既定値）を使う条件なので、Setupという器を
// 経由しない配列対象の解決と1対1に対応する。
test('配列を対象にした解決は、実カタログではfixtureの既定条件（default/legacy/modern）と一致する', () => {
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
        geometryShapeId: string;
        romajiRuleId: string | null;
      };
    }>;
  };

  const defaultScenarios = fixture.cases.filter((c) => c.id.split(':').length === 3);
  assert.ok(defaultScenarios.length > 0);

  for (const scenario of defaultScenarios) {
    assert.equal(scenario.conditions.geometryShapeId, DEFAULT_SHAPE_ID, `${scenario.id}: 既定シナリオは常にDEFAULT_SHAPE_ID`);

    const list = scenario.language === 'en' ? LAYOUTS : LAYOUTS_JA;
    const layout = findLayout(list, scenario.layoutId);
    const catalog = catalogFor(layout, scenario.conditions.geometryShapeId as PresetGeometryKind);
    const target: AnalysisTarget = { kind: 'layout', layoutId: layout.id };

    const language: 'en' | 'ja' = scenario.language;
    const resolution = resolveTargetForText(target, new Map(), catalog, new Map(), EMPTY_SETTINGS_OVERRIDES, language);
    assert.ok(resolution.ok, scenario.id);
    if (!resolution.ok) continue;

    const resolved = resolveSettings(EMPTY_SETTINGS_OVERRIDES, resolution.context);
    assert.equal(resolved.windowSize.value, scenario.conditions.windowSize, scenario.id);
    assert.equal(resolved.sfbHomeCost.value, scenario.conditions.sfbHomeCost, scenario.id);
    assert.equal(resolved.preferOppositeThumb.value, scenario.conditions.preferOppositeThumb, scenario.id);
    if (scenario.conditions.romajiRuleId !== null) {
      assert.equal(resolved.romajiRuleId.value, scenario.conditions.romajiRuleId, scenario.id);
    } else {
      assert.equal(resolved.romajiRuleId.applicable, false, scenario.id);
    }

    // 配列対象と、同じ配列・既定の物理配列で上書きの無いSetup対象は、CascadeContextが
    // setupIdの有無以外一致するはずなので、解決結果（実効値・出どころ）もビット一致する
    // （`target-resolution.ts`のコメント参照。#578指摘1の「必ず確認する」項目）。
    const equivalentSetup: Setup = {
      id: `equivalent-${scenario.id}`,
      number: 1,
      layoutId: layout.id,
      shapeId: scenario.conditions.geometryShapeId,
    };
    const setupResolution = resolveSetup(equivalentSetup, catalog, resolution.context.inputMethod);
    assert.ok(setupResolution.ok, scenario.id);
    if (!setupResolution.ok) continue;
    const resolvedViaSetup = resolveSettings(EMPTY_SETTINGS_OVERRIDES, setupResolution.context);
    assert.equal(resolved.defaultShapeId.applicable, true, `${scenario.id}: 配列対象ではdefaultShapeIdが効く`);
    assert.equal(resolvedViaSetup.defaultShapeId.applicable, false, `${scenario.id}: Setup対象ではdefaultShapeIdは効かない`);
    for (const itemId of Object.keys(resolved) as (keyof typeof resolved)[]) {
      assert.deepEqual(resolved[itemId].value, resolvedViaSetup[itemId].value, `${scenario.id}: ${itemId}`);
      assert.equal(resolved[itemId].origin.kind, resolvedViaSetup[itemId].origin.kind, `${scenario.id}: ${itemId}.origin`);
      // defaultShapeIdだけは例外: 配列対象では意味を持つ（applicable=true）が、
      // Setup対象ではSetup自身のshapeIdが優先されるため意味を持たない（applicable=false）。
      // これは`SETTINGS_ITEMS.defaultShapeId.isApplicable`の設計どおりの差（レビュー指摘6）。
      if (itemId === 'defaultShapeId') continue;
      assert.equal(resolved[itemId].applicable, resolvedViaSetup[itemId].applicable, `${scenario.id}: ${itemId}`);
    }
  }
});
