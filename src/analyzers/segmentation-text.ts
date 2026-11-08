import type { SegmenterInfo, SegmentationOrigin } from '#input/text/segmentation.ts';

/**
 * 文節の区切りを使うAnalyzerが、図や表の横のⓘに出す区切りの出どころと分割器。Run Chartと同じ文面にそろえるため、ここに1つだけ置く。
 * 値の定義は `docs/segment-metrics.md`「文節の区切り」。ⓘの見た目は `segmentation-source-button.tsx` が持つ。
 */

/** ⓘの名前。 */
export const SEGMENTATION_SOURCE_NAME = '文節の区切り';
/** ⓘの説明。 */
export const SEGMENTATION_SOURCE_DESCRIPTION = '文節の区切りを求めた分割器と、その出どころです。';

const ORIGIN_ITEM: Readonly<Record<SegmentationOrigin, string>> = {
  dictionary: '漢字の読みを辞書で求め、語の境目に合わせた区切りです。',
  'kana-only': '原文に漢字が無いので、辞書の読みは使っていません。かなだけの文では分割器の精度が落ちる見込みですが、精度は測っていません。',
  'dictionary-unavailable': '辞書を読み込めなかったので、漢字の読みは使っていません。',
};

/** ⓘの一覧の項目（分割器と区切りの出どころ）。 */
export function segmentationSourceItems(
  splitter: SegmenterInfo,
  origin: SegmentationOrigin,
): readonly { readonly name: string; readonly description: string }[] {
  return [
    { name: '分割器', description: `${splitter.name} ${splitter.version}（日本語のモデル）` },
    { name: '区切りの出どころ', description: ORIGIN_ITEM[origin] },
  ];
}
