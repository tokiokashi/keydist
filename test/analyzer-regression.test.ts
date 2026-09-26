import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUTS, LAYOUTS_JA, withRomaji, type Layout } from '#input/layouts/index.ts';
import {
  assignmentWithHomeKeys,
  buildGeometry,
  DEFAULT_FINGER_ASSIGNMENT,
  JIS_FINGER_ASSIGNMENT,
  PHYSICAL_SHAPES,
  type FingerAssignment,
  type PresetGeometryKind,
} from '#input/shapes/geometry.ts';
import { generateTrace, type TracePolicy } from '#trace/generate.ts';
import { analyzeStrokeStructure } from '#interpretation/structure/aggregate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import type { ChainInterpretation } from '#interpretation/structure/chain.ts';
import type { ArpeggioInterpretation } from '#interpretation/structure/arpeggio.ts';
import type {
  ActionRealizationPolicy,
  TriggerRealizationPolicy,
} from '#input/semantics/index.ts';
import { tableForRule } from '#input/romaji/rules.ts';
import { sampleText, type TextLanguage } from '#input/text/samples.ts';

/**
 * 組み込みの指割り当て。fixtureに記録した fingerAssignmentId から実体を引き直す
 * （コーディネーターレビュー指摘: 指割り当てをハードコードせず記録した値から再構築する）。
 */
const FINGER_ASSIGNMENTS: Record<string, FingerAssignment> = {
  [DEFAULT_FINGER_ASSIGNMENT.id]: DEFAULT_FINGER_ASSIGNMENT,
  [JIS_FINGER_ASSIGNMENT.id]: JIS_FINGER_ASSIGNMENT,
};

function findFingerAssignment(id: string): FingerAssignment {
  const assignment = FINGER_ASSIGNMENTS[id];
  assert.ok(assignment, `未知のfingerAssignmentId: ${id}`);
  return assignment;
}

// Epic #544 Phase 2 のfixture回帰テスト。
//
// #legacy/* も #app/* も import しない。このfixtureはPhase 5でsrc/legacy/が消えた後、
// 新engineに対して「旧実装と同じ数値が出る」ことを確かめ続けるためのものなので、
// テスト自身が旧実装の生死に依存してはいけない（コーディネーターレビュー指摘）。
// サンプルテキストは #input/text/samples.ts（standalone/Workspace双方が使う置き場）から読む。
//
// 置き場について: docs/architecture.md の依存規則は src/ 配下だけを検査する
// （test/architecture-layers.test.ts の sourceFiles(SRC) は test/ を歩かない）。
// このテストは input/trace/interpretation の複数層をまたぐリポジトリ横断の検査であり、
// 「主対象のソース1つの隣」には置けない。CONTRIBUTING.md は test/*.test.ts を
// architecture・commit-msg等の横断検査用としているが、このfixture比較も同種の
// 横断検査と判断してここに置く（将来 src/engine/ ができたらそちらへ寄せる方が
// 「ソース隣接」の原則に近いので、置き場は再検討の余地として残す）。

interface ConditionsSnapshot {
  windowSize: number;
  sfbHomeCost: boolean;
  preferOppositeThumb: boolean;
  geometryShapeId: string;
  fingerAssignmentId: string;
  chainInterpretation: ChainInterpretation;
  arpeggioInterpretation: ArpeggioInterpretation;
  triggerRealizationPolicy: TriggerRealizationPolicy;
  actionRealizationPolicy: ActionRealizationPolicy;
  romajiRuleId: string | null;
}

interface FixtureCase {
  id: string;
  note?: string;
  language: TextLanguage;
  layoutId: string;
  sampleId: string;
  textLength: number;
  textSha256: string;
  conditions: ConditionsSnapshot;
  metrics: Record<string, unknown>;
  analysis: Record<string, unknown>;
  nSensitivity?: { windowSize: number; totalUnits: number; totalMm: number }[];
}

interface Fixture {
  version: number;
  sourceCommit?: string;
  cases: FixtureCase[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(HERE, 'fixtures', 'analyzer-regression.json');
const fixture: Fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function allLayouts(language: TextLanguage): readonly Layout[] {
  return language === 'en' ? LAYOUTS : LAYOUTS_JA;
}

function findLayout(language: TextLanguage, layoutId: string): Layout {
  const layout = allLayouts(language).find((candidate) => candidate.id === layoutId);
  assert.ok(layout, `${language}:${layoutId} という組み込み配列が無い（配列が削除・改名された）`);
  return layout;
}

/**
 * fixtureに記録された conditions だけを使って、今の実装で1ケースぶん計算し直す。
 * コード側の DEFAULT_* には一切フォールバックしない
 * （windowSize・sfbHomeCost・preferOppositeThumb・triggerRealizationPolicy・
 * actionRealizationPolicy・chainInterpretation・arpeggioInterpretation・romajiRuleId・
 * geometryShapeId・fingerAssignmentId は全てfixture.conditionsから取る）。
 * src/legacy/results-view.ts の render() と同じ並び
 * （generateTrace → analyzeStrokeStructure → computeMetrics）で呼ぶ。
 *
 * romajiTableは配列定義に静的に焼き込まれたものをそのまま使わない。
 * src/legacy/main.ts の layoutsOf() が毎回 tableForRule(ruleId, ...) で組み直してから
 * 差し替えているのと同じく、ここも recorded romajiRuleId から input層の tableForRule で
 * 組み直す（コーディネーターレビュー指摘: layout.romajiTableの静的値に頼らない）。
 */
function recompute(fixtureCase: FixtureCase) {
  const layout = findLayout(fixtureCase.language, fixtureCase.layoutId);
  const text = sampleText(fixtureCase.language, fixtureCase.sampleId);
  assert.equal(
    sha256(text),
    fixtureCase.textSha256,
    `${fixtureCase.id}: サンプルテキストのハッシュがfixture生成時と違う（テキスト本文か前処理が変わった。数値差分ではない）`,
  );
  assert.equal(
    [...text].length,
    fixtureCase.textLength,
    `${fixtureCase.id}: サンプルテキストの文字数がfixture生成時と違う`,
  );

  const resolvedLayout = fixtureCase.conditions.romajiRuleId !== null
    ? withRomaji(layout, tableForRule(fixtureCase.conditions.romajiRuleId))
    : layout;

  const shapeId = fixtureCase.conditions.geometryShapeId as PresetGeometryKind;
  const fingerAssignment = findFingerAssignment(fixtureCase.conditions.fingerAssignmentId);
  const geometry = buildGeometry(
    PHYSICAL_SHAPES[shapeId],
    assignmentWithHomeKeys(fingerAssignment, layout.homeKeys),
  );
  const options: TracePolicy = {
    windowSize: fixtureCase.conditions.windowSize,
    sfbHomeCost: fixtureCase.conditions.sfbHomeCost,
    preferOppositeThumb: fixtureCase.conditions.preferOppositeThumb,
    triggerRealizationPolicy: fixtureCase.conditions.triggerRealizationPolicy,
    actionRealizationPolicy: fixtureCase.conditions.actionRealizationPolicy,
  };

  const trace = generateTrace(text, resolvedLayout, geometry, options);
  const analysis = analyzeStrokeStructure(
    trace.strokes,
    fixtureCase.conditions.chainInterpretation,
    fixtureCase.conditions.arpeggioInterpretation,
    fixtureCase.conditions.triggerRealizationPolicy,
    fixtureCase.conditions.actionRealizationPolicy,
  );
  const metrics = computeMetrics(trace, geometry, {
    windowSize: options.windowSize,
    sfbHomeCost: options.sfbHomeCost,
    preferOppositeThumb: options.preferOppositeThumb ?? false,
    chainInterpretation: fixtureCase.conditions.chainInterpretation,
    arpeggioInterpretation: fixtureCase.conditions.arpeggioInterpretation,
    triggerRealizationPolicy: fixtureCase.conditions.triggerRealizationPolicy,
    actionRealizationPolicy: fixtureCase.conditions.actionRealizationPolicy,
    romajiRuleId: fixtureCase.conditions.romajiRuleId,
  });

  return { trace, analysis, metrics, geometry, options };
}

function metricsSummary(m: ReturnType<typeof recompute>['metrics']) {
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

function analysisSummary(a: ReturnType<typeof recompute>['analysis']) {
  return {
    strokeCount: a.aggregate.strokeCount,
    arpeggio: a.aggregate.arpeggio,
    roll: a.aggregate.roll,
    directionalTransitions: a.aggregate.directionalTransitions,
    redirect: a.aggregate.redirect,
    sfb: a.aggregate.sfb,
  };
}

test('fixtureのバージョンとケース数が空でない', () => {
  assert.equal(fixture.version, 1);
  assert.ok(fixture.cases.length > 0);
});

for (const fixtureCase of fixture.cases) {
  test(`回帰: ${fixtureCase.id}`, () => {
    const { metrics, analysis } = recompute(fixtureCase);
    assert.deepEqual(
      metricsSummary(metrics),
      fixtureCase.metrics,
      `${fixtureCase.id}: metricsがfixtureと食い違う`,
    );
    assert.deepEqual(
      analysisSummary(analysis),
      fixtureCase.analysis,
      `${fixtureCase.id}: analysis集計がfixtureと食い違う`,
    );
  });

  if (fixtureCase.nSensitivity) {
    test(`回帰(N感度): ${fixtureCase.id}`, async () => {
      const { nSensitivity } = await import('#analyzers/n-sensitivity/sensitivity.ts');
      const layout = findLayout(fixtureCase.language, fixtureCase.layoutId);
      const text = sampleText(fixtureCase.language, fixtureCase.sampleId);
      const resolvedLayout = fixtureCase.conditions.romajiRuleId !== null
        ? withRomaji(layout, tableForRule(fixtureCase.conditions.romajiRuleId))
        : layout;
      const shapeId = fixtureCase.conditions.geometryShapeId as PresetGeometryKind;
      const fingerAssignment = findFingerAssignment(fixtureCase.conditions.fingerAssignmentId);
      const geometry = buildGeometry(
        PHYSICAL_SHAPES[shapeId],
        assignmentWithHomeKeys(fingerAssignment, layout.homeKeys),
      );
      const options: TracePolicy = {
        windowSize: fixtureCase.conditions.windowSize,
        sfbHomeCost: fixtureCase.conditions.sfbHomeCost,
        preferOppositeThumb: fixtureCase.conditions.preferOppositeThumb,
        triggerRealizationPolicy: fixtureCase.conditions.triggerRealizationPolicy,
        actionRealizationPolicy: fixtureCase.conditions.actionRealizationPolicy,
      };
      const points = nSensitivity(
        text,
        resolvedLayout,
        geometry,
        options,
        fixtureCase.nSensitivity!.map((p) => p.windowSize),
        fixtureCase.conditions.romajiRuleId,
        fixtureCase.conditions.chainInterpretation,
        fixtureCase.conditions.arpeggioInterpretation,
      );
      assert.deepEqual(points, fixtureCase.nSensitivity);
    });
  }
}
