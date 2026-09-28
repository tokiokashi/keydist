import {
  defineSetAnalyzer,
  type AnalyzerSetMember,
  type AnalyzerSetMemberFailure,
  type SetAnalyzerDefinition,
  type SetAnalyzerExtractContext,
} from '#analyzers/contract.ts';
import type { Finger, Key } from '#input/shapes/geometry.ts';
import { DEFAULT_METRIC_CONDITIONS, type Metrics } from '#interpretation/metrics.ts';
import { analysisTargetKey, type AnalysisTarget } from '#input/setup/index.ts';
import type { Press, Stroke, StrokeParticipation, Trace } from '#trace/generate.ts';
import {
  ALTERNATE_N_SENSITIVITY_OPTIONS,
  DEFAULT_N_SENSITIVITY_OPTIONS,
  nSensitivityOptions,
  type NSensitivityOptions,
} from './options.ts';

/**
 * N感度Analyzerの抽出（#544 Phase 3「N感度」）。
 *
 * 仕様 §11.9。旧実装（`src/analyzers/n-sensitivity/sensitivity.ts`の`nSensitivity`・
 * `src/legacy/analyzer-metrics-content.tsx`の`AnalyzerSensitivityResults`）と同じ範囲
 * （N=0..10）で`totalUnits`[u]を求める。
 *
 * **`computeMetrics`を呼び直さない。** `totalUnits`は`computeMetrics`の中身を読むと
 * `trace.strokes`の`distance`を単純合計したものそのもの（Geometry・Nは`generateTrace`の
 * 時点で既にstrokeへ焼き込まれている。`interpretation/metrics.ts`の`computeMetrics`参照）で、
 * Metrics固有の他の計算（同指率・指間統計等）はどれもGeometryの実体（`AnalyzerSetMember`には
 * 無い）を要求するがN感度には要らない。この1点により、`AnalyzerSetMember`にGeometry・
 * `computeMetrics`の入力一式を追加で持たせずに済む（契約を膨らませない。
 * #544指示書「小さくきれいな形を選ぶ」）。
 *
 * **`totalMm`は持たない。** 当初`totalUnits × (member.metrics.totalMm / member.metrics.totalUnits)`
 * で`pitchMm`を逆算する案を試したが、`totalMm`は`computeMetrics`側で
 * `totalUnits × geometry.pitchMm`という掛け算1回で計算されるのに対し、逆算は割り算を
 * 挟むため浮動小数点の丸めが往復で一致しない（実測: 1840メンバー条件・20,240点の
 * レビュー計測で約1.5%が旧`nSensitivity()`の`totalMm`とビット一致しなかった。
 * 例: ja.modern配列・colemak-dh形状・row-staggered・グローバルwindowSize=7・N=0で
 * 新22691.038468072355 vs 旧22691.03846807235）。ビット一致を主張できない値は
 * 出さない方がよい（AGENTS.md「数値は必ず実行して出す」の裏側）。View側も`totalMm`を
 * 表示していないので、`pitchMm`を契約へ足す（`AnalyzerSetMember`にGeometryを持たせる等）
 * ことはせず、`totalUnits`だけを持つ。
 */

const N_RANGE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export { N_RANGE as N_SENSITIVITY_RANGE };

export interface NSensitivityPoint {
  readonly windowSize: number;
  readonly totalUnits: number;
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
  /** 集合の各枠（Setup）ぶんの系列。`rows`の並び順に表示上の意味は無い（`comparison/extract.ts`と同じ理由）。 */
  readonly series: readonly NSensitivitySeries[];
}

function totalUnitsOf(trace: Trace): number {
  return trace.strokes.reduce((sum, stroke) => sum + stroke.distance, 0);
}

/** メンバー1件ぶんの、N=0..10の系列を求める。 */
export function computeMemberSeries(member: AnalyzerSetMember): NSensitivitySeriesOk {
  const points = N_RANGE.map((windowSize) => {
    const trace = member.requestTrace.requestTrace({ tracePolicy: { windowSize } });
    const totalUnits = totalUnitsOf(trace);
    return { windowSize, totalUnits };
  });
  return { kind: 'ok', targetKey: analysisTargetKey(member.target), points };
}

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
// 入れ忘れ防止テストの材料（#544レビュー対応B）
// ---------------------------------------------------------------------------

function fixtureKey(id: string, finger: Finger, x: number, y = 2): Key {
  return { id, finger, x, y, row: 2, col: 0 };
}

function fixturePress(finger: Finger, id: string, x: number, y = 2): Press {
  return { finger, keys: [fixtureKey(id, finger, x, y)], target: { x, y }, gap: 1, distance: 1, sfb: false };
}

function fixtureParticipation(p: Press): StrokeParticipation {
  return { hand: p.finger.startsWith('L') ? 'left' : 'right', finger: p.finger, keys: p.keys, roles: ['output'] };
}

function fixtureStroke(index: number, presses: Press[]): Stroke {
  return {
    index,
    char: String(index),
    inputChar: String(index),
    inputIndex: index,
    aggregationGroupId: 'single',
    classifications: [],
    triggerKeys: [],
    pairedTriggerKeys: [],
    participations: presses.map(fixtureParticipation),
    presses,
    distance: presses.reduce((sum, p) => sum + p.distance, 0),
    positions: {} as Stroke['positions'],
  };
}

function fixtureTrace(strokeCount: number): Trace {
  return {
    strokes: Array.from({ length: strokeCount }, (_, index) => fixtureStroke(index, [fixturePress('LI', 'f', 4)])),
    errors: [],
    skipped: 0,
    inputChars: strokeCount,
    comboHits: [],
    comboDefinitions: 0,
    layerDefinitions: [],
  };
}

function fixtureMetrics(totalUnits: number): Metrics {
  return {
    geometryId: 'row-staggered',
    geometryName: 'Row-staggered',
    fingerAssignmentId: 'default',
    fingerAssignmentName: '既定',
    conditions: DEFAULT_METRIC_CONDITIONS,
    strokes: 3,
    actions: 3,
    presses: 3,
    skipped: 0,
    inputChars: 3,
    perFinger: {} as Metrics['perFinger'],
    perFingerPresses: {} as Metrics['perFingerPresses'],
    totalUnits,
    totalMm: totalUnits * 19,
    meanPerStroke: totalUnits / 3,
    perCharUnits: totalUnits / 3,
    perCharSteps: 1,
    perCharPresses: 1,
    singleTapLayerRate: 100,
    singleTapRate: 100,
    singleKeyRate: 100,
    adjacent: [],
    sameFinger: 0,
    combos: { definitions: 0, matched: 0, hits: 0 },
    layers: [],
    comboPresses: 0,
    comboKeyCounts: new Map(),
    comboKeyDistance: new Map(),
    keyCounts: new Map(),
    keyDistance: new Map(),
  };
}

/** N=windowSizeぶんだけstroke数を変えたTraceを返す、テスト用の単純なスタブ。 */
function fixtureRequestTrace(): AnalyzerSetMember['requestTrace'] {
  return {
    requestTrace: (request) => fixtureTrace((request.tracePolicy?.windowSize ?? 3) + 1),
  };
}

const FIXTURE_TARGET_A: AnalysisTarget = { kind: 'setup', setupId: 'fixture-a' };
const FIXTURE_TARGET_MISSING: AnalysisTarget = { kind: 'setup', setupId: 'fixture-missing' };

const FIXTURE_MEMBERS: readonly AnalyzerSetMember[] = [
  {
    target: FIXTURE_TARGET_A,
    trace: fixtureTrace(4),
    analysis: { chains: [], arpeggios: [] } as unknown as AnalyzerSetMember['analysis'],
    metrics: fixtureMetrics(4),
    requestTrace: fixtureRequestTrace(),
  },
];

const FIXTURE_FAILURES: readonly AnalyzerSetMemberFailure[] = [
  { target: FIXTURE_TARGET_MISSING, kind: 'reference', message: '配列「x」が見つからない（削除された可能性）' },
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
  optionsDiscipline: {
    sample: DEFAULT_N_SENSITIVITY_OPTIONS,
    alternates: ALTERNATE_N_SENSITIVITY_OPTIONS,
    extractForTest: () => computeNSensitivityExtraction(FIXTURE_MEMBERS, FIXTURE_FAILURES),
  },
});
