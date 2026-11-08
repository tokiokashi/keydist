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
import type { SegmenterInfo, SegmentationOrigin } from '#input/text/segmentation.ts';
import { segmentPerCharBox, type SegmentPerCharBox } from '#interpretation/bunsetsu-stats.ts';
import { buildSpanIndex, type SpanIndex } from '#interpretation/span-metrics.ts';
import { generateTrace } from '#trace/generate.ts';
import { DEFAULT_BOX_PLOT_OPTIONS, boxPlotOptions, type BoxPlotOptions } from './options.ts';

/**
 * 箱ひげ図の抽出（定義は `docs/segment-metrics.md`「文節の中と境目の統計」の「表に出ない図だけの量（箱ひげ図）」）。
 *
 * 距離モデルは変えない。メンバーのTraceを文節で区切り、文節ごとの1かな換算の移動距離の標本から5つの値を求める。
 * 標本は文節ごとの統計の表の列と同じ関数で作る（`segmentPerCharBox` と `bunsetsuLayoutStats` が標本の作り方を共有する）。
 * 追加のTraceは依頼しない。
 *
 * 評価に渡すテキストは、記号の範囲の上書きなどで対象ごとに違うことがある。各配列の値は自分のテキストと区切りで求め、
 * 区切りが渡された最初の対象のテキストまたは区切りと違う配列は、文節の数を配列ごとに出せるよう `sameText` で区別する。
 */

/** 区切りの出どころと分割器（基準にした対象のもの）。 */
export interface BoxPlotSource {
  readonly splitter: SegmenterInfo;
  readonly origin: SegmentationOrigin;
}

/** 値を出せる1行（1配列）。 */
export interface BoxPlotOkRow {
  readonly kind: 'ok';
  readonly targetKey: string;
  readonly box: SegmentPerCharBox;
  /** 評価に渡したテキストと区切りが、基準にした対象と同じか。違う時も値は自分のテキストで求めるが、画面で文節の数を配列ごとに出す */
  readonly sameText: boolean;
}

/** 解決できて区切りも渡されたが、値が決まる文節が無い行（テキストが空など）。 */
export interface BoxPlotNoValueRow {
  readonly kind: 'no-value';
  readonly targetKey: string;
}

/** 文節の区切りが渡されなかった行（日本語以外のテキスト、分割器を読み込めなかった時）。値は出さない。 */
export interface BoxPlotNoSegmentationRow {
  readonly kind: 'no-segmentation';
  readonly targetKey: string;
}

export interface BoxPlotFailedRow {
  readonly kind: 'failed';
  readonly targetKey: string;
  readonly failureKind: AnalyzerSetMemberFailure['kind'];
  readonly message: string;
}

export type BoxPlotRow = BoxPlotOkRow | BoxPlotNoValueRow | BoxPlotNoSegmentationRow | BoxPlotFailedRow;

export interface BoxPlotExtracted {
  /** 区切りの出どころと分割器。区切りが渡された対象が1つも無ければ `undefined` */
  readonly source: BoxPlotSource | undefined;
  /** 基準にした対象。区切りが渡された最初の対象 */
  readonly referenceTargetKey: string | undefined;
  /** 集合の各枠（配列かSetup）ぶんの行。並び順に表示上の意味は無い（ホストが持つ集合の並び順へ `targetKey` で引き直す）。 */
  readonly rows: readonly BoxPlotRow[];
}

function sameBoundaries(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Traceだけで決まる索引は、メンバーに覚えさせて使い回す。区切りに依る値は覚えさせない。 */
function indexOf(member: AnalyzerSetMember): SpanIndex {
  return member.remember('box-plot:index', () => buildSpanIndex(member.trace));
}

export function computeBoxPlotExtraction(members: readonly AnalyzerSetMember[], failures: readonly AnalyzerSetMemberFailure[]): BoxPlotExtracted {
  const reference = members.find((member) => member.assets?.segmentation !== undefined);
  const referenceSegmentation = reference?.assets?.segmentation;

  const rows: BoxPlotRow[] = members.map((member): BoxPlotRow => {
    const targetKey = analysisTargetKey(member.target);
    const segmentation = member.assets?.segmentation;
    if (segmentation === undefined || reference === undefined || referenceSegmentation === undefined) return { kind: 'no-segmentation', targetKey };
    const box = segmentPerCharBox(indexOf(member), segmentation.boundaries);
    if (box === undefined) return { kind: 'no-value', targetKey };
    const sameText =
      member === reference || (member.text === reference.text && sameBoundaries(segmentation.boundaries, referenceSegmentation.boundaries));
    return { kind: 'ok', targetKey, box, sameText };
  });
  for (const failure of failures) {
    rows.push({ kind: 'failed', targetKey: analysisTargetKey(failure.target), failureKind: failure.kind, message: failure.message });
  }
  return {
    source: referenceSegmentation === undefined ? undefined : { splitter: referenceSegmentation.splitter, origin: referenceSegmentation.origin },
    referenceTargetKey: reference === undefined ? undefined : analysisTargetKey(reference.target),
    rows,
  };
}

// ---------------------------------------------------------------------------
// 入れ忘れ防止テストの材料
// ---------------------------------------------------------------------------

const FIXTURE_TEXT = 'なにぬねのはひふへほまみむめも';
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
export const boxPlotDefinition: SetAnalyzerDefinition<BoxPlotOptions, BoxPlotExtracted> = defineSetAnalyzer({
  id: 'box-plot',
  options: boxPlotOptions,
  extract(context: SetAnalyzerExtractContext<BoxPlotOptions>): BoxPlotExtracted {
    return computeBoxPlotExtraction(context.members, context.failures);
  },
  // 区切りは常に使う。区切りと分割器の名前・版・出どころが変わったら、抽出を作り直す
  assetsKeyOf: (_options, assets) => assets.segmentation ?? null,
  optionsDiscipline: {
    sample: DEFAULT_BOX_PLOT_OPTIONS,
    alternates: DEFAULT_BOX_PLOT_OPTIONS,
    context: () => ({ members: fixtureMembers(), failures: FIXTURE_FAILURES }),
  },
});
