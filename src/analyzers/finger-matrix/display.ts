import type { FingerMatrixOkRow } from './extract.ts';
import type { FingerMatrixSurfaceId } from './options.ts';

/**
 * 抽出の値を表のセルに出す形へ直す。抽出の値は計算し直さず、表示のための割り算と書式だけを行う。
 *
 * - 押下数・移動距離は入力1文字あたり（抽出の値を行の`inputChars`で割る）。生の値はツールチップに出す
 * - 指間距離の2面は距離 [u] のまま、同指連続の回数は生の回数
 * - 同指連続の比率・割合は百分率。抽出の値（分母が0なら0）をそのまま使うが、分母が0の時は
 *   0%と読めてしまうので、値を持たない扱い（「—」）にする。ツールチップは分子と分母の回数をそのまま出す
 * - 書式は`toFixed`の桁数だけで決め、色や強調に使う判定は持たない
 */
export interface FingerMatrixCell {
  /** セルに出す文字。値を持たない時は「—」。 */
  readonly text: string;
  /** 並び替えに使う、表に出ている値。値を持たない時は`undefined`。 */
  readonly value: number | undefined;
  /** マウスを乗せた時に出す、生の値や分子・分母。列の名前は含めない。 */
  readonly tip: string;
}

export const EMPTY_CELL_TEXT = '—';

const perChar = (total: number, inputChars: number): number | undefined => (inputChars === 0 ? undefined : total / inputChars);

function valueCell(value: number | undefined, digits: number, suffix: string, tip: string): FingerMatrixCell {
  return { text: value === undefined ? EMPTY_CELL_TEXT : `${value.toFixed(digits)}${suffix}`, value, tip };
}

/**
 * 面`surface`の、列`index`（面の列の並びでの位置）のセル。
 * 指の面の列の並びは`ALL_FINGERS`と同じなので、`fingerPressEvents[index]`が同じ指の押した回数になる。
 */
export function fingerMatrixCell(surface: FingerMatrixSurfaceId, row: FingerMatrixOkRow, index: number): FingerMatrixCell {
  const raw = row.surfaces[surface][index] ?? 0;
  switch (surface) {
    case 'presses':
      return valueCell(perChar(raw, row.inputChars), 3, '', `押下数${raw}回 / 入力${row.inputChars}文字`);
    case 'distance':
      return valueCell(perChar(raw, row.inputChars), 3, '', `移動距離${raw.toFixed(1)} u / 入力${row.inputChars}文字`);
    case 'pairMean':
      return valueCell(raw, 3, '', `指間距離の平均：${raw.toFixed(3)} u`);
    case 'pairStdDev':
      return valueCell(raw, 3, '', `指間距離の標準偏差：${raw.toFixed(3)} u`);
    case 'sfbCount':
      return valueCell(raw, 0, '', `同指連続${raw}回`);
    case 'sfbRate': {
      const count = row.surfaces.sfbCount[index] ?? 0;
      const presses = row.fingerPressEvents[index] ?? 0;
      return valueCell(presses === 0 ? undefined : raw, 1, '%', `同指連続${count}回 / この指で押した回数${presses}回`);
    }
    case 'sfbShare': {
      const count = row.surfaces.sfbCount[index] ?? 0;
      const total = row.surfaces.sfbCount.reduce((sum, item) => sum + item, 0);
      return valueCell(total === 0 ? undefined : raw, 1, '%', `同指連続${count}回 / 全体の同指連続${total}回`);
    }
  }
}
