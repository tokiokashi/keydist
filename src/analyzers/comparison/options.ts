import * as v from 'valibot';
import { defineOption, defineOptions } from '#analyzers/options.ts';

/**
 * 比較表Analyzerの列（#544 Phase 3「集合を対象にする最初のAnalyzer（比較表）」）。
 *
 * 旧実装（`src/legacy/analyzer-metrics-content.tsx`の`compareMetricValues`・
 * `results-view.ts`の`COMPARE_HEADERS`）が並べていた13列と同じ範囲・同じ式にする
 * （AGENTS.md「作り直しの範囲は新しい構成に残るかで決める」: 列の中身・式そのものは
 * `interpretation/metrics.ts`の`Metrics`から機械的に読める値で、旧実装固有の事情に
 * 依存しないため、そのまま引き継ぐ）。列の値は`interpretation/metrics.ts`の
 * `computeMetrics`が返す`Metrics`から`extract.ts`（`computeComparisonRowValues`）が
 * 読み出すだけの単純な写像で、独自の派生指標・合成スコアは作らない
 * （AGENTS.md「優劣の判定・順位付け・合成スコアを作らない」）。
 */
export const COMPARISON_COLUMN_IDS = [
  'actions',
  'totalUnits',
  'meanPerStroke',
  'perCharUnits',
  'perCharSteps',
  'perCharPresses',
  'singleTapLayerRate',
  'singleTapRate',
  'singleKeyRate',
  'sameFinger',
  'sameFingerRate',
  'adjacentMean',
  'adjacentStdDev',
] as const;

export type ComparisonColumnId = (typeof COMPARISON_COLUMN_IDS)[number];

/**
 * 列ごとの表示形式（レビュー対応: 一律ルールではなく列の宣言に持たせる）。
 *
 * 桁数・%表記は旧実装（`src/legacy/analyzer-metrics-content.tsx`の`COMPARE_FORMATS`）と
 * 同じ丸めに揃える。ここで揃えたいのは「旧側に合わせること」自体ではなく、
 * **率（rate）は率として読める表示にする**こと（個数・距離の列に小数第1位+%を
 * 付けたり、率の列を整数で丸めて情報を削ったりしない）。列の値の式自体は
 * `extract.ts`の`computeComparisonRowValues`が持ち、ここは表示の丸めだけを持つ
 * （値そのものを変えない）。
 */
export interface ComparisonColumnDef {
  readonly label: string;
  /** 値をそのまま渡すと表示用の文字列を返す。丸め・%表記はここに閉じる。 */
  readonly format: (value: number) => string;
}

const fixed = (digits: number) => (value: number): string => value.toFixed(digits);
const percent = (value: number): string => `${value.toFixed(1)}%`;
const count = (value: number): string => `${value}`;

export const COMPARISON_COLUMNS: Readonly<Record<ComparisonColumnId, ComparisonColumnDef>> = {
  actions: { label: '動作数', format: count },
  totalUnits: { label: '距離 [u]', format: fixed(0) },
  meanPerStroke: { label: 'u/打鍵', format: fixed(3) },
  perCharUnits: { label: 'u/文字', format: fixed(3) },
  perCharSteps: { label: '動作数/文字', format: fixed(3) },
  perCharPresses: { label: '押下/文字', format: fixed(3) },
  singleTapLayerRate: { label: '単打面率', format: percent },
  singleTapRate: { label: '単打率', format: percent },
  singleKeyRate: { label: '1キー率', format: percent },
  sameFinger: { label: '同指', format: count },
  sameFingerRate: { label: '同指率', format: percent },
  adjacentMean: { label: '指間mean [u]', format: fixed(3) },
  adjacentStdDev: { label: '指間σ [u]', format: fixed(3) },
} as const;

function isComparisonColumnId(value: string): value is ComparisonColumnId {
  return (COMPARISON_COLUMN_IDS as readonly string[]).includes(value);
}

/**
 * 比較表の解析設定（#544指示書「解析設定は宣言でaffectsを正しく分類」）。
 *
 * **どれも`affects: 'view'`にする。** 比較表が並べる数値（`Metrics`由来の13列）は
 * `SetAnalyzerExtractContext.members`から機械的に決まり、この解析設定のどの項目を
 * 変えても値そのものは変わらない（列の表示/非表示・基準比の表示可否はどちらも
 * 「どう見せるか」で、「何を計算するか」ではない）。#544 §7の「解析設定は抽出に効く
 * ものと見た目だけのものを宣言する」の帰結として、抽出結果（行の集合と各行の13列の
 * 生値）はAnalyzerの解析設定を変えても再計算されない。
 *
 * **基準（baseline）対象はここに置かない。** #544 §6「集合を見るAnalyzerは
 * Setupの集合を対象にし、集合もそのページ自身が持つ」・指示書「ページ自身が
 * Setupの集合（手持ちからの選択・並び順・基準）を持つ」に従い、基準は「対象の集合」の
 * 一部（どのSetupを比べるか・どの順で並べるか・どれを基準にするか）としてホスト側の
 * 資産（`engine/analyzer-set-selection.ts`の`analyzerSetSelections`。集合対象Analyzer
 * 全般が使う汎用の資産で、比較表はこの`definition.id`をキーに引く）が持つ。
 * Analyzerの解析設定（この`comparisonOptions`）は「同じ集合をどう見せるか」だけを
 * 持つ個人設定で、集合そのもの（対象）とは別の軸にする（`analyzers/contract.ts`の
 * `AnalyzerInstance.target`と`options`が別フィールドなのと同じ区別）。
 */
export const comparisonOptions = defineOptions({
  /** 表示する列。空集合は「全列表示」という意味にはしない（要求どおり0列を描く）。 */
  visibleColumns: defineOption<readonly ComparisonColumnId[]>({
    decode: (raw, path, diagnostics) => {
      if (raw === undefined) return [...COMPARISON_COLUMN_IDS];
      if (!Array.isArray(raw)) {
        diagnostics.push({ path, message: '配列でないため既定値（全列）へ戻した' });
        return [...COMPARISON_COLUMN_IDS];
      }
      const seen = new Set<ComparisonColumnId>();
      const result: ComparisonColumnId[] = [];
      for (const item of raw) {
        if (typeof item === 'string' && isComparisonColumnId(item) && !seen.has(item)) {
          seen.add(item);
          result.push(item);
        } else {
          diagnostics.push({ path, message: `未知の列「${String(item)}」を捨てた` });
        }
      }
      return result;
    },
    default: [...COMPARISON_COLUMN_IDS],
    affects: 'view',
  }),
  /**
   * 基準がある時、各セルを絶対値と並べて基準比（%）でも見せるか。
   * 優劣を示す色は付けない（AGENTS.md「良い/悪いの色付けはしない」）——ここは
   * 数値を出すか出さないかだけの切り替え。
   */
  showBaselineRatio: defineOption<boolean>({ schema: v.boolean(), default: true, affects: 'view' }),
});

export type ComparisonOptions = typeof comparisonOptions.defaultOptions;

export const DEFAULT_COMPARISON_OPTIONS: ComparisonOptions = comparisonOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_COMPARISON_OPTIONS: ComparisonOptions = {
  visibleColumns: ['actions', 'totalUnits'],
  showBaselineRatio: false,
};
