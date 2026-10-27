import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUTS, LAYOUTS_JA, withRomaji, type Layout } from '#input/layouts/index.ts';
import {
  assignmentWithHomeKeys,
  buildGeometry,
  DEFAULT_FINGER_ASSIGNMENT,
  JIS_FINGER_ASSIGNMENT,
  QWERTY_OPTIMIZED_FINGER_ASSIGNMENT,
  PHYSICAL_SHAPES,
  presetGeometryStandard,
  type FingerAssignment,
  type Geometry,
  type PresetGeometryKind,
} from '#input/shapes/geometry.ts';
import { DEFAULT_TRACE_POLICY, generateTrace, type TracePolicy } from '#trace/generate.ts';
import { analyzeStrokeStructure, type AggregatedAnalysisResult } from '#interpretation/structure/aggregate.ts';
import { computeMetrics, type Metrics } from '#interpretation/metrics.ts';
import { DEFAULT_CHAIN_INTERPRETATION, type ChainInterpretation } from '#interpretation/structure/chain.ts';
import { DEFAULT_ARPEGGIO_INTERPRETATION, type ArpeggioInterpretation } from '#interpretation/structure/arpeggio.ts';
import {
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  type ActionRealizationPolicy,
  type TriggerRealizationPolicy,
} from '#input/semantics/index.ts';
import { physicalKeysUsedByLayout } from '#input/layouts/physical-keys.ts';
import { jisShapeIdFor } from '#input/shapes/jis-shape.ts';
import { defaultRomajiRuleId, tableForRule } from '#input/romaji/rules.ts';
import { nSensitivity } from '#analyzers/n-sensitivity/sensitivity.ts';
import { recommendedFingerAssignmentId, resolveFingerAssignment } from '#engine/finger-assignment.ts';
import { MODEL_VERSION } from '#engine/model-version.ts';
import { modelVersionBumpError, stableStringify } from './model-version-guard.ts';
import { containsKanji } from '#input/text/reading.ts';
import { sampleText, SAMPLE_TEXTS, type TextLanguage } from '#input/text/samples.ts';

// このスクリプトが再現する経路は、条件の決定 → generateTrace → analyzeStrokeStructure → computeMetrics の並び
// （配列ごとの上書きが無い既定の条件で、画面に出す数値と同じ呼び出し）。
// 前処理（空白畳み込み）は #input/text/samples.ts の SAMPLE_TEXTS をそのまま使い、
// 正規化ルールをここで再実装しない（AGENTS.md「測る時はアプリと同じ前処理を通す」）。
// generator・fixture・test のいずれも #app/* を import しない
// （サンプルテキストは #input/text/samples.ts から読む）。

const FIXTURE_VERSION = 1;
const OUT_PATH = join(process.cwd(), 'test', 'fixtures', 'analyzer-regression.json');

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

interface MetricsSummary {
  geometryId: string;
  geometryName: string;
  fingerAssignmentId: string;
  fingerAssignmentName: string;
  strokes: number;
  actions: number;
  presses: number;
  skipped: number;
  inputChars: number;
  perFinger: Record<string, number>;
  perFingerPresses: Record<string, number>;
  totalUnits: number;
  totalMm: number;
  meanPerStroke: number;
  perCharUnits: number;
  perCharSteps: number;
  perCharPresses: number;
  singleTapLayerRate: number;
  singleTapRate: number;
  singleKeyRate: number;
  sameFinger: number;
  adjacent: Metrics['adjacent'];
  combos: Metrics['combos'];
  comboPresses: number;
  layers: { id: string; label: string; presses: number }[];
}

interface AnalysisSummary {
  strokeCount: number;
  arpeggio: AggregatedAnalysisResult['aggregate']['arpeggio'];
  roll: AggregatedAnalysisResult['aggregate']['roll'];
  directionalTransitions: AggregatedAnalysisResult['aggregate']['directionalTransitions'];
  redirect: AggregatedAnalysisResult['aggregate']['redirect'];
  sfb: AggregatedAnalysisResult['aggregate']['sfb'];
}

interface FixtureCase {
  /** ケースの識別子。テスト側の突き合わせキー */
  id: string;
  /** このケースが何の分岐を確かめるためにあるか（既定値からの差分があれば書く） */
  note?: string;
  language: TextLanguage;
  layoutId: string;
  sampleId: string;
  textLength: number;
  /**
   * 前処理後テキストのsha256。サンプル本文や空白畳み込みが変わるとここが先に動くので、
   * テストがまずこれを検査すれば「テキストが変わった」と「数値が変わった」を区別できる。
   */
  textSha256: string;
  conditions: ConditionsSnapshot;
  metrics: MetricsSummary;
  analysis: AnalysisSummary;
  /** 安いので既定条件のケースにだけ添える窓幅Nの感度（仕様 §11.9） */
  nSensitivity?: { windowSize: number; totalUnits: number; totalMm: number }[];
}

interface Fixture {
  version: typeof FIXTURE_VERSION;
  /**
   * この数値を出した時の `MODEL_VERSION`。テストが今の値との一致を検査し、
   * 生成時は数値が動いたのにこの値が今の版のままなら書き出しを拒む。
   */
  modelVersion: number;
  /**
   * この数値を出した旧実装のcommit。
   * 旧実装と同じ数値が出ることの確認の起点として記録する。
   * `git`が使えない環境で生成した場合は省く（テストは比較に使わない）。
   */
  sourceCommit?: string;
  cases: FixtureCase[];
}

function metricsSummary(m: Metrics): MetricsSummary {
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
    // key/distance別のMapは配列数×キー数で膨らみやすいので、fixtureには持たせない
    // （層ごとの押下数だけ残す。要求4「fixtureサイズを500KB程度に収める」対応）。
    layers: m.layers.map((layer) => ({ id: layer.id, label: layer.label, presses: layer.presses })),
  };
}

function analysisSummary(a: AggregatedAnalysisResult): AnalysisSummary {
  return {
    strokeCount: a.aggregate.strokeCount,
    arpeggio: a.aggregate.arpeggio,
    roll: a.aggregate.roll,
    directionalTransitions: a.aggregate.directionalTransitions,
    redirect: a.aggregate.redirect,
    sfb: a.aggregate.sfb,
  };
}

interface RunOptions {
  windowSize?: number;
  sfbHomeCost?: boolean;
  preferOppositeThumb?: boolean;
  shapeId?: PresetGeometryKind;
  fingerAssignment?: FingerAssignment;
  chainInterpretation?: ChainInterpretation;
  arpeggioInterpretation?: ArpeggioInterpretation;
  triggerRealizationPolicy?: TriggerRealizationPolicy;
  actionRealizationPolicy?: ActionRealizationPolicy;
  note?: string;
  withNSensitivity?: boolean;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function runCase(language: TextLanguage, layout: Layout, sampleId: string, opts: RunOptions = {}): FixtureCase {
  const text = sampleText(language, sampleId);
  // JISの物理配列が要る配列（JISかな配列）は、アプリと同じく、選んだ物理配列（既定のrow-staggered）と同じ形のJISの物理配列で測る
  const baseShapeId = opts.shapeId ?? 'row-staggered';
  const shapeId =
    layout.requiresJisShape === true
      ? (jisShapeIdFor(PHYSICAL_SHAPES[baseShapeId], physicalKeysUsedByLayout(layout)) as PresetGeometryKind)
      : baseShapeId;
  // 推奨の指の割り当てを持つ配列は、アプリと同じく推奨で測る（物理配列の規格に合わせる）。
  // 持たない配列は、物理配列の規格の既定（JISならjis-default、ANSIなら列固定の既定）
  const jisShape = presetGeometryStandard(shapeId) === 'jis';
  const recommendedId = recommendedFingerAssignmentId(layout, PHYSICAL_SHAPES[shapeId]);
  const recommended = recommendedId === undefined ? undefined : resolveFingerAssignment(recommendedId).assignment;
  const fingerAssignment = opts.fingerAssignment ?? recommended ?? (jisShape ? JIS_FINGER_ASSIGNMENT : DEFAULT_FINGER_ASSIGNMENT);
  const geometry: Geometry = buildGeometry(PHYSICAL_SHAPES[shapeId], assignmentWithHomeKeys(fingerAssignment, layout.homeKeys));
  const triggerRealizationPolicy = opts.triggerRealizationPolicy ?? { ...DEFAULT_TRIGGER_REALIZATION_POLICY };
  const actionRealizationPolicy = opts.actionRealizationPolicy ?? { ...DEFAULT_ACTION_REALIZATION_POLICY };
  const chainInterpretation = opts.chainInterpretation ?? { ...DEFAULT_CHAIN_INTERPRETATION };
  const arpeggioInterpretation = opts.arpeggioInterpretation ?? { ...DEFAULT_ARPEGGIO_INTERPRETATION };
  const options: TracePolicy = {
    ...DEFAULT_TRACE_POLICY,
    windowSize: opts.windowSize ?? DEFAULT_TRACE_POLICY.windowSize,
    sfbHomeCost: opts.sfbHomeCost ?? DEFAULT_TRACE_POLICY.sfbHomeCost,
    preferOppositeThumb: opts.preferOppositeThumb ?? DEFAULT_TRACE_POLICY.preferOppositeThumb ?? false,
    triggerRealizationPolicy,
    actionRealizationPolicy,
  };
  const romajiRuleId = layout.romajiTable ? defaultRomajiRuleId(layout.id) : null;
  // romajiTableを持つ配列は、毎回 tableForRule(ruleId, ...) で表を組み直してから差し替える
  // （静的に焼き込まれたテーブルをそのまま使わない）。input層の関数だけでこの経路を再現する。
  const resolvedLayout = romajiRuleId !== null ? withRomaji(layout, tableForRule(romajiRuleId)) : layout;

  const trace = generateTrace(text, resolvedLayout, geometry, options);
  const analysis = analyzeStrokeStructure(trace.strokes, chainInterpretation, arpeggioInterpretation, triggerRealizationPolicy, actionRealizationPolicy);
  const metrics = computeMetrics(trace, geometry, {
    windowSize: options.windowSize,
    sfbHomeCost: options.sfbHomeCost,
    preferOppositeThumb: options.preferOppositeThumb ?? false,
    chainInterpretation,
    arpeggioInterpretation,
    triggerRealizationPolicy,
    actionRealizationPolicy,
    romajiRuleId,
    // サンプルテキストは記号を含まず、回帰テストも記号を残さずに計算するので false で一致する
    keepSymbols: false,
    reading: null,
  });

  return {
    id: `${language}:${layout.id}:${sampleId}${opts.note ? `:${opts.note}` : ''}`,
    ...(opts.note !== undefined ? { note: opts.note } : {}),
    language,
    layoutId: layout.id,
    sampleId,
    textLength: [...text].length,
    textSha256: sha256(text),
    conditions: {
      windowSize: options.windowSize,
      sfbHomeCost: options.sfbHomeCost,
      preferOppositeThumb: options.preferOppositeThumb ?? false,
      geometryShapeId: shapeId,
      fingerAssignmentId: fingerAssignment.id,
      chainInterpretation,
      arpeggioInterpretation,
      triggerRealizationPolicy,
      actionRealizationPolicy,
      romajiRuleId,
    },
    metrics: metricsSummary(metrics),
    analysis: analysisSummary(analysis),
    ...(opts.withNSensitivity
      ? {
          // 画面側は、romaji表を差し替えた後のlayoutを渡す。ここも同じくresolvedLayoutを渡す。
          nSensitivity: nSensitivity(text, resolvedLayout, geometry, options, [1, 2, 3, 5, 7], romajiRuleId, chainInterpretation, arpeggioInterpretation),
        }
      : {}),
  };
}

function byId(layouts: readonly Layout[], id: string): Layout {
  const found = layouts.find((layout) => layout.id === id);
  if (!found) throw new Error(`layout not found: ${id}`);
  return found;
}

function generate(): Fixture {
  const cases: FixtureCase[] = [];

  // 1. 既定条件 × 組み込み配列全部 × 適用可能なサンプル全部。
  //    配列別の上書きが無い既定の経路をそのまま再現する。
  for (const layout of LAYOUTS) {
    for (const sampleId of Object.keys(SAMPLE_TEXTS.en)) {
      cases.push(
        runCase('en', layout, sampleId, {
          // 窓幅Nの感度は安いので、代表として最初のEN配列にだけ添える
          withNSensitivity: layout.id === LAYOUTS[0]!.id,
        }),
      );
    }
  }
  // 漢字を含むサンプルは、読みに直す段（辞書が要る）を通してから評価するので、この記録には入れない
  const kanaSampleIds = Object.keys(SAMPLE_TEXTS.ja).filter((sampleId) => !containsKanji(sampleText('ja', sampleId)));
  for (const layout of LAYOUTS_JA) {
    for (const sampleId of kanaSampleIds) {
      cases.push(
        runCase('ja', layout, sampleId, {
          withNSensitivity: layout.id === 'naginata-v18' && sampleId === 'modern',
        }),
      );
    }
  }

  // 2. 既定値が踏まない分岐を突く非既定ケース（少数・理由付き）。
  const naginata = byId(LAYOUTS_JA, 'naginata-v18'); // 親指シフトの交代打鍵とhold-capable triggerを持つ
  const qwertyEn = byId(LAYOUTS, 'qwerty');
  const oonishiCombo = byId(LAYOUTS_JA, 'oonishi-custom'); // コンボを持つ数少ない組み込み配列（TK音直入力法の日本語側）
  const asuka = byId(LAYOUTS_JA, 'asuka'); // hold-capable trigger + 親指シフトを持つ

  cases.push(
    runCase('ja', naginata, 'modern', {
      windowSize: 1,
      note: 'windowSize=1（既定3より狭い先読み。同指連続の判定が変わる分岐）',
    }),
  );
  cases.push(
    runCase('ja', naginata, 'modern', {
      windowSize: 6,
      note: 'windowSize=6（既定3より広い先読み）',
    }),
  );
  cases.push(
    runCase('en', qwertyEn, 'default', {
      shapeId: 'ortholinear',
      note: '物理配列=ortholinear（既定row-staggeredと段差モデルが違う分岐）',
    }),
  );
  cases.push(
    runCase('ja', naginata, 'modern', {
      preferOppositeThumb: true,
      note: 'preferOppositeThumb=true（親指シフトを出力キーと反対側の親指へ振り替えるSandS分岐。naginataは交代打鍵を使うので効果が出る）',
    }),
  );
  cases.push(
    runCase('ja', naginata, 'modern', {
      triggerRealizationPolicy: { useHold: true },
      note: 'triggerRealizationPolicy.useHold=true（hold-capable triggerを連続保持として実現する分岐）',
    }),
  );
  cases.push(
    runCase('ja', oonishiCombo, 'modern', {
      actionRealizationPolicy: {
        triggerActivation: 'semantic',
        triggerActivationClassOverrides: {},
        triggerActivationOverrides: [],
      },
      note: 'triggerActivation=semantic（コンボを持つ配列でtrigger activationのgroupingが変わる分岐）',
    }),
  );
  cases.push(
    runCase('ja', asuka, 'modern', {
      chainInterpretation: { ...DEFAULT_CHAIN_INTERPRETATION, breakOnSameFinger: false },
      note: 'chainInterpretation.breakOnSameFinger=false（Analysis Chainの区切り方が変わる分岐）',
    }),
  );
  cases.push(
    runCase('ja', asuka, 'modern', {
      arpeggioInterpretation: { ...DEFAULT_ARPEGGIO_INTERPRETATION, includeThumb: true },
      note: 'arpeggioInterpretation.includeThumb=true（ArpeggioSpanに親指を含める分岐）',
    }),
  );
  cases.push(
    runCase('en', qwertyEn, 'default', {
      fingerAssignment: JIS_FINGER_ASSIGNMENT,
      note: 'fingerAssignment=jis-default（既定の列固定割り当てと違う指割り当て。同指連続の判定が変わる分岐）',
    }),
  );

  // 分割する物理配列では、反対側の手の指を担当に持つ割り当てでも、その指を選ばない（仕様 §9.1）
  const qwertyJa = byId(LAYOUTS_JA, 'qwerty');
  for (const shapeId of ['split-ortholinear', 'column-staggered'] as const) {
    cases.push(
      runCase('ja', qwertyJa, 'modern', {
        shapeId,
        fingerAssignment: QWERTY_OPTIMIZED_FINGER_ASSIGNMENT,
        note: `物理配列=${shapeId}・fingerAssignment=qwerty-optimized（分割する物理配列で反対側の手の追加の担当を候補から外す分岐）`,
      }),
    );
  }

  cases.sort((a, b) => a.id.localeCompare(b.id));

  const commit = sourceCommit();
  return {
    version: FIXTURE_VERSION,
    modelVersion: MODEL_VERSION,
    ...(commit !== undefined ? { sourceCommit: commit } : {}),
    cases,
  };
}

/** 生成時のHEADコミット。`git`が使えない環境ではfixtureの再現性に関わらないため省く。 */
function sourceCommit(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

function main(): void {
  const fixture = generate();
  if (existsSync(OUT_PATH)) {
    const error = modelVersionBumpError(JSON.parse(readFileSync(OUT_PATH, 'utf8')), fixture);
    if (error !== null) {
      console.error(error);
      process.exitCode = 1;
      return;
    }
  }
  writeFileSync(OUT_PATH, `${stableStringify(fixture)}\n`, 'utf8');
  // eslint系の設定は無いので素朴にconsoleへ出す。CIログで生成規模が見えるようにする。
  console.log(`wrote ${fixture.cases.length} cases to ${OUT_PATH}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
