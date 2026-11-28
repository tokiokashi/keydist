import {
  defineSetAnalyzer,
  type AnalyzerSetMember,
  type AnalyzerSetMemberFailure,
  type SetAnalyzerDefinition,
  type SetAnalyzerExtractContext,
} from '#analyzers/contract.ts';
import { analysisTargetKey } from '#input/setup/index.ts';
import { computeComparisonRowValues, type ComparisonRowValues } from '../comparison-column-values.ts';
import {
  DISCIPLINE_TARGET_A,
  DISCIPLINE_TARGET_B,
  disciplineMember,
  disciplineMetrics,
  disciplineSetContext,
  disciplineTrace,
} from '../set-discipline-material.ts';
import { ALTERNATE_SCATTER_OPTIONS, DEFAULT_SCATTER_OPTIONS, scatterOptions, type ScatterOptions } from './options.ts';

/**
 * 散布図Analyzerの抽出。
 *
 * 各メンバー（Setup）の比較表の列の値（`computeComparisonRowValues`）と入力かな数を読み出すだけで、
 * 独自の指標・合成スコアは作らない。軸の選び方・等位線は解析設定（`affects: 'view'`）で、抽出結果には含めない。
 * 値は比較表と同じ列なので、全列を持つ。
 */

/** 解決できたメンバー1件の行。 */
export interface ScatterOkRow {
  readonly kind: 'ok';
  readonly targetKey: string;
  readonly values: ComparisonRowValues;
  /** 入力かな数。1かなあたりの列を軸に取った時に、等位線の総数の形への換算に使う。 */
  readonly inputChars: number;
}

/** 解決に失敗したメンバー1件の行。黙って行を消さず、失敗した事実を値として持つ。 */
export interface ScatterFailedRow {
  readonly kind: 'failed';
  readonly targetKey: string;
  readonly failureKind: AnalyzerSetMemberFailure['kind'];
  readonly message: string;
}

export type ScatterRow = ScatterOkRow | ScatterFailedRow;

export interface ScatterExtracted {
  /** 集合の各枠ぶんの行。この配列自体の順序に表示上の意味は無い（ホストが持つ集合の並び順へ`targetKey`で引き直す）。 */
  readonly rows: readonly ScatterRow[];
}

function memberToRow(member: AnalyzerSetMember): ScatterOkRow {
  return {
    kind: 'ok',
    targetKey: analysisTargetKey(member.target),
    values: computeComparisonRowValues(member.metrics, member.trace),
    inputChars: member.trace.inputChars,
  };
}

function failureToRow(failure: AnalyzerSetMemberFailure): ScatterFailedRow {
  return { kind: 'failed', targetKey: analysisTargetKey(failure.target), failureKind: failure.kind, message: failure.message };
}

export function computeScatterExtraction(members: readonly AnalyzerSetMember[], failures: readonly AnalyzerSetMemberFailure[]): ScatterExtracted {
  return { rows: [...members.map(memberToRow), ...failures.map(failureToRow)] };
}

// ---------------------------------------------------------------------------
// 入れ忘れ防止テストの材料
// ---------------------------------------------------------------------------

const FIXTURE_MEMBERS: readonly AnalyzerSetMember[] = [DISCIPLINE_TARGET_A, DISCIPLINE_TARGET_B].map((target, index) =>
  disciplineMember(target, { trace: disciplineTrace([], 3), metrics: disciplineMetrics(10 * (index + 1)) }),
);

/** engine（`engine/cache.ts`の`getSetExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const scatterDefinition: SetAnalyzerDefinition<ScatterOptions, ScatterExtracted> = defineSetAnalyzer({
  id: 'scatter',
  options: scatterOptions,
  extract(context: SetAnalyzerExtractContext<ScatterOptions>): ScatterExtracted {
    return computeScatterExtraction(context.members, context.failures);
  },
  optionsDiscipline: {
    sample: DEFAULT_SCATTER_OPTIONS,
    alternates: ALTERNATE_SCATTER_OPTIONS,
    context: () => disciplineSetContext(FIXTURE_MEMBERS),
  },
});
