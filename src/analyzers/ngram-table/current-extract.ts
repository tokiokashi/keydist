import {
  defineSetAnalyzer,
  type AnalyzerSetMember,
  type AnalyzerSetMemberFailure,
  type SetAnalyzerDefinition,
  type SetAnalyzerExtractContext,
} from '#analyzers/contract.ts';
import { defineOptions } from '#analyzers/options.ts';
import { analysisTargetKey } from '#input/setup/index.ts';
import type { CurrentAnalysisExtracted, CurrentAnalysisFailedRow, CurrentAnalysisOkRow } from '../current-analysis.ts';
import {
  DISCIPLINE_TARGET_A,
  DISCIPLINE_TARGET_B,
  DISCIPLINE_TRACE,
  disciplineMember,
  disciplineMetrics,
  disciplineSetContext,
} from '../set-discipline-material.ts';

/**
 * 表による解析と並べる、今の解析の値の抽出（`spec/distance-model.md` §13.10）。
 *
 * 比較表と同じく、メンバーの解決（評価に渡すテキストの前処理・読みの直し・かなで数える先読み`N`）と`Metrics`を使い、
 * `Metrics`の項目を読み出すだけで、新しい量は定義しない。表による解析の抽出（`extract.ts`）とは別の依頼で、
 * 表による解析のメンバーの解決（固定の最小のテキスト）には触れない。
 * ペインには出さない。表による解析のペインが、表の元が選んだテキストの時だけ依頼する。
 */

function okRow(member: AnalyzerSetMember): CurrentAnalysisOkRow {
  const { metrics } = member;
  return {
    kind: 'ok',
    targetKey: analysisTargetKey(member.target),
    totalDistance: metrics.totalUnits,
    perChar: metrics.inputChars === 0 ? undefined : metrics.perCharUnits,
    chars: metrics.inputChars,
    skipped: metrics.skipped,
    lookahead: metrics.conditions.windowSize,
  };
}

function failedRow(failure: AnalyzerSetMemberFailure): CurrentAnalysisFailedRow {
  return { kind: 'failed', targetKey: analysisTargetKey(failure.target), message: failure.message };
}

export function computeCurrentAnalysisExtraction(
  members: readonly AnalyzerSetMember[],
  failures: readonly AnalyzerSetMemberFailure[],
): CurrentAnalysisExtracted {
  return { rows: [...members.map(okRow), ...failures.map(failedRow)] };
}

// 解析設定を持たない。入れ忘れ防止テストの材料も空にする
const currentAnalysisOptions = defineOptions({});

export type NgramTableCurrentOptions = typeof currentAnalysisOptions.defaultOptions;

/** 解析設定を持たないので、依頼にはいつもこの値を渡す。 */
export const NGRAM_TABLE_CURRENT_OPTIONS: NgramTableCurrentOptions = currentAnalysisOptions.defaultOptions;

const FIXTURE_MEMBERS: readonly AnalyzerSetMember[] = [
  disciplineMember(DISCIPLINE_TARGET_A, { trace: DISCIPLINE_TRACE, metrics: disciplineMetrics(10) }),
  disciplineMember(DISCIPLINE_TARGET_B, { trace: DISCIPLINE_TRACE, metrics: disciplineMetrics(20) }),
];

/** engine（`engine/cache.ts`の`getSetExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const ngramTableCurrentDefinition: SetAnalyzerDefinition<NgramTableCurrentOptions, CurrentAnalysisExtracted> = defineSetAnalyzer({
  id: 'ngram-table-current',
  options: currentAnalysisOptions,
  extract(context: SetAnalyzerExtractContext<NgramTableCurrentOptions>): CurrentAnalysisExtracted {
    return computeCurrentAnalysisExtraction(context.members, context.failures);
  },
  optionsDiscipline: {
    sample: NGRAM_TABLE_CURRENT_OPTIONS,
    alternates: NGRAM_TABLE_CURRENT_OPTIONS,
    context: () => disciplineSetContext(FIXTURE_MEMBERS),
  },
});
