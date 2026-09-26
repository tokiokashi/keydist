import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUTS, LAYOUTS_JA, type Layout } from '#input/layouts/index.ts';
import {
  assignmentWithHomeKeys,
  buildGeometry,
  DEFAULT_FINGER_ASSIGNMENT,
  PHYSICAL_SHAPES,
  type Geometry,
  type PresetGeometryKind,
} from '#input/shapes/geometry.ts';
import {
  DEFAULT_TRACE_POLICY,
  generateTrace,
  type TracePolicy,
} from '#trace/generate.ts';
import {
  analyzeStrokeStructure,
  type AggregatedAnalysisResult,
} from '#interpretation/structure/aggregate.ts';
import { computeMetrics, type Metrics } from '#interpretation/metrics.ts';
import {
  DEFAULT_CHAIN_INTERPRETATION,
  type ChainInterpretation,
} from '#interpretation/structure/chain.ts';
import {
  DEFAULT_ARPEGGIO_INTERPRETATION,
  type ArpeggioInterpretation,
} from '#interpretation/structure/arpeggio.ts';
import {
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  type ActionRealizationPolicy,
  type TriggerRealizationPolicy,
} from '#input/semantics/index.ts';
import { defaultRomajiRuleId } from '#input/romaji/rules.ts';
import { nSensitivity } from '#analyzers/n-sensitivity/sensitivity.ts';
import { sampleText, SAMPLE_TEXTS, type TextLanguage } from '#input/text/samples.ts';

// このスクリプトが再現する経路は src/legacy/results-view.ts の render() 内、
// resolveConditions → generateTrace → analyzeStrokeStructure → computeMetrics の並び
// （Phase 1時点のアプリが実際に画面へ出す数値と同じ呼び出し）。
// 前処理（空白畳み込み）は #input/text/samples.ts の SAMPLE_TEXTS をそのまま使い、
// 正規化ルールをここで再実装しない（AGENTS.md「測る時はアプリと同じ前処理を通す」）。
// この fixture は Phase 5 で src/legacy/ が消えた後も新engineの回帰テストとして生き続けるため、
// generator・fixture・test のいずれも #legacy/* を import しない
// （サンプルテキストの元の置き場が legacy だったので #input/text/samples.ts へ移した）。

const FIXTURE_VERSION = 1;
const OUT_PATH = join(process.cwd(), 'test', 'fixtures', 'analyzer-regression.json');

interface ConditionsSnapshot {
  windowSize: number;
  sfbHomeCost: boolean;
  preferOppositeThumb: boolean;
  geometryShapeId: string;
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
   * この数値を出したPhase 1時点の実装のcommit。
   * Epic #544 の完了条件（旧実装と同じ数値が出ることの確認）の起点として記録する。
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

function runCase(
  language: TextLanguage,
  layout: Layout,
  sampleId: string,
  opts: RunOptions = {},
): FixtureCase {
  const text = sampleText(language, sampleId);
  const shapeId = opts.shapeId ?? 'row-staggered';
  const geometry: Geometry = buildGeometry(
    PHYSICAL_SHAPES[shapeId],
    assignmentWithHomeKeys(DEFAULT_FINGER_ASSIGNMENT, layout.homeKeys),
  );
  const triggerRealizationPolicy = opts.triggerRealizationPolicy
    ?? { ...DEFAULT_TRIGGER_REALIZATION_POLICY };
  const actionRealizationPolicy = opts.actionRealizationPolicy
    ?? { ...DEFAULT_ACTION_REALIZATION_POLICY };
  const chainInterpretation = opts.chainInterpretation ?? { ...DEFAULT_CHAIN_INTERPRETATION };
  const arpeggioInterpretation = opts.arpeggioInterpretation ?? { ...DEFAULT_ARPEGGIO_INTERPRETATION };
  const options: TracePolicy = {
    ...DEFAULT_TRACE_POLICY,
    windowSize: opts.windowSize ?? DEFAULT_TRACE_POLICY.windowSize,
    sfbHomeCost: opts.sfbHomeCost ?? DEFAULT_TRACE_POLICY.sfbHomeCost,
    preferOppositeThumb: opts.preferOppositeThumb ?? DEFAULT_TRACE_POLICY.preferOppositeThumb,
    triggerRealizationPolicy,
    actionRealizationPolicy,
  };
  const romajiRuleId = layout.romajiTable ? defaultRomajiRuleId(layout.id) : null;

  const trace = generateTrace(text, layout, geometry, options);
  const analysis = analyzeStrokeStructure(
    trace.strokes,
    chainInterpretation,
    arpeggioInterpretation,
    triggerRealizationPolicy,
    actionRealizationPolicy,
  );
  const metrics = computeMetrics(trace, geometry, {
    windowSize: options.windowSize,
    sfbHomeCost: options.sfbHomeCost,
    preferOppositeThumb: options.preferOppositeThumb ?? false,
    chainInterpretation,
    arpeggioInterpretation,
    triggerRealizationPolicy,
    actionRealizationPolicy,
    romajiRuleId,
  });

  return {
    id: `${language}:${layout.id}:${sampleId}${opts.note ? `:${opts.note}` : ''}`,
    note: opts.note,
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
        nSensitivity: nSensitivity(
          text,
          layout,
          geometry,
          options,
          [1, 2, 3, 5, 7],
          romajiRuleId,
          chainInterpretation,
          arpeggioInterpretation,
        ),
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
  //    src/legacy/results-view.ts の既定経路（配列別override無し）をそのまま再現する。
  for (const layout of LAYOUTS) {
    for (const sampleId of Object.keys(SAMPLE_TEXTS.en)) {
      cases.push(runCase('en', layout, sampleId, {
        // 窓幅Nの感度は安いので、代表として最初のEN配列にだけ添える
        withNSensitivity: layout.id === LAYOUTS[0]!.id,
      }));
    }
  }
  for (const layout of LAYOUTS_JA) {
    for (const sampleId of Object.keys(SAMPLE_TEXTS.ja)) {
      cases.push(runCase('ja', layout, sampleId, {
        withNSensitivity: layout.id === 'naginata-v18' && sampleId === 'modern',
      }));
    }
  }

  // 2. 既定値が踏まない分岐を突く非既定ケース（少数・理由付き）。
  const naginata = byId(LAYOUTS_JA, 'naginata-v18'); // 親指シフトの交代打鍵とhold-capable triggerを持つ
  const qwertyEn = byId(LAYOUTS, 'qwerty');
  const oonishiCombo = byId(LAYOUTS_JA, 'oonishi-custom-combo'); // コンボを持つ数少ない組み込み配列
  const asuka = byId(LAYOUTS_JA, 'asuka'); // hold-capable trigger + 親指シフトを持つ

  cases.push(runCase('ja', naginata, 'modern', {
    windowSize: 1,
    note: 'windowSize=1（既定3より狭い先読み。同指連続の判定が変わる分岐）',
  }));
  cases.push(runCase('ja', naginata, 'modern', {
    windowSize: 6,
    note: 'windowSize=6（既定3より広い先読み）',
  }));
  cases.push(runCase('en', qwertyEn, 'default', {
    shapeId: 'ortholinear',
    note: '物理形状=ortholinear（既定row-staggeredと段差モデルが違う分岐）',
  }));
  cases.push(runCase('ja', naginata, 'modern', {
    preferOppositeThumb: true,
    note: 'preferOppositeThumb=true（親指シフトを出力キーと反対側の親指へ振り替えるSandS分岐。naginataは交代打鍵を使うので効果が出る）',
  }));
  cases.push(runCase('ja', naginata, 'modern', {
    triggerRealizationPolicy: { useHold: true },
    note: 'triggerRealizationPolicy.useHold=true（hold-capable triggerを連続保持として実現する分岐）',
  }));
  cases.push(runCase('ja', oonishiCombo, 'modern', {
    actionRealizationPolicy: {
      triggerActivation: 'semantic',
      triggerActivationClassOverrides: {},
      triggerActivationOverrides: [],
    },
    note: 'triggerActivation=semantic（コンボを持つ配列でtrigger activationのgroupingが変わる分岐）',
  }));
  cases.push(runCase('ja', asuka, 'modern', {
    chainInterpretation: { ...DEFAULT_CHAIN_INTERPRETATION, breakOnSameFinger: false },
    note: 'chainInterpretation.breakOnSameFinger=false（Analysis Chainの区切り方が変わる分岐）',
  }));
  cases.push(runCase('ja', asuka, 'modern', {
    arpeggioInterpretation: { ...DEFAULT_ARPEGGIO_INTERPRETATION, includeThumb: true },
    note: 'arpeggioInterpretation.includeThumb=true（ArpeggioSpanに親指を含める分岐）',
  }));

  cases.sort((a, b) => a.id.localeCompare(b.id));

  return {
    version: FIXTURE_VERSION,
    sourceCommit: sourceCommit(),
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

function stableStringify(value: unknown): string {
  // JSON.stringifyのkey順はオブジェクト生成順に依存するため、diffを安定させるために
  // key順をソートしてから書き出す（配列の順序はcases.sort()で決めている）。
  const sortKeys = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sortKeys);
    if (input !== null && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, val]) => [key, sortKeys(val)]),
      );
    }
    return input;
  };
  return JSON.stringify(sortKeys(value), null, 2);
}

function main(): void {
  const fixture = generate();
  writeFileSync(OUT_PATH, `${stableStringify(fixture)}\n`, 'utf8');
  // eslint系の設定は無いので素朴にconsoleへ出す。CIログで生成規模が見えるようにする。
  console.log(`wrote ${fixture.cases.length} cases to ${OUT_PATH}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
