import {
  defineSetAnalyzer,
  noRemember,
  type AnalyzerSetMember,
  type AnalyzerSetMemberFailure,
  type SetAnalyzerDefinition,
  type SetAnalyzerExtractContext,
} from '#analyzers/contract.ts';
import { DEFAULT_METRIC_CONDITIONS, type Metrics } from '#interpretation/metrics.ts';
import { analysisTargetKey, LAYOUT_MISSING_REASON, type AnalysisTarget } from '#input/setup/index.ts';
import { ALL_FINGERS, type Finger } from '#input/shapes/geometry.ts';
import type { Trace } from '#trace/generate.ts';
import { computeComparisonRowValues, type ComparisonRowValues } from '../comparison-column-values.ts';
import { ALTERNATE_SCATTER_OPTIONS, DEFAULT_SCATTER_OPTIONS, scatterOptions, type ScatterOptions } from './options.ts';

/**
 * 散布図Analyzerの抽出。
 *
 * 各メンバー（Setup）の比較表の列の値（`computeComparisonRowValues`）と入力文字数を読み出すだけで、
 * 独自の指標・合成スコアは作らない。軸の選び方・等位線は解析設定（`affects: 'view'`）で、抽出結果には含めない。
 * 値は比較表と同じ列なので、全列を持つ。
 */

/** 解決できたメンバー1件の行。 */
export interface ScatterOkRow {
  readonly kind: 'ok';
  readonly targetKey: string;
  readonly values: ComparisonRowValues;
  /** 入力文字数。1文字あたりの列を軸に取った時に、等位線の総数の形への換算に使う。 */
  readonly inputChars: number;
}

/** 解決に失敗したメンバー1件の行。黙って行を消さず、失敗した事実を値として持つ。 */
export interface ScatterFailedRow {
  readonly kind: 'failed';
  readonly targetKey: string;
  readonly failureKind: AnalyzerSetMemberFailure['kind'];
  readonly message: string;
}

export type ScatterRow = ScatterOkRow | ScatterFailedRow;

export interface ScatterExtracted {
  /** 集合の各枠ぶんの行。この配列自体の順序に表示上の意味は無い（ホストが持つ集合の並び順へ`targetKey`で引き直す）。 */
  readonly rows: readonly ScatterRow[];
}

function memberToRow(member: AnalyzerSetMember): ScatterOkRow {
  return {
    kind: 'ok',
    targetKey: analysisTargetKey(member.target),
    values: computeComparisonRowValues(member.metrics, member.trace),
    inputChars: member.trace.inputChars,
  };
}

function failureToRow(failure: AnalyzerSetMemberFailure): ScatterFailedRow {
  return { kind: 'failed', targetKey: analysisTargetKey(failure.target), failureKind: failure.kind, message: failure.message };
}

export function computeScatterExtraction(members: readonly AnalyzerSetMember[], failures: readonly AnalyzerSetMemberFailure[]): ScatterExtracted {
  return { rows: [...members.map(memberToRow), ...failures.map(failureToRow)] };
}

// ---------------------------------------------------------------------------
// 入れ忘れ防止テストの材料
// ---------------------------------------------------------------------------

function fixtureFingerRecord(): Record<Finger, number> {
  return Object.fromEntries(ALL_FINGERS.map((finger) => [finger, 0])) as Record<Finger, number>;
}

function fixtureMetrics(totalUnits: number): Metrics {
  return {
    geometryId: 'row-staggered',
    geometryName: 'Row-staggered',
    fingerAssignmentId: 'default',
    fingerAssignmentName: '既定',
    fingerAssignmentHasMultiFingerKeys: false,
    conditions: DEFAULT_METRIC_CONDITIONS,
    strokes: 3,
    actions: 3,
    presses: 3,
    skipped: 0,
    inputChars: 3,
    perFinger: fixtureFingerRecord(),
    perFingerPresses: fixtureFingerRecord(),
    perFingerPressEvents: fixtureFingerRecord(),
    totalUnits,
    totalMm: totalUnits * 19,
    meanPerStroke: totalUnits / 3,
    perCharUnits: totalUnits / 3,
    perCharSteps: 1,
    perCharPresses: 1,
    perActionPresses: 1,
    perPressUnits: totalUnits / 3,
    rightLeftPerPressRatio: 1,
    singleTapLayerRate: 100,
    singleTapRate: 100,
    singleKeyRate: 100,
    adjacent: [],
    adjacentHomeSpacings: [],
    adjacentDistribution: [],
    sameFinger: 0,
    perFingerSameFinger: fixtureFingerRecord(),
    combos: { definitions: 0, matched: 0, hits: 0 },
    layers: [],
    comboPresses: 0,
    comboKeyCounts: new Map(),
    comboKeyDistance: new Map(),
    keyCounts: new Map(),
    keyDistance: new Map(),
  };
}

const FIXTURE_TRACE: Trace = {
  strokes: [],
  errors: [],
  skipped: 0,
  skippedPositions: [],
  skippedByKind: { kanji: 0, symbol: 0, other: 0 },
  inputChars: 3,
  comboHits: [],
  comboDefinitions: 0,
  layerDefinitions: [],
};

// 散布図はTraceRequesterを使わないので、フィクスチャでは「呼ばれたら気づく」スタブにする。
const UNUSED_REQUEST_TRACE = {
  requestTrace: () => {
    throw new Error('unused');
  },
};

const FIXTURE_TARGET_A: AnalysisTarget = { kind: 'setup', setupId: 'fixture-a' };
const FIXTURE_TARGET_B: AnalysisTarget = { kind: 'setup', setupId: 'fixture-b' };
const FIXTURE_TARGET_MISSING: AnalysisTarget = { kind: 'setup', setupId: 'fixture-missing' };

const FIXTURE_MEMBERS: readonly AnalyzerSetMember[] = [FIXTURE_TARGET_A, FIXTURE_TARGET_B].map((target, index) => ({
  target,
  trace: FIXTURE_TRACE,
  analysis: { chains: [], arpeggios: [] } as unknown as AnalyzerSetMember['analysis'],
  metrics: fixtureMetrics(10 * (index + 1)),
  requestTrace: UNUSED_REQUEST_TRACE,
  remember: noRemember,
}));

const FIXTURE_FAILURES: readonly AnalyzerSetMemberFailure[] = [{ target: FIXTURE_TARGET_MISSING, kind: 'reference', message: LAYOUT_MISSING_REASON }];

/** engine（`engine/cache.ts`の`getSetExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const scatterDefinition: SetAnalyzerDefinition<ScatterOptions, ScatterExtracted> = defineSetAnalyzer({
  id: 'scatter',
  options: scatterOptions,
  extract(context: SetAnalyzerExtractContext<ScatterOptions>): ScatterExtracted {
    return computeScatterExtraction(context.members, context.failures);
  },
  optionsDiscipline: {
    sample: DEFAULT_SCATTER_OPTIONS,
    alternates: ALTERNATE_SCATTER_OPTIONS,
    context: () => ({ members: FIXTURE_MEMBERS, failures: FIXTURE_FAILURES }),
  },
});
