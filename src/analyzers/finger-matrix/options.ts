import * as v from 'valibot';
import { columnSortOption, type ColumnSortOptionValue, defineOption, defineOptions, picklistUrlCodec } from '#analyzers/options.ts';
import { ADJACENT_PAIRS, ALL_FINGERS } from '#input/shapes/geometry.ts';

/**
 * 配列×指のマトリックスの解析設定。
 *
 * - `surface`: 表に出す面。抽出は全ての面をまとめて持つので、面を切り替えても抽出は走り直さない
 *   （`affects: 'view'`）。面を足す時は、この一覧と抽出の面の定義（`extract.ts`）に足す
 * - `sort`: 列の見出しで切り替える並び替え。列のidは指（`LP`など）か指の組（`LP-LR`など）で、
 *   指の面どうし・指間の面どうしでは同じidの列が並ぶので、面を切り替えても並び替えを保てる。
 *   今の面に無い列で並び替えている時は、並び替えていない状態として扱う（描く側が判断する）
 */
export const FINGER_MATRIX_SURFACE_IDS = ['presses', 'distance', 'pairMean', 'pairStdDev', 'sfbCount', 'sfbRate', 'sfbShare'] as const;
export type FingerMatrixSurfaceId = (typeof FINGER_MATRIX_SURFACE_IDS)[number];

/** 列のid。指の列は指のid、指間の列は隣り合う2本の指のidを`-`でつないだもの（抽出の列のidと同じ）。 */
export const FINGER_MATRIX_COLUMN_IDS: readonly string[] = [
  ...ALL_FINGERS,
  ...ADJACENT_PAIRS.map((pair) => `${pair[0]}-${pair[1]}`),
];

export type FingerMatrixSort = ColumnSortOptionValue<string>;

export const fingerMatrixOptions = defineOptions({
  surface: defineOption<FingerMatrixSurfaceId>({
    schema: v.picklist(FINGER_MATRIX_SURFACE_IDS),
    default: 'distance',
    affects: 'view',
    url: picklistUrlCodec('surface', FINGER_MATRIX_SURFACE_IDS),
    label: '見る量',
  }),
  sort: columnSortOption('sort', FINGER_MATRIX_COLUMN_IDS),
});

export type FingerMatrixOptions = typeof fingerMatrixOptions.defaultOptions;

export const DEFAULT_FINGER_MATRIX_OPTIONS: FingerMatrixOptions = fingerMatrixOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_FINGER_MATRIX_OPTIONS: FingerMatrixOptions = {
  surface: 'presses',
  sort: { column: 'LI', direction: 'desc' },
};
