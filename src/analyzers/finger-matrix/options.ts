import * as v from 'valibot';
import { defineOption, defineOptions, picklistUrlCodec } from '#analyzers/options.ts';

/**
 * 配列×指のマトリックスの解析設定。
 *
 * - `surface`: 表に出す面。抽出は全ての面をまとめて持つので、面を切り替えても抽出は走り直さない
 *   （`affects: 'view'`）。面を足す時は、この一覧と抽出の面の定義（`extract.ts`）に足す
 */
export const FINGER_MATRIX_SURFACE_IDS = ['presses', 'distance', 'pairMean', 'pairStdDev', 'sfbCount', 'sfbRate', 'sfbShare'] as const;
export type FingerMatrixSurfaceId = (typeof FINGER_MATRIX_SURFACE_IDS)[number];

export const fingerMatrixOptions = defineOptions({
  surface: defineOption<FingerMatrixSurfaceId>({
    schema: v.picklist(FINGER_MATRIX_SURFACE_IDS),
    default: 'distance',
    affects: 'view',
    url: picklistUrlCodec('surface', FINGER_MATRIX_SURFACE_IDS),
    label: '見る量',
  }),
});

export type FingerMatrixOptions = typeof fingerMatrixOptions.defaultOptions;

export const DEFAULT_FINGER_MATRIX_OPTIONS: FingerMatrixOptions = fingerMatrixOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_FINGER_MATRIX_OPTIONS: FingerMatrixOptions = {
  surface: 'presses',
};
