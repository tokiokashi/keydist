import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import {
  EMPTY_SETTINGS_OVERRIDES,
  setSettingsOverride,
  type SettingsCascadeOverrides,
  type SettingsItemId,
} from '#engine/settings-items.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { createEngineCache } from '#engine/cache.ts';
import { sampleText, type TextLanguage } from '#input/text/samples.ts';

// #544 Phase 2「engine」のfixture回帰テスト。
//
// test/analyzer-regression.test.ts は generateTrace / analyzeStrokeStructure / computeMetrics を
// 直接呼ぶ「旧実装の経路」の再計算だった。このテストは同じfixtureを、Setup + カスケードの
// 上書き → resolveEngineInput → EngineCache という「engineの経路」で計算し直し、
// 同じ数値が出ることを確認する（#544完了条件「同じ入力で旧実装と同じ数値が出ることが
// fixtureで確認されている」をengineに対しても満たす）。
//
// #legacy/* も #app/* もimportしない。理由は analyzer-regression.test.ts と同じ
// （Phase 5でsrc/legacy/が消えた後もこのテストが生き続けるため）。

interface ConditionsSnapshot {
  windowSize: number;
  sfbHomeCost: boolean;
  preferOppositeThumb: boolean;
  geometryShapeId: string;
  fingerAssignmentId: string;
  chainInterpretation: Record<string, unknown>;
  arpeggioInterpretation: Record<string, unknown>;
  triggerRealizationPolicy: Record<string, unknown>;
  actionRealizationPolicy: Record<string, unknown>;
  romajiRuleId: string | null;
}

interface FixtureCase {
  id: string;
  language: TextLanguage;
  layoutId: string;
  sampleId: string;
  textLength: number;
  textSha256: string;
  conditions: ConditionsSnapshot;
  metrics: Record<string, unknown>;
  analysis: Record<string, unknown>;
}

interface Fixture {
  version: number;
  cases: FixtureCase[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(HERE, 'fixtures', 'analyzer-regression.json');
const fixture: Fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

/** setupレベルへ1項目書き込む。書き込み拒否（許可されていないレベル）ならテストを失敗させる。 */
function overrideAtSetup<K extends SettingsItemId>(
  overrides: SettingsCascadeOverrides,
  setupId: string,
  itemId: K,
  value: SettingsCascadeOverrides extends never ? never : unknown,
): SettingsCascadeOverrides {
  const result = setSettingsOverride(overrides, { kind: 'setup', setupId }, itemId, value as never);
  assert.ok(result.ok, `setupレベルへの${itemId}の書き込みが拒否された`);
  return result.ok ? result.overrides : overrides;
}

/**
 * fixtureのconditionsスナップショットを、カスケードの上書き（Setupレベル。
 * chain/arpeggio解釈だけはglobal-onlyの項目なのでglobalレベル）へ写す。
 * #544 Phase 2「engine」指示書:「fixtureのconditionsをカスケードの上書きとSetupに写す変換を
 * テスト側に書く」に対応する変換。
 */
function overridesFor(setupId: string, conditions: ConditionsSnapshot): SettingsCascadeOverrides {
  let overrides = EMPTY_SETTINGS_OVERRIDES;
  overrides = overrideAtSetup(overrides, setupId, 'windowSize', conditions.windowSize);
  overrides = overrideAtSetup(overrides, setupId, 'sfbHomeCost', conditions.sfbHomeCost);
  overrides = overrideAtSetup(overrides, setupId, 'preferOppositeThumb', conditions.preferOppositeThumb);
  overrides = overrideAtSetup(overrides, setupId, 'triggerRealizationPolicy', conditions.triggerRealizationPolicy);
  overrides = overrideAtSetup(overrides, setupId, 'actionRealizationPolicy', conditions.actionRealizationPolicy);
  overrides = overrideAtSetup(overrides, setupId, 'fingerAssignmentId', conditions.fingerAssignmentId);
  if (conditions.romajiRuleId !== null) {
    overrides = overrideAtSetup(overrides, setupId, 'romajiRuleId', conditions.romajiRuleId);
  }

  const global = { kind: 'global' as const };
  const chain = setSettingsOverride(overrides, global, 'chainInterpretation', conditions.chainInterpretation as never);
  assert.ok(chain.ok);
  overrides = chain.ok ? chain.overrides : overrides;
  const arpeggio = setSettingsOverride(
    overrides,
    global,
    'arpeggioInterpretation',
    conditions.arpeggioInterpretation as never,
  );
  assert.ok(arpeggio.ok);
  overrides = arpeggio.ok ? arpeggio.overrides : overrides;

  return overrides;
}

function metricsSummary(m: ReturnType<typeof computeFor>['metrics']) {
  return {
    geometryId: m.geometryId,
    geometryName: m.geometryName,
    fingerAssignmentId: m.fingerAssignmentId,
    fingerAssignmentName: m.fingerAssignmentName,
    strokes: m.strokes,
    actions: m.actions,
    presses: m.presses,
    skipped: m.skipped,
    inputChars: m.inputChars,
    perFinger: m.perFinger,
    perFingerPresses: m.perFingerPresses,
    totalUnits: m.totalUnits,
    totalMm: m.totalMm,
    meanPerStroke: m.meanPerStroke,
    perCharUnits: m.perCharUnits,
    perCharSteps: m.perCharSteps,
    perCharPresses: m.perCharPresses,
    singleTapLayerRate: m.singleTapLayerRate,
    singleTapRate: m.singleTapRate,
    singleKeyRate: m.singleKeyRate,
    sameFinger: m.sameFinger,
    adjacent: m.adjacent,
    combos: m.combos,
    comboPresses: m.comboPresses,
    layers: m.layers.map((layer) => ({ id: layer.id, label: layer.label, presses: layer.presses })),
  };
}

function analysisSummary(a: ReturnType<typeof computeFor>['analysis']) {
  return {
    strokeCount: a.aggregate.strokeCount,
    arpeggio: a.aggregate.arpeggio,
    roll: a.aggregate.roll,
    directionalTransitions: a.aggregate.directionalTransitions,
    redirect: a.aggregate.redirect,
    sfb: a.aggregate.sfb,
  };
}

/**
 * fixtureケース1件を、Setup + カスケードの上書き → resolveEngineInput → EngineCache という
 * engineの経路で計算する。呼び出しごとに新しいcacheを作るのではなく、複数回呼んで
 * キャッシュ共有（中身が同じなら同じ結果オブジェクトを返す）も確認できるようにcacheを引数で
 * 受け取れる形にしている。
 */
function computeFor(fixtureCase: FixtureCase, cache = createEngineCache()) {
  const text = sampleText(fixtureCase.language, fixtureCase.sampleId);
  assert.equal(
    sha256(text),
    fixtureCase.textSha256,
    `${fixtureCase.id}: サンプルテキストのハッシュがfixture生成時と違う`,
  );
  assert.equal([...text].length, fixtureCase.textLength, `${fixtureCase.id}: サンプルテキストの文字数が違う`);

  const setupId = `setup:${fixtureCase.id}`;
  const setup: Setup = {
    id: setupId,
    layoutId: fixtureCase.layoutId,
    shapeId: fixtureCase.conditions.geometryShapeId,
    colorIndex: 0,
  };
  const overrides = overridesFor(setupId, fixtureCase.conditions);

  const resolution = resolveEngineInput({
    setup,
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides,
    text,
    language: fixtureCase.language,
  });
  assert.ok(resolution.ok, `${fixtureCase.id}: 解決に失敗した: ${resolution.ok ? '' : JSON.stringify(resolution.error)}`);
  if (!resolution.ok) throw new Error('unreachable');

  const { trace } = cache.getTrace(resolution.input);
  const { analysis, metrics } = cache.getInterpretation(resolution.input);
  return { trace, analysis, metrics };
}

test('fixtureのバージョンとケース数が空でない', () => {
  assert.equal(fixture.version, 1);
  assert.ok(fixture.cases.length > 0);
});

let matched = 0;
for (const fixtureCase of fixture.cases) {
  test(`engine回帰: ${fixtureCase.id}`, () => {
    const { metrics, analysis } = computeFor(fixtureCase);
    assert.deepEqual(metricsSummary(metrics), fixtureCase.metrics, `${fixtureCase.id}: metricsがfixtureと食い違う`);
    assert.deepEqual(
      analysisSummary(analysis),
      fixtureCase.analysis,
      `${fixtureCase.id}: analysis集計がfixtureと食い違う`,
    );
    matched++;
  });
}

test('50ケース全件がengineの経路で一致した', () => {
  assert.equal(matched, fixture.cases.length);
  assert.equal(matched, 50);
});

test('中身が同じ2つのSetup（配列・形状・条件が同じでidだけ違う）はTraceを共有する', () => {
  const cache = createEngineCache();
  const base = fixture.cases[0]!;
  const first = computeFor(base, cache);
  const clonedCase: FixtureCase = { ...base, id: `${base.id}-clone` };
  const second = computeFor(clonedCase, cache);
  assert.equal(first.trace, second.trace);
});
