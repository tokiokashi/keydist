import {
  defineSetAnalyzer,
  type AnalyzerSetMember,
  type AnalyzerSetMemberFailure,
  type SetAnalyzerDefinition,
  type SetAnalyzerExtractContext,
} from '#analyzers/contract.ts';
import { DEFAULT_METRIC_CONDITIONS, type Metrics } from '#interpretation/metrics.ts';
import { analysisTargetKey, type AnalysisTarget } from '#input/setup/index.ts';
import { ADJACENT_PAIRS, ALL_FINGERS, type Finger } from '#input/shapes/geometry.ts';
import type { Trace } from '#trace/generate.ts';
import {
  ALTERNATE_FINGER_MATRIX_OPTIONS,
  DEFAULT_FINGER_MATRIX_OPTIONS,
  FINGER_MATRIX_SURFACE_IDS,
  fingerMatrixOptions,
  type FingerMatrixOptions,
  type FingerMatrixSurfaceId,
} from './options.ts';

/**
 * 配列×指のマトリックスの抽出（仕様 §11.1・§11.2・§11.6）。
 *
 * 行は集合の各枠（Setup）、列は指か、同じ手で隣り合う指の組。値は `Metrics` が持つ指ごとの
 * 押下数・総移動距離・隣接指間距離の統計を並べ直すだけで、新しい指標・順位・最小値の印・
 * 合成スコアは作らない。指間距離の標準偏差の定義は仕様 §11.6（母標準偏差）に従う。
 *
 * 全ての面を1回の抽出でまとめて持つ。面の選択は抽出の入力に入れないので、
 * 面を切り替えてもTraceと抽出は作り直さない。面を足す時は、`FINGER_MATRIX_SURFACE_IDS`・
 * `FINGER_MATRIX_SURFACES`（列と単位）・`surfaceCells`（値の読み出し）に1つずつ足す。
 */

/** 列の1つ。1本の指か、同じ手で隣り合う指の組。 */
export interface FingerMatrixColumn {
  readonly id: string;
  readonly fingers: readonly Finger[];
}

const FINGER_COLUMNS: readonly FingerMatrixColumn[] = ALL_FINGERS.map((finger) => ({ id: finger, fingers: [finger] }));
const PAIR_COLUMNS: readonly FingerMatrixColumn[] = ADJACENT_PAIRS.map((pair) => ({ id: `${pair[0]}-${pair[1]}`, fingers: pair }));

/** 面の単位。押下数は回数、それ以外は距離 [u]。 */
export type FingerMatrixUnit = 'count' | 'u';

export interface FingerMatrixSurfaceDef {
  readonly id: FingerMatrixSurfaceId;
  readonly unit: FingerMatrixUnit;
  readonly columns: readonly FingerMatrixColumn[];
}

/** 面の並びと、面ごとの列・単位。 */
export const FINGER_MATRIX_SURFACES: readonly FingerMatrixSurfaceDef[] = [
  { id: 'presses', unit: 'count', columns: FINGER_COLUMNS },
  { id: 'distance', unit: 'u', columns: FINGER_COLUMNS },
  // 指間距離は仕様 §11.6の「ホーム間隔からの超過」。親指は隣接ペアに含まれない
  { id: 'pairMean', unit: 'u', columns: PAIR_COLUMNS },
  { id: 'pairStdDev', unit: 'u', columns: PAIR_COLUMNS },
];

/** 解決できた1行（1 Setup）。面ごとに、列の並びと同じ順の値を持つ。 */
export interface FingerMatrixOkRow {
  readonly kind: 'ok';
  readonly targetKey: string;
  /** 入力文字数。1文字あたりへ直す時の分母 */
  readonly inputChars: number;
  readonly surfaces: Readonly<Record<FingerMatrixSurfaceId, readonly number[]>>;
}

/** 解決に失敗した1行。黙って消さず、失敗した事実を値として持つ。 */
export interface FingerMatrixFailedRow {
  readonly kind: 'failed';
  readonly targetKey: string;
  readonly failureKind: AnalyzerSetMemberFailure['kind'];
  readonly message: string;
}

export type FingerMatrixRow = FingerMatrixOkRow | FingerMatrixFailedRow;

export interface FingerMatrixExtracted {
  /** 面ごとの列と単位。`rows[i].surfaces[面]` の値はこの列の順に並ぶ */
  readonly surfaces: readonly FingerMatrixSurfaceDef[];
  /** 順序に表示上の意味は無い。`targetKey` で集合の並びへ引き直す */
  readonly rows: readonly FingerMatrixRow[];
}

function surfaceCells(id: FingerMatrixSurfaceId, metrics: Metrics): number[] {
  switch (id) {
    case 'presses':
      return ALL_FINGERS.map((finger) => metrics.perFingerPresses[finger]);
    case 'distance':
      return ALL_FINGERS.map((finger) => metrics.perFinger[finger]);
    case 'pairMean':
      return metrics.adjacent.map((item) => item.meanExcess);
    case 'pairStdDev':
      return metrics.adjacent.map((item) => item.stdDev);
  }
}

/** `Metrics` から全ての面を読み出す純関数。 */
export function computeFingerMatrixSurfaces(metrics: Metrics): FingerMatrixOkRow['surfaces'] {
  const surfaces = {} as Record<FingerMatrixSurfaceId, readonly number[]>;
  for (const id of FINGER_MATRIX_SURFACE_IDS) surfaces[id] = surfaceCells(id, metrics);
  return surfaces;
}

function memberToRow(member: AnalyzerSetMember): FingerMatrixOkRow {
  return {
    kind: 'ok',
    targetKey: analysisTargetKey(member.target),
    inputChars: member.metrics.inputChars,
    surfaces: computeFingerMatrixSurfaces(member.metrics),
  };
}

function failureToRow(failure: AnalyzerSetMemberFailure): FingerMatrixFailedRow {
  return { kind: 'failed', targetKey: analysisTargetKey(failure.target), failureKind: failure.kind, message: failure.message };
}

export function computeFingerMatrixExtraction(
  members: readonly AnalyzerSetMember[],
  failures: readonly AnalyzerSetMemberFailure[],
): FingerMatrixExtracted {
  return {
    surfaces: FINGER_MATRIX_SURFACES,
    rows: [...members.map(memberToRow), ...failures.map(failureToRow)],
  };
}

// ---------------------------------------------------------------------------
// 入れ忘れ防止テストの材料
// ---------------------------------------------------------------------------

function fixtureMetrics(): Metrics {
  const perFinger = {} as Metrics['perFinger'];
  const perFingerPresses = {} as Metrics['perFingerPresses'];
  for (const finger of ALL_FINGERS) {
    perFinger[finger] = 0;
    perFingerPresses[finger] = 0;
  }
  perFinger.LI = 2;
  perFingerPresses.LI = 2;
  return {
    geometryId: 'row-staggered',
    geometryName: 'Row-staggered',
    fingerAssignmentId: 'default',
    fingerAssignmentName: '既定',
    conditions: DEFAULT_METRIC_CONDITIONS,
    strokes: 2,
    actions: 2,
    presses: 2,
    skipped: 0,
    inputChars: 2,
    perFinger,
    perFingerPresses,
    totalUnits: 2,
    totalMm: 38,
    meanPerStroke: 1,
    perCharUnits: 1,
    perCharSteps: 1,
    perCharPresses: 1,
    singleTapLayerRate: 100,
    singleTapRate: 100,
    singleKeyRate: 100,
    adjacent: ADJACENT_PAIRS.map((pair, i) => ({ pair, meanExcess: i * 0.1, stdDev: i * 0.05, maxExcess: i * 0.2 })),
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

const FIXTURE_TRACE: Trace = {
  strokes: [],
  errors: [],
  skipped: 0,
  inputChars: 2,
  comboHits: [],
  comboDefinitions: 0,
  layerDefinitions: [],
};

const FIXTURE_TARGET: AnalysisTarget = { kind: 'setup', setupId: 'fixture-a' };
const FIXTURE_MISSING: AnalysisTarget = { kind: 'setup', setupId: 'fixture-missing' };

const FIXTURE_MEMBERS: readonly AnalyzerSetMember[] = [
  {
    target: FIXTURE_TARGET,
    trace: FIXTURE_TRACE,
    analysis: { chains: [], arpeggios: [] } as unknown as AnalyzerSetMember['analysis'],
    metrics: fixtureMetrics(),
    requestTrace: { requestTrace: () => { throw new Error('unused'); } },
  },
];

const FIXTURE_FAILURES: readonly AnalyzerSetMemberFailure[] = [
  { target: FIXTURE_MISSING, kind: 'reference', message: '配列が見つかりません（削除された可能性があります）' },
];

/**
 * engine（`engine/cache.ts` の `getSetExtraction`）が呼ぶ、Analyzer契約の実体。
 * 解析設定は表示だけが変わる項目のみ。
 */
export const fingerMatrixDefinition: SetAnalyzerDefinition<FingerMatrixOptions, FingerMatrixExtracted> = defineSetAnalyzer({
  id: 'finger-matrix',
  options: fingerMatrixOptions,
  extract(context: SetAnalyzerExtractContext<FingerMatrixOptions>): FingerMatrixExtracted {
    return computeFingerMatrixExtraction(context.members, context.failures);
  },
  optionsDiscipline: {
    sample: DEFAULT_FINGER_MATRIX_OPTIONS,
    alternates: ALTERNATE_FINGER_MATRIX_OPTIONS,
    extractForTest: () => computeFingerMatrixExtraction(FIXTURE_MEMBERS, FIXTURE_FAILURES),
  },
});
