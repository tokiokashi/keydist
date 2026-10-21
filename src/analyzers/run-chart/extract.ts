import {
  defineSetAnalyzer,
  noRemember,
  type AnalyzerSetMember,
  type AnalyzerSetMemberFailure,
  type SetAnalyzerDefinition,
  type SetAnalyzerExtractContext,
} from '#analyzers/contract.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { analysisTargetKey, LAYOUT_MISSING_REASON, type AnalysisTarget } from '#input/setup/index.ts';
import { buildSpanIndex, guideScaleOf, spanSpread, spanTotals, spanValue, type SpanIndex, type SpanMetricId } from '#interpretation/span-metrics.ts';
import { generateTrace, type Trace } from '#trace/generate.ts';
import { ALTERNATE_RUN_CHART_OPTIONS, DEFAULT_RUN_CHART_OPTIONS, runChartOptions, type RunChartOptions } from './options.ts';

/**
 * Run Chartの抽出。
 *
 * 距離モデルは変えない。メンバーのTraceを文字位置の範囲で集計し直すだけにする（`interpretation/span-metrics.ts`）。
 * 点は、1回の入力の選択（同じ `selectionIndex` のステップの組）ごとに1つ。`inputIndex` はローマ字の配列で別の選択どうしが
 * 共有するので、点の単位には使わない。組の中の `kanaEnd` の最大を `e` とし、点の横位置は文字位置 `e`、
 * 値は範囲 `[e − W + 1, e + 1)` の値。テキストの先頭で `W` 文字に満たない所は、ある分の文字で求める。
 * 同じ `e` を持つ組が複数ある時は、`e` ごとに点を1つにまとめる（値は同じ範囲なので同じになる）。
 * 範囲の分母が0（範囲の文字が全部打鍵できなかった文字で、打鍵の指標の分母が0など）の点は値を欠け（`null`）にし、図は線を切る。
 *
 * 文字位置ごとの索引と点の位置は、Traceだけで決まり指標と窓幅によらないので、メンバーに覚えさせて使い回す。
 * 指標と窓幅を変えた時は、索引から点の値だけを求め直す。
 */

export interface RunChartSeriesOk {
  readonly kind: 'ok';
  readonly targetKey: string;
  /** 評価に渡したテキストの文字数（横軸の長さ）。 */
  readonly inputChars: number;
  /** 点の文字位置 `e`（昇順、重複なし）。 */
  readonly positions: readonly number[];
  /** 点の値。割合の指標は割合（0〜1）のまま。範囲の分母が0の点は `null`（欠け）。 */
  readonly values: readonly (number | null)[];
  /** 点の範囲の分母 `D`（文字の指標では文字数、打鍵の指標ではステップ数）。 */
  readonly denominators: readonly number[];
  /** 中心線。テキスト全体の値（`computeTraceScalars` の値と一致する。割合の指標は割合のまま）。 */
  readonly center: number;
  /** 目安線の幅を決める係数 `3·s`。分母 `D` の範囲の目安線は、中心線から上下に `guideScale / √D`。 */
  readonly guideScale: number;
}

export interface RunChartSeriesFailed {
  readonly kind: 'failed';
  readonly targetKey: string;
  readonly failureKind: AnalyzerSetMemberFailure['kind'];
  readonly message: string;
}

export type RunChartSeries = RunChartSeriesOk | RunChartSeriesFailed;

export interface RunChartExtracted {
  /** 指標と窓幅（結果を作った時の値）。 */
  readonly metric: SpanMetricId;
  readonly window: number;
  /** 集合の各枠（配列かSetup）ぶんの系列。並び順に表示上の意味は無い。 */
  readonly series: readonly RunChartSeries[];
}

/**
 * 点の文字位置 `e`。1回の入力の選択ごとに、その組の `kanaEnd` の最大を取り、同じ `e` は1つにまとめて昇順に並べる。
 */
export function pointPositionsOf(trace: Trace): number[] {
  const endBySelection = new Map<number, number>();
  for (const stroke of trace.strokes) {
    const previous = endBySelection.get(stroke.selectionIndex);
    if (previous === undefined || stroke.kanaEnd > previous) endBySelection.set(stroke.selectionIndex, stroke.kanaEnd);
  }
  const ends = new Set<number>();
  for (const end of endBySelection.values()) ends.add(Math.min(Math.max(0, end), Math.max(0, trace.inputChars - 1)));
  return [...ends].sort((a, b) => a - b);
}

interface MemberBasis {
  readonly index: SpanIndex;
  readonly positions: readonly number[];
}

function basisOf(member: AnalyzerSetMember): MemberBasis {
  return member.remember('run-chart:basis', () => ({ index: buildSpanIndex(member.trace), positions: pointPositionsOf(member.trace) }));
}

/** 索引と点の位置から、指標と窓幅に応じた系列を作る。 */
export function seriesFromBasis(targetKey: string, basis: MemberBasis, metric: SpanMetricId, window: number): RunChartSeriesOk {
  const { index, positions } = basis;
  const values: (number | null)[] = [];
  const denominators: number[] = [];
  for (const end of positions) {
    const totals = spanTotals(index, metric, end - window + 1, end + 1);
    values.push(spanValue(totals) ?? null);
    denominators.push(totals.denominator);
  }
  const { center, deviation } = spanSpread(index, metric);
  return { kind: 'ok', targetKey, inputChars: index.inputChars, positions, values, denominators, center, guideScale: guideScaleOf(deviation) };
}

export function computeMemberSeries(member: AnalyzerSetMember, options: RunChartOptions): RunChartSeriesOk {
  return seriesFromBasis(analysisTargetKey(member.target), basisOf(member), options.metric, options.window);
}

function failureToSeries(failure: AnalyzerSetMemberFailure): RunChartSeriesFailed {
  return { kind: 'failed', targetKey: analysisTargetKey(failure.target), failureKind: failure.kind, message: failure.message };
}

export function computeRunChartExtraction(
  members: readonly AnalyzerSetMember[],
  failures: readonly AnalyzerSetMemberFailure[],
  options: RunChartOptions,
): RunChartExtracted {
  return {
    metric: options.metric,
    window: options.window,
    series: [...members.map((member) => computeMemberSeries(member, options)), ...failures.map(failureToSeries)],
  };
}

// ---------------------------------------------------------------------------
// 入れ忘れ防止テストの材料
// ---------------------------------------------------------------------------

/** 窓幅の既定（50）と代替（20）のどちらでも、先頭で窓が満たない点と満たす点が出る長さ。 */
const FIXTURE_TEXT = 'あいうえおかきくけこさしすせそたちつてと'.repeat(5);
const FIXTURE_TARGET: AnalysisTarget = { kind: 'setup', setupId: 'fixture-a' };
const FIXTURE_TARGET_MISSING: AnalysisTarget = { kind: 'setup', setupId: 'fixture-missing' };

function fixtureMembers(): readonly AnalyzerSetMember[] {
  const trace = generateTrace(FIXTURE_TEXT, LAYOUT_BY_ID.get('qwerty')!, buildGeometry('row-staggered'), { windowSize: 3, sfbHomeCost: true });
  return [
    {
      target: FIXTURE_TARGET,
      trace,
      // この抽出が読まない値は材料に含めない
      analysis: undefined as never,
      metrics: undefined as never,
      requestTrace: { requestTrace: () => trace },
      remember: noRemember,
    },
  ];
}

const FIXTURE_FAILURES: readonly AnalyzerSetMemberFailure[] = [{ target: FIXTURE_TARGET_MISSING, kind: 'reference', message: LAYOUT_MISSING_REASON }];

/** engine（`engine/cache.ts` の `getSetExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const runChartDefinition: SetAnalyzerDefinition<RunChartOptions, RunChartExtracted> = defineSetAnalyzer({
  id: 'run-chart',
  options: runChartOptions,
  extract(context: SetAnalyzerExtractContext<RunChartOptions>): RunChartExtracted {
    return computeRunChartExtraction(context.members, context.failures, context.options);
  },
  optionsDiscipline: {
    sample: DEFAULT_RUN_CHART_OPTIONS,
    alternates: ALTERNATE_RUN_CHART_OPTIONS,
    context: () => ({ members: fixtureMembers(), failures: FIXTURE_FAILURES }),
  },
});
