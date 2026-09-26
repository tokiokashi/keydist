import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUTS, LAYOUTS_JA, LAYOUT_BY_ID, type Layout } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PresetGeometryKind } from '#input/shapes/geometry.ts';
import type { InputMethod } from '#input/settings/index.ts';
import {
  initialSetups,
  resolveSetup,
  type Setup,
  type SetupCatalog,
} from '#input/setup/index.ts';
import {
  EMPTY_SETTINGS_OVERRIDES,
  resolveSettings,
  setSettingsOverride,
  type SettingsCascadeOverrides,
} from './settings-items.ts';

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
  const followingSetup: Setup = { id: 'setup-follow', layoutId: asuka.id, shapeId: 'row-staggered' };
  const overridingSetup: Setup = { id: 'setup-override', layoutId: asuka.id, shapeId: 'row-staggered' };
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

test('配列・形状が同じ2つのSetupはポリシーだけ変えて比較できる', () => {
  const catalog = catalogFor(asuka);
  const setupA: Setup = { id: 'setup-a', layoutId: asuka.id, shapeId: 'row-staggered' };
  const setupB: Setup = { id: 'setup-b', layoutId: asuka.id, shapeId: 'row-staggered' };

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

  // 配列・形状は同じ実体を指す。
  assert.equal(resolutionA.layout, resolutionB.layout);
  assert.equal(resolutionA.shape, resolutionB.shape);
  // ただし解決結果（実効値）はSetup固有の上書きだけ違う。
  assert.equal(resolveSettings(overrides, resolutionA.context).windowSize.value, 3); // 既定
  assert.equal(resolveSettings(overrides, resolutionB.context).windowSize.value, 6); // 上書き
});

test('resolveSetup: 配列が削除されたSetupは値としてエラーを返し、例外にしない', () => {
  const setup: Setup = { id: 'setup-x', layoutId: 'deleted-layout', shapeId: 'row-staggered' };
  const result = resolveSetup(setup, catalogFor(asuka), 'kana-direct');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.errors, [{ kind: 'layout-missing', layoutId: 'deleted-layout' }]);
});

// #544 Phase 2完了条件と同じ基準（「同じ入力で旧実装と同じ数値が出る」）を、初期Setupの解決結果
// についても満たすことを確認する。initialSetups() は組み込み配列すべてに対してSetupを作るので、
// fixtureの「上書き無しシナリオ」（id末尾が default/legacy/modern）と1対1に対応するはずである。
test('initialSetups() を実カタログで解決すると、fixtureの既定条件（default/legacy/modern）と一致する', () => {
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

  // initialSetups()が作る集合は「組み込み配列 × row-staggered」で、layoutIdは
  // LAYOUT_BY_ID（EN/JAを合わせた唯一の正）のkeyと1対1。fixtureのlayoutIdはEN/JAで
  // 別カタログ（LAYOUTS / LAYOUTS_JA）を参照するので、initialSetups自体はLAYOUT_BY_ID越しに
  // 1回だけ作り、各シナリオの解決にはシナリオの言語に合ったLayoutの実体を使う
  // （'qwerty'等、EN/JA双方に同じidがあり中身が違う配列があるため。#544の打ち方の導出が
  // 別項目で行う「言語からどちらの実体を使うか決める」判断を、ここではfixtureの記録通りに
  // 手で再現している）。
  const setups = initialSetups(() => 'unused'); // idは比較に使わないので固定でよい
  assert.equal(setups.filter((s) => s.shapeId === 'row-staggered').length, setups.length);
  const initialLayoutIds = new Set(setups.map((s) => s.layoutId));
  assert.deepEqual(initialLayoutIds, new Set(LAYOUT_BY_ID.keys()));

  for (const scenario of defaultScenarios) {
    const list = scenario.language === 'en' ? LAYOUTS : LAYOUTS_JA;
    const layout = findLayout(list, scenario.layoutId);
    assert.ok(
      initialLayoutIds.has(layout.id),
      `initialSetups() に ${scenario.id} の配列(${layout.id})が含まれていない`,
    );

    const setup: Setup = { id: `fixture-${scenario.id}`, layoutId: layout.id, shapeId: scenario.conditions.geometryShapeId };
    const catalog = catalogFor(layout, scenario.conditions.geometryShapeId as PresetGeometryKind);
    const inputMethod: InputMethod = scenario.conditions.romajiRuleId !== null ? 'romaji' : 'direct';

    const resolution = resolveSetup(setup, catalog, inputMethod);
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
  }
});
