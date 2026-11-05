import * as v from 'valibot';
import {
  booleanUrlCodec,
  columnSortOption,
  type ColumnSortOptionValue,
  defineOption,
  defineOptions,
  stringSetUrlCodec,
  type OptionUrlCodec,
} from '#analyzers/options.ts';
import { COMPARISON_COLUMN_FORMAT, COMPARISON_COLUMN_IDS, COMPARISON_COLUMN_TEXT, type ComparisonColumnId } from '../comparison-column-text.ts';

export { COMPARISON_COLUMN_IDS, COMPARISON_UNIT_NOTE, type ComparisonColumnId } from '../comparison-column-text.ts';

/**
 * 比較表Analyzerの列。
 *
 * 並べる列は31列。列の値は`analyzers/comparison-column-values.ts`の`computeComparisonRowValues`が、`interpretation/metrics.ts`の
 * `computeMetrics`が返す`Metrics`と`Trace`から読み出すだけの写像で（Bigramの組の種類数の2列とHand Rhythmの9列だけが`Trace`から数える）、
 * 独自の派生指標・合成スコアは作らない
 * （AGENTS.md「優劣の判定・順位付け・合成スコアを作らない」）。
 * 列の名前・説明・表示形式は`analyzers/comparison-column-text.ts`（見出しのⓘから開く説明と散布図も読むため分けてある）。
 */

/**
 * 列ごとの表示形式（一律ルールではなく列の宣言に持たせる）。
 *
 * **率（rate）は率として読める表示にする**（個数・距離の列に小数第1位+%を
 * 付けたり、率の列を整数で丸めて情報を削ったりしない）。列の値の式自体は
 * `computeComparisonRowValues`が持ち、ここは表示の丸めだけを持つ
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

export const COMPARISON_COLUMNS: Readonly<Record<ComparisonColumnId, ComparisonColumnDef>> = Object.fromEntries(
  COMPARISON_COLUMN_IDS.map((id) => [id, { ...COMPARISON_COLUMN_TEXT[id], format: COMPARISON_COLUMN_FORMAT[id] }]),
) as Record<ComparisonColumnId, ComparisonColumnDef>;

/**
 * 「表示する列」の既定で表示しない列。「表示する列」で選べば表に出て、散布図の軸と細い線には表の表示と関係なく使える。
 * 全列を既定にすると、列が増えるほど表の横幅が広がる。他の列から求まる量や、読む場面が限られる量を、列ごとにここへ足す。
 */
export const COMPARISON_DEFAULT_HIDDEN_COLUMNS: ReadonlySet<ComparisonColumnId> = new Set<ComparisonColumnId>([
  'rightLeftPerPressRatio',
  'movedPressShare',
  'perMovedPressUnits',
]);

/** 「表示する列」の既定。全列から、既定で表示しない列を除いた並び。 */
export function defaultVisibleColumns(): ComparisonColumnId[] {
  return COMPARISON_COLUMN_IDS.filter((id) => !COMPARISON_DEFAULT_HIDDEN_COLUMNS.has(id));
}

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
 * 汎用の集合codecが省く空を空文字で残す（省くと既定の列へ戻り、共有先で違う表になる）。
 */
const visibleColumnsUrl: OptionUrlCodec<readonly ComparisonColumnId[]> = (() => {
  const set = stringSetUrlCodec('columns', COMPARISON_COLUMN_IDS, COMPARISON_COLUMN_IDS.length);
  return { ...set, encode: (value) => value.join(',') };
})();

/** 並び替えの状態。`null`は並び替えなし（対象の一覧の順のまま）。 */
export type ComparisonSort = ColumnSortOptionValue<ComparisonColumnId>;

export const comparisonOptions = defineOptions({
  /** 表示する列。空集合は「既定の列を表示」という意味にはしない（要求どおり0列を描く）。 */
  visibleColumns: defineOption<readonly ComparisonColumnId[]>({
    decode: (raw, path, diagnostics) => {
      if (raw === undefined) return defaultVisibleColumns();
      if (!Array.isArray(raw)) {
        diagnostics.push({ path, message: '配列でないため既定の列へ戻しました' });
        return defaultVisibleColumns();
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
    default: defaultVisibleColumns(),
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
