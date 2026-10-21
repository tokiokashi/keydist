import {
  DEFAULT_EXTRACTION_ASSETS,
  defineSetAnalyzer,
  noRemember,
  type AnalyzerSetMember,
  type AnalyzerSetMemberFailure,
  type SetAnalyzerDefinition,
  type SetAnalyzerExtractContext,
} from '#analyzers/contract.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { analysisTargetKey, LAYOUT_MISSING_REASON, type AnalysisTarget } from '#input/setup/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import type { SegmenterInfo, SegmentationAssets, SegmentationOrigin } from '#input/text/segmentation.ts';
import {
  analyzeBunsetsuText,
  buildBunsetsuTraceBasis,
  bunsetsuLayoutStats,
  type BigramCell,
  type BunsetsuLayoutStats,
  type BunsetsuTextStructure,
  type BunsetsuTextTable,
  type BunsetsuTraceBasis,
  type FrequentBigram,
  type FrequentSegment,
} from '#interpretation/bunsetsu-stats.ts';
import { generateTrace } from '#trace/generate.ts';
import { DEFAULT_BUNSETSU_STATS_OPTIONS, bunsetsuStatsOptions, type BunsetsuStatsOptions } from './options.ts';

/**
 * 文節の中と境目の統計の抽出（定義は `docs/segment-metrics.md`「文節の中と境目の統計」）。
 *
 * 距離モデルは変えない。メンバーのTraceを、評価に渡したテキストの文字位置の種類（文節の中・境目）で集計し直すだけにする。
 * 追加のTraceは依頼しない（ペインが持つTraceと文節の区切りだけで求める）。
 *
 * テキストの表と上位の一覧の行は、テキストと文節の区切りだけで決まる。評価に渡すテキストは、記号の範囲の上書きなどで
 * 対象ごとに違うことがあるので、表の基準にするのは、区切りが渡された最初の対象のテキストにする。
 * 基準と違うテキストの対象は、配列ごとの表の値も、一覧のセルも、自分のテキストで求める（一覧の行の文字列は基準のものを、自分のテキストから引く）。
 * 文字列が自分のテキストに無ければ、そのセルは値なしになる。
 */

/** 区切りの出どころと分割器（表の基準にした対象のもの）。 */
export interface BunsetsuStatsSource {
  readonly splitter: SegmenterInfo;
  readonly origin: SegmentationOrigin;
}

/** 配列によらない表と、上位の一覧の行（表の基準にした対象のテキストから求めたもの）。 */
export interface BunsetsuStatsText {
  /** 表の基準にした対象 */
  readonly referenceTargetKey: string;
  readonly source: BunsetsuStatsSource;
  readonly table: BunsetsuTextTable;
  /** 頻出の文節。出現回数の多い順（同じ回数は最初に出た順） */
  readonly frequentSegments: readonly FrequentSegment[];
  /** 頻出のまたぐbigram。またいだ回数の多い順（同じ回数は最初にまたいだ順） */
  readonly frequentBigrams: readonly FrequentBigram[];
}

/** 解決できて、区切りが渡された1行（1配列）。 */
export interface BunsetsuStatsOkRow {
  readonly kind: 'ok';
  readonly targetKey: string;
  /** 評価に渡したテキストと区切りが、表の基準にした対象と同じか。違う時も値は自分のテキストで求めるが、画面で知らせる */
  readonly sameText: boolean;
  readonly stats: Omit<BunsetsuLayoutStats, 'frequentSegmentCells' | 'frequentBigramCells'>;
  /** `BunsetsuStatsText.frequentSegments` と同じ並びの値 */
  readonly frequentSegmentCells: readonly (number | undefined)[];
  /** `BunsetsuStatsText.frequentBigrams` と同じ並びの値 */
  readonly frequentBigramCells: readonly BigramCell[];
}

/** 文節の区切りが渡されなかった行（日本語以外のテキスト、分割器を読み込めなかった時）。値は出さない。 */
export interface BunsetsuStatsNoSegmentationRow {
  readonly kind: 'no-segmentation';
  readonly targetKey: string;
}

export interface BunsetsuStatsFailedRow {
  readonly kind: 'failed';
  readonly targetKey: string;
  readonly failureKind: AnalyzerSetMemberFailure['kind'];
  readonly message: string;
}

export type BunsetsuStatsRow = BunsetsuStatsOkRow | BunsetsuStatsNoSegmentationRow | BunsetsuStatsFailedRow;

export interface BunsetsuStatsExtracted {
  /** 区切りが渡された対象が1つも無ければ `undefined` */
  readonly text: BunsetsuStatsText | undefined;
  /** 集合の各枠（配列かSetup）ぶんの行。並び順に表示上の意味は無い。 */
  readonly rows: readonly BunsetsuStatsRow[];
}

function charsOf(member: AnalyzerSetMember): readonly string[] {
  if (member.text === undefined) throw new Error('文節の統計の抽出に、評価に渡したテキストが渡されていない');
  return [...member.text];
}

interface Reference {
  readonly member: AnalyzerSetMember;
  readonly segmentation: SegmentationAssets;
  readonly structure: BunsetsuTextStructure;
}

function sameBoundaries(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Traceだけで決まる索引と打鍵できなかった文字の位置は、メンバーに覚えさせて使い回す。
 * 文節の区切りに依るもの（テキストの構造）は、覚える入れ物のキーに区切りが入らないので覚えさせない。
 */
function basisOf(member: AnalyzerSetMember): BunsetsuTraceBasis {
  return member.remember('bunsetsu-stats:basis', () => buildBunsetsuTraceBasis(member.trace));
}

export function computeBunsetsuStatsExtraction(
  members: readonly AnalyzerSetMember[],
  failures: readonly AnalyzerSetMemberFailure[],
): BunsetsuStatsExtracted {
  const firstWithSegmentation = members.find((member) => member.assets?.segmentation !== undefined);
  const reference: Reference | undefined =
    firstWithSegmentation === undefined
      ? undefined
      : {
          member: firstWithSegmentation,
          segmentation: firstWithSegmentation.assets!.segmentation!,
          structure: analyzeBunsetsuText(charsOf(firstWithSegmentation), firstWithSegmentation.assets!.segmentation!.boundaries),
        };

  const rows: BunsetsuStatsRow[] = members.map((member): BunsetsuStatsRow => {
    const targetKey = analysisTargetKey(member.target);
    const segmentation = member.assets?.segmentation;
    if (segmentation === undefined || reference === undefined) return { kind: 'no-segmentation', targetKey };
    const sameText =
      member === reference.member ||
      (member.text === reference.member.text && sameBoundaries(segmentation.boundaries, reference.segmentation.boundaries));
    // テキストが基準と同じなら、基準の構造を共有する。違う時は自分のテキストの構造を作り、基準の行の文字列を自分のテキストから引く
    const structure = sameText ? reference.structure : analyzeBunsetsuText(charsOf(member), segmentation.boundaries);
    const { frequentSegmentCells, frequentBigramCells, ...stats } = bunsetsuLayoutStats(
      basisOf(member),
      segmentation.boundaries,
      structure,
      reference.structure,
    );
    return { kind: 'ok', targetKey, sameText, stats, frequentSegmentCells, frequentBigramCells };
  });
  for (const failure of failures) {
    rows.push({ kind: 'failed', targetKey: analysisTargetKey(failure.target), failureKind: failure.kind, message: failure.message });
  }

  const text: BunsetsuStatsText | undefined =
    reference === undefined
      ? undefined
      : {
          referenceTargetKey: analysisTargetKey(reference.member.target),
          source: { splitter: reference.segmentation.splitter, origin: reference.segmentation.origin },
          table: reference.structure.table,
          frequentSegments: reference.structure.segments.map(({ text, count }) => ({ text, count })),
          frequentBigrams: reference.structure.bigrams.map(({ pair, crossCount, insideCount }) => ({ pair, crossCount, insideCount })),
        };
  return { text, rows };
}

// ---------------------------------------------------------------------------
// 入れ忘れ防止テストの材料
// ---------------------------------------------------------------------------

const FIXTURE_TEXT = 'あいうえおかきくけこさしすせそ';
const FIXTURE_SEGMENTATION = {
  boundaries: [3, 6, 9, 12],
  origin: 'kana-only',
  splitter: { name: 'fixture', version: '0' },
} as const;
const FIXTURE_TARGET: AnalysisTarget = { kind: 'setup', setupId: 'fixture-a' };
const FIXTURE_TARGET_MISSING: AnalysisTarget = { kind: 'setup', setupId: 'fixture-missing' };

function fixtureMembers(): readonly AnalyzerSetMember[] {
  const trace = generateTrace(FIXTURE_TEXT, LAYOUT_BY_ID.get('qwerty')!, buildGeometry('row-staggered'), { windowSize: 3, sfbHomeCost: true });
  return [
    {
      target: FIXTURE_TARGET,
      text: FIXTURE_TEXT,
      trace,
      // この抽出が読まない値は材料に含めない
      analysis: undefined as never,
      metrics: undefined as never,
      requestTrace: { requestTrace: () => trace },
      assets: { ...DEFAULT_EXTRACTION_ASSETS, segmentation: FIXTURE_SEGMENTATION },
      remember: noRemember,
    },
  ];
}

const FIXTURE_FAILURES: readonly AnalyzerSetMemberFailure[] = [{ target: FIXTURE_TARGET_MISSING, kind: 'reference', message: LAYOUT_MISSING_REASON }];

/** engine（`engine/cache.ts` の `getSetExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const bunsetsuStatsDefinition: SetAnalyzerDefinition<BunsetsuStatsOptions, BunsetsuStatsExtracted> = defineSetAnalyzer({
  id: 'bunsetsu-stats',
  options: bunsetsuStatsOptions,
  extract(context: SetAnalyzerExtractContext<BunsetsuStatsOptions>): BunsetsuStatsExtracted {
    return computeBunsetsuStatsExtraction(context.members, context.failures);
  },
  // 区切りは常に使う。区切りと分割器の名前・版・出どころが変わったら、抽出を作り直す
  assetsKeyOf: (_options, assets) => assets.segmentation ?? null,
  optionsDiscipline: {
    sample: DEFAULT_BUNSETSU_STATS_OPTIONS,
    alternates: DEFAULT_BUNSETSU_STATS_OPTIONS,
    context: () => ({ members: fixtureMembers(), failures: FIXTURE_FAILURES }),
  },
});
