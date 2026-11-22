import { isKanjiDirectLayout } from './kanji-direct.ts';
import { layoutKind } from './kind.ts';
import type { Layout } from './types.ts';
import type { UserLayout } from './user-layouts.ts';

/**
 * 配列を画面で分類して見せる時の名前（かな配列・ローマ字配列・漢直）。
 *
 * 打ち方の種類（`LayoutKind`）とは別に持つ。漢直の配列も、日本語のテキストを `kana-direct` で打つ点はかな配列と同じで、
 * 打ち方・コンボの割り当て・自作配列の保存には `LayoutKind` を使う。この分類は表示にだけ使う。
 */
export type LayoutCategory = 'kana' | 'romaji' | 'kanji-direct';

/** 分類の画面での名前。 */
export const LAYOUT_CATEGORY_LABELS: Readonly<Record<LayoutCategory, string>> = {
  kana: 'かな配列',
  romaji: 'ローマ字配列',
  'kanji-direct': '漢直',
};

/**
 * 配列の分類。漢直にするのは組み込みの配列のうち `isKanjiDirectLayout` が真のものだけで、
 * 自作配列は、面に漢字を置いていても保存した種類（かな配列かローマ字配列）で分ける。
 */
export function layoutCategory(layout: Layout, userLayouts: ReadonlyMap<string, UserLayout>): LayoutCategory {
  const user = userLayouts.get(layout.id);
  if (user === undefined && isKanjiDirectLayout(layout)) return 'kanji-direct';
  return layoutKind(layout, userLayouts) === 'kana' ? 'kana' : 'romaji';
}
