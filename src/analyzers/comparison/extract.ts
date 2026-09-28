import {
  defineSetAnalyzer,
  type AnalyzerSetMember,
  type AnalyzerSetMemberFailure,
  type SetAnalyzerDefinition,
  type SetAnalyzerExtractContext,
} from '#analyzers/contract.ts';
import { DEFAULT_METRIC_CONDITIONS, type Metrics } from '#interpretation/metrics.ts';
import { analysisTargetKey, type AnalysisTarget } from '#input/setup/index.ts';
import type { Finger, Key } from '#input/shapes/geometry.ts';
import type { Press, Stroke, StrokeParticipation, Trace } from '#trace/generate.ts';
import {
  ALTERNATE_COMPARISON_OPTIONS,
  COMPARISON_COLUMN_IDS,
  DEFAULT_COMPARISON_OPTIONS,
  comparisonOptions,
  type ComparisonColumnId,
  type ComparisonOptions,
} from './options.ts';

/**
 * 比較表Analyzerの抽出（#544 Phase 3「集合を対象にする最初のAnalyzer（比較表）」）。
 *
 * 集合対象（`SetAnalyzerDefinition`）の最初の実例。各メンバー（Setup）の`Metrics`から
 * 旧実装（`src/legacy/analyzer-metrics-content.tsx`の`compareMetricValues`）と同じ
 * 13列を機械的に読み出すだけで、独自の合成指標・優劣判定は行わない（AGENTS.md
 * 「優劣の判定・順位付け・合成スコアを作らない」）。基準（baseline）との比較・
 * 列の表示/非表示は解析設定（`affects: 'view'`）で、抽出結果には含めない
 * （`options.ts`のコメント参照）。
 */

/** 1行（1 Setup）ぶんの、13列の生値。 */
export type ComparisonRowValues = Readonly<Record<ComparisonColumnId, number>>;

/** 解決できたメンバー1件の行。 */
export interface ComparisonOkRow {
  readonly kind: 'ok';
  readonly targetKey: string;
  readonly values: ComparisonRowValues;
}

/**
 * 解決に失敗したメンバー1件の行（#544指示書「Setup削除時の表示」・「部分失敗」）。
 * 黙って行を消さず、失敗した事実を値として持つ（ホスト側がこれを見て
 * 「削除された」等の表示に変換する。`kind`/`message`は`AnalyzerSetMemberFailure`
 * （`engine/cache.ts`の`getSetExtraction`が組み立てる）をそのまま運ぶ）。
 */
export interface ComparisonFailedRow {
  readonly kind: 'failed';
  readonly targetKey: string;
  readonly failureKind: AnalyzerSetMemberFailure['kind'];
  readonly message: string;
}

export type ComparisonRow = ComparisonOkRow | ComparisonFailedRow;

export interface ComparisonExtracted {
  /**
   * 集合の各枠（配列かSetup）ぶんの行。**この配列自体の順序に表示上の意味は無い**
   * （engineの抽出キーが順序込みで畳み込む対象は「集合そのものの並び順」であって、
   * `rows`の列挙順ではない）。ホスト側（`hosts/standalone`のComparison単体ページ）は
   * `targetKey`をキーに、自分が持つ集合の並び順へ引き直してから描画する
   * （集合の並び順＝ページ自身の資産。`extract.ts`はSetupのラベル・並び順を
   * 一切知らない、抽出の純粋さのため）。
   */
  readonly rows: readonly ComparisonRow[];
}

/** `Metrics`から13列を読み出す純関数。`options.ts`のコメント参照。 */
export function computeComparisonRowValues(metrics: Metrics): ComparisonRowValues {
  const adjacentCount = metrics.adjacent.length || 1;
  const adjacentMean = metrics.adjacent.reduce((sum, item) => sum + item.meanExcess, 0) / adjacentCount;
  const adjacentStdDev = metrics.adjacent.reduce((sum, item) => sum + item.stdDev, 0) / adjacentCount;
  return {
    actions: metrics.actions,
    totalUnits: metrics.totalUnits,
    meanPerStroke: metrics.meanPerStroke,
    perCharUnits: metrics.perCharUnits,
    perCharSteps: metrics.perCharSteps,
    perCharPresses: metrics.perCharPresses,
    singleTapLayerRate: metrics.singleTapLayerRate,
    singleTapRate: metrics.singleTapRate,
    singleKeyRate: metrics.singleKeyRate,
    sameFinger: metrics.sameFinger,
    sameFingerRate: (metrics.sameFinger / Math.max(1, metrics.strokes)) * 100,
    adjacentMean,
    adjacentStdDev,
  };
}

function memberToRow(member: AnalyzerSetMember): ComparisonOkRow {
  return { kind: 'ok', targetKey: analysisTargetKey(member.target), values: computeComparisonRowValues(member.metrics) };
}

function failureToRow(failure: AnalyzerSetMemberFailure): ComparisonFailedRow {
  return { kind: 'failed', targetKey: analysisTargetKey(failure.target), failureKind: failure.kind, message: failure.message };
}

export function computeComparisonExtraction(
  members: readonly AnalyzerSetMember[],
  failures: readonly AnalyzerSetMemberFailure[],
): ComparisonExtracted {
  return {
    rows: [...members.map(memberToRow), ...failures.map(failureToRow)],
  };
}

// ---------------------------------------------------------------------------
// 入れ忘れ防止テストの材料（#544レビュー対応B）
// ---------------------------------------------------------------------------

function fixtureKey(id: string, finger: Finger, x: number, y = 2): Key {
  return { id, finger, x, y, row: 2, col: 0 };
}

function fixturePress(finger: Finger, id: string, x: number, y = 2): Press {
  return { finger, keys: [fixtureKey(id, finger, x, y)], target: { x, y }, gap: 1, distance: 0, sfb: false };
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
    distance: 0,
    positions: {} as Stroke['positions'],
  };
}

const FIXTURE_TRACE: Trace = {
  strokes: [
    fixtureStroke(0, [fixturePress('LI', 'f', 4)]),
    fixtureStroke(1, [fixturePress('LM', 'd', 3)]),
    fixtureStroke(2, [fixturePress('RI', 'j', 7)]),
  ],
  errors: [],
  skipped: 0,
  inputChars: 3,
  comboHits: [],
  comboDefinitions: 0,
  layerDefinitions: [],
};

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

// 比較表はTraceRequesterを使わないので、フィクスチャでは「呼ばれたら気づく」スタブにする。
const UNUSED_REQUEST_TRACE = { requestTrace: () => { throw new Error('unused'); } };

const FIXTURE_TARGET_A: AnalysisTarget = { kind: 'setup', setupId: 'fixture-a' };
const FIXTURE_TARGET_B: AnalysisTarget = { kind: 'setup', setupId: 'fixture-b' };
const FIXTURE_TARGET_MISSING: AnalysisTarget = { kind: 'setup', setupId: 'fixture-missing' };

const FIXTURE_MEMBERS: readonly AnalyzerSetMember[] = [
  {
    target: FIXTURE_TARGET_A,
    trace: FIXTURE_TRACE,
    analysis: { chains: [], arpeggios: [] } as unknown as AnalyzerSetMember['analysis'],
    metrics: fixtureMetrics(10),
    requestTrace: UNUSED_REQUEST_TRACE,
  },
  {
    target: FIXTURE_TARGET_B,
    trace: FIXTURE_TRACE,
    analysis: { chains: [], arpeggios: [] } as unknown as AnalyzerSetMember['analysis'],
    metrics: fixtureMetrics(20),
    requestTrace: UNUSED_REQUEST_TRACE,
  },
];

const FIXTURE_FAILURES: readonly AnalyzerSetMemberFailure[] = [
  { target: FIXTURE_TARGET_MISSING, kind: 'reference', message: '配列が見つからない（削除された可能性がある）' },
];

/**
 * engine（`engine/cache.ts`の`getSetExtraction`）が呼ぶ、Analyzer契約の実体。
 * `defineSetAnalyzer`（#544 Phase 3で`analyzers/contract.ts`へ足した集合対象版）で
 * 組み立てる。`optionsDiscipline`は集合対象でも単一対象と同じく必須（`defineSetAnalyzer`
 * の必須configフィールド）。
 */
export const comparisonDefinition: SetAnalyzerDefinition<ComparisonOptions, ComparisonExtracted> = defineSetAnalyzer({
  id: 'comparison',
  options: comparisonOptions,
  extract(context: SetAnalyzerExtractContext<ComparisonOptions>): ComparisonExtracted {
    return computeComparisonExtraction(context.members, context.failures);
  },
  optionsDiscipline: {
    sample: DEFAULT_COMPARISON_OPTIONS,
    alternates: ALTERNATE_COMPARISON_OPTIONS,
    extractForTest: () => computeComparisonExtraction(FIXTURE_MEMBERS, FIXTURE_FAILURES),
  },
});

/** 列の並び（`COMPARISON_COLUMN_IDS`）を外へ再公開。`definition.tsx`のテーブル描画が使う。 */
export { COMPARISON_COLUMN_IDS };
