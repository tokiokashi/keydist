import {
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
import { distanceBandShares, traceDistanceBandCounts, type DistanceBandCounts } from '#interpretation/distance-bands.ts';
import { generateTrace } from '#trace/generate.ts';
import { DEFAULT_BAND_CHART_OPTIONS, bandChartOptions, type BandChartOptions } from './options.ts';

/**
 * 帯グラフの抽出（定義は `docs/segment-metrics.md`「1かなごとの移動距離の割合」）。
 *
 * 距離モデルは変えない。メンバーのTraceで文字位置に帰属した距離を、1キー分の距離に丸めた区分に数え直すだけにする。
 * 追加のTraceは依頼しない。打てない文字は数えず、その数は別に持つ。
 */

/** 値を出せる1行（1配列）。 */
export interface BandChartOkRow {
  readonly kind: 'ok';
  readonly targetKey: string;
  /** 区分ごとの文字数（距離の小さい区分から） */
  readonly counts: readonly number[];
  /** 区分ごとの割合（0〜1。和は1） */
  readonly shares: readonly number[];
  /** 数えた文字の数（打てた文字の数）。1以上 */
  readonly typed: number;
  /** 打てない文字の数（数えていない） */
  readonly skipped: number;
  /** 評価に渡したテキストが、最初の対象のテキストと同じか。違う時も値は自分のテキストで求めるが、画面で知らせる */
  readonly sameText: boolean;
}

/** 解決できたが、打てた文字が0で割合が決まらない行。 */
export interface BandChartNoValueRow {
  readonly kind: 'no-value';
  readonly targetKey: string;
  readonly skipped: number;
}

export interface BandChartFailedRow {
  readonly kind: 'failed';
  readonly targetKey: string;
  readonly failureKind: AnalyzerSetMemberFailure['kind'];
  readonly message: string;
}

export type BandChartRow = BandChartOkRow | BandChartNoValueRow | BandChartFailedRow;

export interface BandChartExtracted {
  /** 集合の各枠（配列かSetup）ぶんの行。並び順に表示上の意味は無い（ホストが持つ集合の並び順へ `targetKey` で引き直す）。 */
  readonly rows: readonly BandChartRow[];
  /** 評価に渡したテキストを比べる基準にした、最初の対象。メンバーが無ければ `undefined` */
  readonly referenceTargetKey: string | undefined;
}

/** Traceだけで決まる数え上げは、メンバーに覚えさせて使い回す。 */
function countsOf(member: AnalyzerSetMember): DistanceBandCounts {
  return member.remember('band-chart:counts', () => traceDistanceBandCounts(member.trace));
}

export function computeBandChartExtraction(members: readonly AnalyzerSetMember[], failures: readonly AnalyzerSetMemberFailure[]): BandChartExtracted {
  const reference = members[0];
  const rows: BandChartRow[] = members.map((member): BandChartRow => {
    const targetKey = analysisTargetKey(member.target);
    const counted = countsOf(member);
    const shares = distanceBandShares(counted);
    if (shares === undefined) return { kind: 'no-value', targetKey, skipped: counted.skipped };
    return {
      kind: 'ok',
      targetKey,
      counts: counted.counts,
      shares,
      typed: counted.typed,
      skipped: counted.skipped,
      sameText: member === reference || member.text === reference?.text,
    };
  });
  for (const failure of failures) {
    rows.push({ kind: 'failed', targetKey: analysisTargetKey(failure.target), failureKind: failure.kind, message: failure.message });
  }
  return { rows, referenceTargetKey: reference === undefined ? undefined : analysisTargetKey(reference.target) };
}

// ---------------------------------------------------------------------------
// 入れ忘れ防止テストの材料
// ---------------------------------------------------------------------------

const FIXTURE_TEXT = 'さしすせそたちつてと';
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
      remember: noRemember,
    },
  ];
}

const FIXTURE_FAILURES: readonly AnalyzerSetMemberFailure[] = [{ target: FIXTURE_TARGET_MISSING, kind: 'reference', message: LAYOUT_MISSING_REASON }];

/** engine（`engine/cache.ts` の `getSetExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const bandChartDefinition: SetAnalyzerDefinition<BandChartOptions, BandChartExtracted> = defineSetAnalyzer({
  id: 'band-chart',
  options: bandChartOptions,
  extract(context: SetAnalyzerExtractContext<BandChartOptions>): BandChartExtracted {
    return computeBandChartExtraction(context.members, context.failures);
  },
  optionsDiscipline: {
    sample: DEFAULT_BAND_CHART_OPTIONS,
    alternates: DEFAULT_BAND_CHART_OPTIONS,
    context: () => ({ members: fixtureMembers(), failures: FIXTURE_FAILURES }),
  },
});
