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
  DISCIPLINE_TRACE,
  disciplineMember,
  disciplineMetrics,
  disciplineSetContext,
} from '../set-discipline-material.ts';
import { ALTERNATE_COMPARISON_OPTIONS, COMPARISON_COLUMN_IDS, DEFAULT_COMPARISON_OPTIONS, comparisonOptions, type ComparisonOptions } from './options.ts';

/**
 * 比較表Analyzerの抽出。
 *
 * 集合対象（`SetAnalyzerDefinition`）の最初の実例。各メンバー（Setup）の`Metrics`から
 * 列の値を機械的に読み出すだけで、独自の合成指標・優劣判定は行わない（AGENTS.md
 * 「優劣の判定・順位付け・合成スコアを作らない」）。基準（baseline）との比較・
 * 列の表示/非表示は解析設定（`affects: 'view'`）で、抽出結果には含めない
 * （`options.ts`のコメント参照）。
 */

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

export { computeComparisonRowValues, type ComparisonRowValues };

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

const FIXTURE_MEMBERS: readonly AnalyzerSetMember[] = [
  disciplineMember(DISCIPLINE_TARGET_A, { trace: DISCIPLINE_TRACE, metrics: disciplineMetrics(10) }),
  disciplineMember(DISCIPLINE_TARGET_B, { trace: DISCIPLINE_TRACE, metrics: disciplineMetrics(20) }),
];

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
    context: () => disciplineSetContext(FIXTURE_MEMBERS),
  },
});

/** 列の並び（`COMPARISON_COLUMN_IDS`）を外へ再公開。`definition.tsx`のテーブル描画が使う。 */
export { COMPARISON_COLUMN_IDS };
