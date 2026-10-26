import { withComposedOutputs, type Layout } from './types.ts';

/** 後置の濁点で合成する時の、元のかな → 合成後のかな。 */
export const DAKUTEN: Readonly<Record<string, string>> = {
  う: 'ゔ',
  か: 'が',
  き: 'ぎ',
  く: 'ぐ',
  け: 'げ',
  こ: 'ご',
  さ: 'ざ',
  し: 'じ',
  す: 'ず',
  せ: 'ぜ',
  そ: 'ぞ',
  た: 'だ',
  ち: 'ぢ',
  つ: 'づ',
  て: 'で',
  と: 'ど',
  は: 'ば',
  ひ: 'び',
  ふ: 'ぶ',
  へ: 'べ',
  ほ: 'ぼ',
};

/** 後置の半濁点で合成する時の、元のかな → 合成後のかな。 */
export const HANDAKUTEN: Readonly<Record<string, string>> = {
  は: 'ぱ',
  ひ: 'ぴ',
  ふ: 'ぷ',
  へ: 'ぺ',
  ほ: 'ぽ',
};

export const DAKUTEN_MARK = '゛';
export const HANDAKUTEN_MARK = '゜';

/** 濁点・半濁点を後から打って合成するかの指定。 */
export interface KanaMarkComposition {
  readonly dakuten: boolean;
  readonly handakuten: boolean;
}

/** `table` のうち、元のかなが配列に在るものだけに絞る。 */
function presentSources(layout: Layout, table: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(table).filter(([source]) => layout.canonicalInputs.has(source)));
}

/**
 * 配列に在る元のかなへ、濁点・半濁点を後置して打つ入力を足す。
 * 合成記号（゛・゜）が配列のどの面にも無い時は投げる。元のかなが配列に無いものは合成しない。
 */
export function composeKanaMarks(layout: Layout, composition: KanaMarkComposition, context: string): Layout {
  let result = layout;
  if (composition.dakuten) {
    result = withComposedOutputs(result, presentSources(layout, DAKUTEN), DAKUTEN_MARK, context);
  }
  if (composition.handakuten) {
    result = withComposedOutputs(result, presentSources(layout, HANDAKUTEN), HANDAKUTEN_MARK, context);
  }
  return result;
}
