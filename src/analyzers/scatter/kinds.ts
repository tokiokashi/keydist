import type { LayoutCategory } from '#input/layouts/layout-category.ts';

/**
 * 散布図の点を分ける配列の分類ごとの色と形。
 *
 * 色は対象の色（`--target-color-N`）と別の3色（`theme.css`の`--kind-color-*`）、形は対象の印の形のうち3つ。
 * 種類は色と形の両方で示すので、色を見分けにくくても区別できる。形は他のペインの対象の印と同じになりうるが、
 * 色が対象の色と別なので、色と形の組では紛れない。
 */
export interface ScatterKindStyle {
  readonly label: string;
  /** 点の形。`ui/theme/target-marks.ts`の対象の印の形から3つを使う。 */
  readonly shape: 'diamond' | 'circle' | 'triangle';
  /** 凡例の文に書く、形の名前。 */
  readonly shapeName: string;
  /** `theme.css`の色のトークン。 */
  readonly color: string;
  /** 凡例の文に書く、色の名前。 */
  readonly colorName: string;
}

export const SCATTER_KIND_ORDER: readonly LayoutCategory[] = ['kana', 'romaji', 'kanji-direct'];

export const SCATTER_KIND_STYLES: Readonly<Record<LayoutCategory, ScatterKindStyle>> = {
  kana: { label: 'かな配列', shape: 'diamond', shapeName: '菱形', color: 'var(--kind-color-kana)', colorName: '赤' },
  romaji: { label: 'ローマ字配列', shape: 'circle', shapeName: '丸', color: 'var(--kind-color-romaji)', colorName: '濃い青' },
  'kanji-direct': { label: '漢直', shape: 'triangle', shapeName: '三角', color: 'var(--kind-color-kanji-direct)', colorName: '黄緑' },
};
