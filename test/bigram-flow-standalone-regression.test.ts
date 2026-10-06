import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUT_BY_ID, LAYOUTS, LAYOUTS_JA, withRomaji, type Layout } from '#input/layouts/index.ts';
import {
  assignmentWithHomeKeys,
  buildGeometry,
  DEFAULT_FINGER_ASSIGNMENT,
  JIS_FINGER_ASSIGNMENT,
  PHYSICAL_SHAPES,
  type FingerAssignment,
  type PhysicalShape,
  type PresetGeometryKind,
} from '#input/shapes/geometry.ts';
import { generateTrace, type TracePolicy } from '#trace/generate.ts';
import { tableForRule } from '#input/romaji/rules.ts';
import { sampleText, type TextLanguage } from '#input/text/samples.ts';
import type { Setup } from '#input/setup/index.ts';
import {
  EMPTY_SETTINGS_OVERRIDES,
  setSettingsOverride,
  type SettingsCascadeOverrides,
  type SettingsItemId,
} from '#engine/settings-items.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { createEngineCache } from '#engine/cache.ts';
import { bigramFlowDefinition } from '#analyzers/bigram-flow/extract.ts';
import { DEFAULT_BIGRAM_FLOW_OPTIONS } from '#analyzers/bigram-flow/options.ts';
import { computeBigramFlowExtraction } from '#analyzers/bigram-flow/extract.ts';

/**
 * hosts/standalone のBigram Flow単体ページが使う経路（Setup + カスケードの上書き →
 * resolveEngineInput → EngineCache → bigramFlowDefinition.extract）と、Trace生成の
 * 回帰基準（generateTraceを直接呼ぶ。test/analyzer-regression.test.tsのrecompute()と
 * 同じ組み立て）とで、同じfixture条件から同じBigramFlowExtractedが出ることを確認する。
 *
 * 比べる相手は `src/legacy/` のUIページそのものではない。legacyのBigram Flowページ
 * （`src/legacy/analyzer-bigram-flow.tsx`）は計算済みのTraceを受け取って表示するだけで、
 * Traceを作るのは回帰基準と同じ `generateTrace` なので、その経路を基準にしている。
 * 抽出関数はどちらの経路も同じなので、このテストの実質的な確認内容は
 * 「Setup解決・カスケード解決・engineのキャッシュを経由しても同じTraceに帰着するか」になる。
 * */

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
  conditions: ConditionsSnapshot;
}

interface Fixture {
  cases: FixtureCase[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(HERE, 'fixtures', 'analyzer-regression.json');
const fixture: Fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

// 全50ケース回す必要は無い（Trace生成の数値一致はengine-regression.test.tsが既に見ている）。
// ここで見たいのは「Bigram Flowの抽出まで含めて、直接経路とengine経路が一致するか」なので、
// 英語直接入力・日本語ローマ字入力・日本語かな直接入力の3通りを代表させる。
const CASE_IDS = ['en:colemak-dh:default', 'ja:colemak-dh:legacy', 'ja:asuka:legacy'];

function findFixtureCase(id: string): FixtureCase {
  const found = fixture.cases.find((candidate) => candidate.id === id);
  assert.ok(found, `fixtureに${id}が無い`);
  return found;
}

const FINGER_ASSIGNMENTS: Record<string, FingerAssignment> = {
  [DEFAULT_FINGER_ASSIGNMENT.id]: DEFAULT_FINGER_ASSIGNMENT,
  [JIS_FINGER_ASSIGNMENT.id]: JIS_FINGER_ASSIGNMENT,
};

function allLayouts(language: TextLanguage): readonly Layout[] {
  return language === 'en' ? LAYOUTS : LAYOUTS_JA;
}

/** Trace生成の回帰基準と同じ「直接」経路（test/analyzer-regression.test.tsのrecompute()と同じ組み立て）。 */
function directTrace(fixtureCase: FixtureCase) {
  const layout = allLayouts(fixtureCase.language).find((candidate) => candidate.id === fixtureCase.layoutId);
  assert.ok(layout);
  const text = sampleText(fixtureCase.language, fixtureCase.sampleId);

  const resolvedLayout = fixtureCase.conditions.romajiRuleId !== null
    ? withRomaji(layout!, tableForRule(fixtureCase.conditions.romajiRuleId))
    : layout!;

  const shapeId = fixtureCase.conditions.geometryShapeId as PresetGeometryKind;
  const fingerAssignment = FINGER_ASSIGNMENTS[fixtureCase.conditions.fingerAssignmentId];
  assert.ok(fingerAssignment);
  const geometry = buildGeometry(
    PHYSICAL_SHAPES[shapeId],
    assignmentWithHomeKeys(fingerAssignment, layout!.homeKeys),
  );
  const tracePolicy: TracePolicy = {
    windowSize: fixtureCase.conditions.windowSize,
    sfbHomeCost: fixtureCase.conditions.sfbHomeCost,
    preferOppositeThumb: fixtureCase.conditions.preferOppositeThumb,
    triggerRealizationPolicy: fixtureCase.conditions.triggerRealizationPolicy as never,
    actionRealizationPolicy: fixtureCase.conditions.actionRealizationPolicy as never,
  };

  return generateTrace(text, resolvedLayout, geometry, tracePolicy);
}

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function overrideAtSetup<K extends SettingsItemId>(
  overrides: SettingsCascadeOverrides,
  setupId: string,
  itemId: K,
  value: unknown,
): SettingsCascadeOverrides {
  const result = setSettingsOverride(overrides, { kind: 'setup', setupId }, itemId, value as never);
  assert.ok(result.ok);
  return result.ok ? result.overrides : overrides;
}

/** engine経路（`hosts/standalone`が実際に呼ぶのと同じ関数の並び）。 */
function engineTrace(fixtureCase: FixtureCase) {
  const setupId = fixtureCase.id;
  const setup: Setup = { id: setupId, number: 1, layoutId: fixtureCase.layoutId, shapeId: fixtureCase.conditions.geometryShapeId };

  let overrides = EMPTY_SETTINGS_OVERRIDES;
  overrides = overrideAtSetup(overrides, setupId, 'windowSize', fixtureCase.conditions.windowSize);
  overrides = overrideAtSetup(overrides, setupId, 'sfbHomeCost', fixtureCase.conditions.sfbHomeCost);
  overrides = overrideAtSetup(overrides, setupId, 'preferOppositeThumb', fixtureCase.conditions.preferOppositeThumb);
  overrides = overrideAtSetup(overrides, setupId, 'triggerRealizationPolicy', fixtureCase.conditions.triggerRealizationPolicy);
  overrides = overrideAtSetup(overrides, setupId, 'actionRealizationPolicy', fixtureCase.conditions.actionRealizationPolicy);
  overrides = overrideAtSetup(overrides, setupId, 'fingerAssignmentId', fixtureCase.conditions.fingerAssignmentId);
  if (fixtureCase.conditions.romajiRuleId !== null) {
    overrides = overrideAtSetup(overrides, setupId, 'romajiRuleId', fixtureCase.conditions.romajiRuleId);
  }

  const text = sampleText(fixtureCase.language, fixtureCase.sampleId);
  const resolved = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides,
    text,
    language: fixtureCase.language,
  });
  assert.ok(resolved.ok, resolved.ok ? '' : JSON.stringify(resolved.error));
  if (!resolved.ok) throw new Error('unreachable');

  const cache = createEngineCache();
  const extraction = cache.getExtraction(resolved.input, bigramFlowDefinition, DEFAULT_BIGRAM_FLOW_OPTIONS);
  const traceResult = cache.getTrace(resolved.input);
  return { trace: traceResult.trace, extracted: extraction.extracted };
}

for (const id of CASE_IDS) {
  test(`Bigram Flow: engine経路と直接経路（回帰基準と同じ組み立て）で同じ抽出結果になる: ${id}`, () => {
    const fixtureCase = findFixtureCase(id);
    const direct = directTrace(fixtureCase);
    const directExtracted = computeBigramFlowExtraction(direct, DEFAULT_BIGRAM_FLOW_OPTIONS);

    const engine = engineTrace(fixtureCase);

    assert.deepEqual(engine.trace.strokes.length, direct.strokes.length);
    assert.deepEqual(engine.extracted, directExtracted);
  });
}
