import {
  defineSetAnalyzer,
  noRemember,
  type AnalyzerSetMember,
  type AnalyzerSetMemberFailure,
  type SetAnalyzerDefinition,
  type SetAnalyzerExtractContext,
} from '#analyzers/contract.ts';
import { countBigramCombinations } from '#interpretation/bigram-combinations.ts';
import { adjacentMeanStdDev, DEFAULT_METRIC_CONDITIONS, rightHandShare, sameFingerRate, type Metrics } from '#interpretation/metrics.ts';
import { analysisTargetKey, type AnalysisTarget } from '#input/setup/index.ts';
import { ALL_FINGERS, type Finger, type Key } from '#input/shapes/geometry.ts';
import type { Press, Stroke, StrokeParticipation, Trace } from '#trace/generate.ts';
import {
  ALTERNATE_COMPARISON_OPTIONS,
  COMPARISON_COLUMN_IDS,
  DEFAULT_COMPARISON_OPTIONS,
  comparisonOptions,
  type ComparisonColumnId,
  type ComparisonOptions,
} from './options.ts';
import { LAYOUT_MISSING_REASON } from '#input/setup/index.ts';

/**
 * 比較表Analyzerの抽出。
 *
 * 集合対象（`SetAnalyzerDefinition`）の最初の実例。各メンバー（Setup）の`Metrics`から
 * 列の値を機械的に読み出すだけで、独自の合成指標・優劣判定は行わない（AGENTS.md
 * 「優劣の判定・順位付け・合成スコアを作らない」）。基準（baseline）との比較・
 * 列の表示/非表示は解析設定（`affects: 'view'`）で、抽出結果には含めない
 * （`options.ts`のコメント参照）。
 */

/** 1行（1 Setup）ぶんの、全列の生値。 */
export type ComparisonRowValues = Readonly<Record<ComparisonColumnId, number>>;

/** 解決できたメンバー1件の行。 */
export interface ComparisonOkRow {
  readonly kind: 'ok';
  readonly targetKey: string;
  readonly values: ComparisonRowValues;
}

/**
 * 解決に失敗したメンバー1件の行。
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

/** `Metrics`と`Trace`から全列を読み出す純関数。Bigramの組の種類数の2列だけ`Trace`から数え、他の列は`Metrics`を写す。 */
export function computeComparisonRowValues(metrics: Metrics, trace: Trace): ComparisonRowValues {
  const bigrams = countBigramCombinations(trace);
  const { mean: adjacentMean, stdDev: adjacentStdDev } = adjacentMeanStdDev(metrics.adjacent);
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
    sameFingerRate: sameFingerRate(metrics.sameFinger, metrics.strokes),
    adjacentMean,
    adjacentStdDev,
    rightHandDistanceShare: rightHandShare(metrics.perFinger),
    rightHandPressShare: rightHandShare(metrics.perFingerPresses),
    physicalBigramCombinations: bigrams.physical,
    logicalBigramCombinations: bigrams.withTriggers,
  };
}

function memberToRow(member: AnalyzerSetMember): ComparisonOkRow {
  return { kind: 'ok', targetKey: analysisTargetKey(member.target), values: computeComparisonRowValues(member.metrics, member.trace) };
}

function failureToRow(failure: AnalyzerSetMemberFailure): ComparisonFailedRow {
  return { kind: 'failed', targetKey: analysisTargetKey(failure.target), failureKind: failure.kind, message: failure.message };
}

export function computeComparisonExtraction(members: readonly AnalyzerSetMember[], failures: readonly AnalyzerSetMemberFailure[]): ComparisonExtracted {
  return {
    rows: [...members.map(memberToRow), ...failures.map(failureToRow)],
  };
}

// ---------------------------------------------------------------------------
// 入れ忘れ防止テストの材料
// ---------------------------------------------------------------------------

function fixtureKey(id: string, finger: Finger, x: number, y = 2): Key {
  return { id, finger, x, y, row: 2, col: 0 };
}

function fixturePress(finger: Finger, id: string, x: number, y = 2): Press {
  return { finger, keys: [fixtureKey(id, finger, x, y)], target: { x, y }, origin: { at: { x, y }, from: 'home' }, gap: 1, distance: 0, sfb: false };
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
    selectionIndex: index,
    kanaStart: index,
    kanaEnd: index,
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
  skippedByKind: { kanji: 0, symbol: 0, other: 0 },
  inputChars: 3,
  comboHits: [],
  comboDefinitions: 0,
  layerDefinitions: [],
};

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

// 比較表はTraceRequesterを使わないので、フィクスチャでは「呼ばれたら気づく」スタブにする。
const UNUSED_REQUEST_TRACE = {
  requestTrace: () => {
    throw new Error('unused');
  },
};

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
    remember: noRemember,
  },
  {
    target: FIXTURE_TARGET_B,
    trace: FIXTURE_TRACE,
    analysis: { chains: [], arpeggios: [] } as unknown as AnalyzerSetMember['analysis'],
    metrics: fixtureMetrics(20),
    requestTrace: UNUSED_REQUEST_TRACE,
    remember: noRemember,
  },
];

const FIXTURE_FAILURES: readonly AnalyzerSetMemberFailure[] = [{ target: FIXTURE_TARGET_MISSING, kind: 'reference', message: LAYOUT_MISSING_REASON }];

/**
 * engine（`engine/cache.ts`の`getSetExtraction`）が呼ぶ、Analyzer契約の実体。
 * `defineSetAnalyzer`（`analyzers/contract.ts`の集合対象版）で
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
    context: () => ({ members: FIXTURE_MEMBERS, failures: FIXTURE_FAILURES }),
  },
});

/** 列の並び（`COMPARISON_COLUMN_IDS`）を外へ再公開。`definition.tsx`のテーブル描画が使う。 */
export { COMPARISON_COLUMN_IDS };
