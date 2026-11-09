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
import { bandShares, traceBandCounts, type BandCounts, type BandQuantityId } from '#interpretation/band-quantities.ts';
import { generateTrace } from '#trace/generate.ts';
import { ALTERNATE_BAND_CHART_OPTIONS, DEFAULT_BAND_CHART_OPTIONS, bandChartOptions, type BandChartOptions } from './options.ts';

/**
 * 帯グラフの抽出（定義は `docs/segment-metrics.md`「帯グラフの量」）。
 *
 * 距離モデルは変えない。メンバーのTraceのステップ・押下・指・キー・距離を、選んだ量の区分に数え直すだけにする。
 * 追加のTraceは依頼しない。打てない文字を覆う打鍵のまとまりは数えず、打てない文字の数は別に持つ。
 */

/** 打てない文字1種類と、その文字の位置の数。 */
export interface SkippedChar {
  readonly char: string;
  readonly count: number;
}

/**
 * 打てない文字（`Trace.skippedPositions` の位置にある、評価に渡したテキストの文字）を、文字ごとに数える。
 * 回数はその文字の位置の数で、`Trace.skipped`（展開後の英字の数）とは一致しないことがある。回数の多い順に、同数なら渡された位置の順に並べる（`Trace.skippedPositions` は昇順なので、テキストで先に出た順になる）。
 */
export function skippedCharCounts(text: string, skippedPositions: readonly number[]): readonly SkippedChar[] {
  const chars = [...text];
  const counts = new Map<string, number>();
  for (const position of new Set(skippedPositions)) {
    const char = chars[position];
    if (char === undefined) continue;
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  return [...counts].map(([char, count]) => ({ char, count })).sort((a, b) => b.count - a.count);
}

/** 値を出せる1行（1配列）。 */
export interface BandChartOkRow {
  readonly kind: 'ok';
  readonly targetKey: string;
  /** 区分ごとの標本の量（区分の順。標本は量で決まる: かな・押下・移動距離 [u]） */
  readonly counts: readonly number[];
  /** 区分ごとの割合（0〜1。和は1） */
  readonly shares: readonly number[];
  /** 割合の分母（標本の合計）。0より大きい */
  readonly total: number;
  /** 打てない文字（数えていない）。文字ごとの回数 */
  readonly skippedChars: readonly SkippedChar[];
  /** 評価に渡したテキストが、最初の対象のテキストと同じか。違う時も値は自分のテキストで求めるが、画面で知らせる */
  readonly sameText: boolean;
}

/** 解決できたが、分母が0で割合が決まらない行。 */
export interface BandChartNoValueRow {
  readonly kind: 'no-value';
  readonly targetKey: string;
  readonly skippedChars: readonly SkippedChar[];
}

export interface BandChartFailedRow {
  readonly kind: 'failed';
  readonly targetKey: string;
  readonly failureKind: AnalyzerSetMemberFailure['kind'];
  readonly message: string;
}

export type BandChartRow = BandChartOkRow | BandChartNoValueRow | BandChartFailedRow;

export interface BandChartExtracted {
  /** 数えた量 */
  readonly quantity: BandQuantityId;
  /** 集合の各枠（配列かSetup）ぶんの行。並び順に表示上の意味は無い（ホストが持つ集合の並び順へ `targetKey` で引き直す）。 */
  readonly rows: readonly BandChartRow[];
  /** 評価に渡したテキストを比べる基準にした、最初の対象。メンバーが無ければ `undefined` */
  readonly referenceTargetKey: string | undefined;
}

/** Traceだけで決まる7つの量の数え上げは、メンバーに覚えさせて使い回す。 */
function countsOf(member: AnalyzerSetMember): BandCounts {
  return member.remember('band-chart:counts', () => traceBandCounts(member.trace));
}

export function computeBandChartExtraction(
  members: readonly AnalyzerSetMember[],
  failures: readonly AnalyzerSetMemberFailure[],
  quantity: BandQuantityId,
): BandChartExtracted {
  const reference = members[0];
  const rows: BandChartRow[] = members.map((member): BandChartRow => {
    const targetKey = analysisTargetKey(member.target);
    const all = countsOf(member);
    const counted = all.byQuantity[quantity];
    const shares = bandShares(counted);
    const skippedChars = skippedCharCounts(member.text ?? '', member.trace.skippedPositions);
    if (shares === undefined) return { kind: 'no-value', targetKey, skippedChars };
    return {
      kind: 'ok',
      targetKey,
      counts: counted.counts,
      shares,
      total: counted.total,
      skippedChars,
      sameText: member === reference || member.text === reference?.text,
    };
  });
  for (const failure of failures) {
    rows.push({ kind: 'failed', targetKey: analysisTargetKey(failure.target), failureKind: failure.kind, message: failure.message });
  }
  return { quantity, rows, referenceTargetKey: reference === undefined ? undefined : analysisTargetKey(reference.target) };
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
    return computeBandChartExtraction(context.members, context.failures, context.options.quantity);
  },
  optionsDiscipline: {
    sample: DEFAULT_BAND_CHART_OPTIONS,
    alternates: ALTERNATE_BAND_CHART_OPTIONS,
    context: () => ({ members: fixtureMembers(), failures: FIXTURE_FAILURES }),
  },
});
