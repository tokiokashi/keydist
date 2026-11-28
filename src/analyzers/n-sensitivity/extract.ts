import {
  defineSetAnalyzer,
  type AnalyzerSetMember,
  type AnalyzerSetMemberFailure,
  type SetAnalyzerDefinition,
  type SetAnalyzerExtractContext,
  type SetAnalyzerWarmup,
} from '#analyzers/contract.ts';
import { ADJACENT_PAIRS, ALL_FINGERS } from '#input/shapes/geometry.ts';
import { adjacentExcessSamples, adjacentMeanStdDev, adjacentPairStats, computeTraceScalars, type Metrics } from '#interpretation/metrics.ts';
import { analysisTargetKey } from '#input/setup/index.ts';
import type { Stroke, Trace } from '#trace/generate.ts';
import {
  DISCIPLINE_TARGET_A,
  disciplineMember,
  disciplineMetrics,
  disciplinePress,
  disciplineSetContext,
  disciplineStroke,
  disciplineTrace,
} from '../set-discipline-material.ts';
import { ALTERNATE_N_SENSITIVITY_OPTIONS, DEFAULT_N_SENSITIVITY_OPTIONS, nSensitivityOptions, type NSensitivityOptions } from './options.ts';
import { N_SENSITIVITY_METRIC_IDS, type NSensitivityMetricId } from './metric-catalog.ts';

/**
 * N感度Analyzerの抽出。
 *
 * 仕様 §11.9。`src/analyzers/n-sensitivity/sensitivity.ts`の`nSensitivity`と同じ範囲
 * （N=0..10）で、`metric-catalog.ts`の一覧の指標をすべて求める。縦軸にどれを描くかは
 * 可視化の側が選ぶので、抽出は指標の選択を知らない。
 *
 * **`computeMetrics`を呼び直さない。** Nごとに生成したTraceから、`computeMetrics`と同じ定義の関数で求める
 * （Geometry・Nは`generateTrace`の時点で既にstrokeへ焼き込まれている）。スカラーは`computeTraceScalars`、
 * 指間平均・指間σは`adjacentExcessSamples`・`adjacentPairStats`・`adjacentMeanStdDev`（比較表と同じ関数）。
 * 指間の指標は6組のホーム間隔が要るが、ホーム間隔は物理配列と指割当だけで決まりNによらないので、
 * メンバーの`Metrics.adjacentHomeSpacings`から受け取る。`AnalyzerSetMember`と`TraceRequester`にGeometryは足さない。
 * 比較表の値から逆算せず、Nごとに超過を求め直すので、そのメンバー自身のNでは比較表とビット一致する。
 *
 * **`totalMm`は持たない。** `totalUnits × (member.metrics.totalMm / member.metrics.totalUnits)`
 * で`pitchMm`を逆算する方法は取れない。`totalMm`は`computeMetrics`側で
 * `totalUnits × geometry.pitchMm`という掛け算1回で計算されるのに対し、逆算は割り算を
 * 挟むため浮動小数点の丸めが往復で一致しない（実測: 1840メンバー条件・20,240点で
 * 約1.5%が旧`nSensitivity()`の`totalMm`とビット一致しなかった。
 * 例: 練習用のかな文（Testerの練習文、1676文字）・colemak-dh配列・row-staggered物理配列・グローバルwindowSize=7・N=0で
 * 新22691.038468072355 vs 旧22691.03846807235）。ビット一致を主張できない値は
 * 出さない方がよい（AGENTS.md「数値は必ず実行して出す」の裏側）。View側も`totalMm`を
 * 表示していないので、`pitchMm`を契約へ足す（`AnalyzerSetMember`にGeometryを持たせる等）
 * ことはせず、Traceだけで求まる値を持つ。
 */

const N_RANGE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export { N_RANGE as N_SENSITIVITY_RANGE };

export type NSensitivityValues = Readonly<Record<NSensitivityMetricId, number>>;

export interface NSensitivityPoint {
  readonly windowSize: number;
  /** このNでの、一覧の指標ごとの生の値。 */
  readonly values: NSensitivityValues;
}

export interface NSensitivitySeriesOk {
  readonly kind: 'ok';
  readonly targetKey: string;
  readonly points: readonly NSensitivityPoint[];
}

export interface NSensitivitySeriesFailed {
  readonly kind: 'failed';
  readonly targetKey: string;
  readonly failureKind: AnalyzerSetMemberFailure['kind'];
  readonly message: string;
}

export type NSensitivitySeries = NSensitivitySeriesOk | NSensitivitySeriesFailed;

export interface NSensitivityExtracted {
  /** 集合の各枠（配列かSetup）ぶんの系列。`rows`の並び順に表示上の意味は無い（`comparison/extract.ts`と同じ理由）。 */
  readonly series: readonly NSensitivitySeries[];
}

/**
 * 各Nの値。Traceだけで求まる指標は`computeTraceScalars`から、指間平均・指間σは、そのNのTraceの
 * 打鍵ごとの指の位置から求めた超過を比較表と同じ関数（`adjacentMeanStdDev`）で平均して取る。
 * ホーム間隔はNによらない定数なので、メンバー自身の`Metrics`が持つ値を使う。
 */
export function valuesOf(trace: Trace, homeSpacings: readonly number[]): NSensitivityValues {
  const scalars = computeTraceScalars(trace);
  const adjacent = adjacentMeanStdDev(adjacentPairStats(adjacentExcessSamples(trace, homeSpacings)));
  const all: Readonly<Record<string, number>> = { ...scalars, adjacentMean: adjacent.mean, adjacentStdDev: adjacent.stdDev };
  return Object.fromEntries(N_SENSITIVITY_METRIC_IDS.map((id) => [id, all[id]!])) as NSensitivityValues;
}

/**
 * メンバー1件の、Nが`windowSize`の時の点。Nごとに求めた値はメンバーに覚えさせる（`AnalyzerSetMember.remember`）。
 * 先に`nSensitivityWarmup`で求めてあれば、Traceを作り直さずに覚えた値を読む。
 */
function pointOf(member: AnalyzerSetMember, windowSize: number): NSensitivityPoint {
  const values = member.remember(`n=${windowSize}`, () => {
    const trace = member.requestTrace.requestTrace({ tracePolicy: { windowSize } });
    return valuesOf(trace, member.metrics.adjacentHomeSpacings);
  });
  return { windowSize, values };
}

/** メンバー1件ぶんの、N=0..10の系列を求める。 */
export function computeMemberSeries(member: AnalyzerSetMember): NSensitivitySeriesOk {
  return { kind: 'ok', targetKey: analysisTargetKey(member.target), points: N_RANGE.map((windowSize) => pointOf(member, windowSize)) };
}

/**
 * 系列をNごとの段に分けて先に求める。1段はTrace 1本の生成と指標の計算で、
 * 抽出全体（配列の数 × 11本）をひと息に計算しないための分け目になる。
 */
export const nSensitivityWarmup: SetAnalyzerWarmup = {
  steps: N_RANGE.length,
  run(member, step) {
    const windowSize = N_RANGE[step];
    if (windowSize !== undefined) pointOf(member, windowSize);
  },
};

function failureToSeries(failure: AnalyzerSetMemberFailure): NSensitivitySeriesFailed {
  return { kind: 'failed', targetKey: analysisTargetKey(failure.target), failureKind: failure.kind, message: failure.message };
}

export function computeNSensitivityExtraction(
  members: readonly AnalyzerSetMember[],
  failures: readonly AnalyzerSetMemberFailure[],
): NSensitivityExtracted {
  return {
    series: [...members.map(computeMemberSeries), ...failures.map(failureToSeries)],
  };
}

// ---------------------------------------------------------------------------
// 入れ忘れ防止テストの材料
// ---------------------------------------------------------------------------

/** N=windowSizeぶんだけstroke数を変えたTraceを返す、テスト用の単純なスタブ。 */
function fixtureTrace(strokeCount: number): Trace {
  return disciplineTrace(
    Array.from({ length: strokeCount }, (_, index) =>
      disciplineStroke(index, [disciplinePress('LI', 'f', 4, 2, 1)], { distance: 1, positions: fixturePositions() }),
    ),
  );
}

function fixturePositions(): Stroke['positions'] {
  return Object.fromEntries(ALL_FINGERS.map((finger, i) => [finger, { x: i, y: 2 }])) as Stroke['positions'];
}

const FIXTURE_MEMBERS: readonly AnalyzerSetMember[] = [
  disciplineMember(DISCIPLINE_TARGET_A, {
    trace: fixtureTrace(4),
    metrics: disciplineMetrics(4, {
      perFinger: {} as Metrics['perFinger'],
      perFingerPresses: {} as Metrics['perFingerPresses'],
      perFingerPressEvents: {} as Metrics['perFingerPressEvents'],
      perFingerSameFinger: {} as Metrics['perFingerSameFinger'],
      adjacentHomeSpacings: ADJACENT_PAIRS.map(() => 1),
    }),
    requestTrace: { requestTrace: (request) => fixtureTrace((request.tracePolicy?.windowSize ?? 3) + 1) },
  }),
];

/**
 * engine（`engine/cache.ts`の`getSetExtraction`）が呼ぶ、Analyzer契約の実体。
 */
export const nSensitivityDefinition: SetAnalyzerDefinition<NSensitivityOptions, NSensitivityExtracted> = defineSetAnalyzer({
  id: 'n-sensitivity',
  options: nSensitivityOptions,
  extract(context: SetAnalyzerExtractContext<NSensitivityOptions>): NSensitivityExtracted {
    return computeNSensitivityExtraction(context.members, context.failures);
  },
  warmup: nSensitivityWarmup,
  optionsDiscipline: {
    sample: DEFAULT_N_SENSITIVITY_OPTIONS,
    alternates: ALTERNATE_N_SENSITIVITY_OPTIONS,
    context: () => disciplineSetContext(FIXTURE_MEMBERS),
  },
});
