import * as v from 'valibot';
import { booleanUrlCodec, columnSortOption, type ColumnSortOptionValue, defineOption, defineOptions, stringSetUrlCodec, type OptionUrlCodec } from '#analyzers/options.ts';
import { COMPARISON_COLUMN_IDS, COMPARISON_COLUMN_TEXT, type ComparisonColumnId } from './column-text.ts';

export { COMPARISON_COLUMN_IDS, COMPARISON_UNIT_NOTE, type ComparisonColumnId } from './column-text.ts';

/**
 * 比較表Analyzerの列。
 *
 * 旧実装（`src/legacy/analyzer-metrics-content.tsx`の`compareMetricValues`・
 * `results-view.ts`の`COMPARE_HEADERS`）が並べていた13列に、右手の割合の2列を足した範囲にする（13列は同じ式）
 * （AGENTS.md「作り直しの範囲は新しい構成に残るかで決める」: 列の中身・式そのものは
 * `interpretation/metrics.ts`の`Metrics`から機械的に読める値で、旧実装固有の事情に
 * 依存しないため、そのまま引き継ぐ）。列の値は`interpretation/metrics.ts`の
 * `computeMetrics`が返す`Metrics`から`extract.ts`（`computeComparisonRowValues`）が
 * 読み出すだけの単純な写像で、独自の派生指標・合成スコアは作らない
 * （AGENTS.md「優劣の判定・順位付け・合成スコアを作らない」）。
 * 列の名前と説明は`column-text.ts`（見出しのⓘから開く説明も読むため分けてある）。
 */

/**
 * 列ごとの表示形式（一律ルールではなく列の宣言に持たせる）。
 *
 * 桁数・%表記は旧実装（`src/legacy/analyzer-metrics-content.tsx`の`COMPARE_FORMATS`）と
 * 同じ丸めに揃える。ここで揃えたいのは「旧側に合わせること」自体ではなく、
 * **率（rate）は率として読める表示にする**こと（個数・距離の列に小数第1位+%を
 * 付けたり、率の列を整数で丸めて情報を削ったりしない）。列の値の式自体は
 * `extract.ts`の`computeComparisonRowValues`が持ち、ここは表示の丸めだけを持つ
 * （値そのものを変えない）。
 */
export interface ComparisonColumnDef {
  /** 見出しの短い名前。 */
  readonly label: string;
  /** この列の説明（見出しのⓘから開く説明に出す）。 */
  readonly description: string;
  /** 値をそのまま渡すと表示用の文字列を返す。丸め・%表記はここに閉じる。 */
  readonly format: (value: number) => string;
}

const fixed = (digits: number) => (value: number): string => value.toFixed(digits);
const percent = (value: number): string => `${value.toFixed(1)}%`;
const count = (value: number): string => `${value}`;

export const COMPARISON_COLUMNS: Readonly<Record<ComparisonColumnId, ComparisonColumnDef>> = {
  actions: {
    ...COMPARISON_COLUMN_TEXT.actions,
    format: count,
  },
  totalUnits: {
    ...COMPARISON_COLUMN_TEXT.totalUnits,
    format: fixed(0),
  },
  meanPerStroke: {
    ...COMPARISON_COLUMN_TEXT.meanPerStroke,
    format: fixed(3),
  },
  perCharUnits: {
    ...COMPARISON_COLUMN_TEXT.perCharUnits,
    format: fixed(3),
  },
  perCharSteps: {
    ...COMPARISON_COLUMN_TEXT.perCharSteps,
    format: fixed(3),
  },
  perCharPresses: {
    ...COMPARISON_COLUMN_TEXT.perCharPresses,
    format: fixed(3),
  },
  singleTapLayerRate: {
    ...COMPARISON_COLUMN_TEXT.singleTapLayerRate,
    format: percent,
  },
  singleTapRate: {
    ...COMPARISON_COLUMN_TEXT.singleTapRate,
    format: percent,
  },
  singleKeyRate: {
    ...COMPARISON_COLUMN_TEXT.singleKeyRate,
    format: percent,
  },
  sameFinger: {
    ...COMPARISON_COLUMN_TEXT.sameFinger,
    format: count,
  },
  sameFingerRate: {
    ...COMPARISON_COLUMN_TEXT.sameFingerRate,
    format: percent,
  },
  adjacentMean: {
    ...COMPARISON_COLUMN_TEXT.adjacentMean,
    format: fixed(3),
  },
  adjacentStdDev: {
    ...COMPARISON_COLUMN_TEXT.adjacentStdDev,
    format: fixed(3),
  },
  rightHandDistanceShare: {
    ...COMPARISON_COLUMN_TEXT.rightHandDistanceShare,
    format: percent,
  },
  rightHandPressShare: {
    ...COMPARISON_COLUMN_TEXT.rightHandPressShare,
    format: percent,
  },
} as const;

function isComparisonColumnId(value: string): value is ComparisonColumnId {
  return (COMPARISON_COLUMN_IDS as readonly string[]).includes(value);
}

/**
 * 比較表の解析設定。
 *
 * **どれも`affects: 'view'`にする。** 比較表が並べる数値（`Metrics`由来の列）は
 * `SetAnalyzerExtractContext.members`から機械的に決まり、この解析設定のどの項目を
 * 変えても値そのものは変わらない（列の表示/非表示・基準比の表示可否はどちらも
 * 「どう見せるか」で、「何を計算するか」ではない）。「解析設定は抽出に効く
 * ものと見た目だけのものを宣言する」の帰結として、抽出結果（行の集合と各行の
 * 生値）はAnalyzerの解析設定を変えても再計算されない。
 *
 * **基準（baseline）対象はここに置かない。** 集合を見るAnalyzerはSetupの集合を対象にし、集合はそのページ自身が
 * （手持ちからの選択・並び順・基準として）持つので、基準は「対象の集合」の
 * 一部（どのSetupを比べるか・どの順で並べるか・どれを基準にするか）としてホスト側の
 * 資産（`engine/multi-target-selection.ts`の`multiTargetSelection`。MultiのAnalyzerが
 * 共有する集合）が持つ。
 * Analyzerの解析設定（この`comparisonOptions`）は「同じ集合をどう見せるか」だけを
 * 持つ個人設定で、集合そのもの（対象）とは別の軸にする（`analyzers/contract.ts`の
 * `AnalyzerInstance.target`と`options`が別フィールドなのと同じ区別）。
 */
/**
 * 表示する列のURL codec。並びごと読み書きする。空（0列）も「0列にした」という設定なので、
 * 汎用の集合codecが省く空を空文字で残す（省くと既定の全列へ戻り、共有先で違う表になる）。
 */
const visibleColumnsUrl: OptionUrlCodec<readonly ComparisonColumnId[]> = (() => {
  const set = stringSetUrlCodec('columns', COMPARISON_COLUMN_IDS, COMPARISON_COLUMN_IDS.length);
  return { ...set, encode: (value) => value.join(',') };
})();

/** 並び替えの状態。`null`は並び替えなし（対象の一覧の順のまま）。 */
export type ComparisonSort = ColumnSortOptionValue<ComparisonColumnId>;

export const comparisonOptions = defineOptions({
  /** 表示する列。空集合は「全列表示」という意味にはしない（要求どおり0列を描く）。 */
  visibleColumns: defineOption<readonly ComparisonColumnId[]>({
    decode: (raw, path, diagnostics) => {
      if (raw === undefined) return [...COMPARISON_COLUMN_IDS];
      if (!Array.isArray(raw)) {
        diagnostics.push({ path, message: '配列でないため既定値（全列）へ戻しました' });
        return [...COMPARISON_COLUMN_IDS];
      }
      const seen = new Set<ComparisonColumnId>();
      const result: ComparisonColumnId[] = [];
      for (const item of raw) {
        if (typeof item === 'string' && isComparisonColumnId(item) && !seen.has(item)) {
          seen.add(item);
          result.push(item);
        } else {
          diagnostics.push({ path, message: `未知の列「${String(item)}」を捨てました` });
        }
      }
      return result;
    },
    default: [...COMPARISON_COLUMN_IDS],
    affects: 'view',
    url: visibleColumnsUrl,
  }),
  /**
   * 基準がある時、各セルを絶対値と並べて基準比（%）でも見せるか。
   * 優劣を示す色は付けない（AGENTS.md「良い/悪いの色付けはしない」）——ここは
   * 数値を出すか出さないかだけの切り替え。
   */
  showBaselineRatio: defineOption<boolean>({
    schema: v.boolean(),
    default: true,
    affects: 'view',
    url: booleanUrlCodec('baselineRatio'),
  }),
  /**
   * 並び替え（列の見出しを押して切り替える。昇順 → 降順 → 解除）。表の行の表示順だけを変え、
   * 対象の集合の順（N感度と共有している値）は変えない。値は表に出ている数値（基準比ではなく値）で並べる。
   * 表示する列とは独立に効く（列を隠しても並びは保たれ、解析設定の並び替えの欄に今の状態が出る）。
   */
  sort: columnSortOption('sort', COMPARISON_COLUMN_IDS),
});

export type ComparisonOptions = typeof comparisonOptions.defaultOptions;

export const DEFAULT_COMPARISON_OPTIONS: ComparisonOptions = comparisonOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_COMPARISON_OPTIONS: ComparisonOptions = {
  visibleColumns: ['actions', 'totalUnits'],
  showBaselineRatio: false,
  sort: { column: 'totalUnits', direction: 'desc' },
};
