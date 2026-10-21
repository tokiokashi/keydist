import type { SegmenterInfo, SegmentationOrigin } from '#input/text/segmentation.ts';

/**
 * 文節の区切りを使うAnalyzerが、区切りの出どころと分割器を示す文面。Run Chartと同じ文面にそろえるため、ここに1つだけ置く。
 * 値の定義は `docs/segment-metrics.md`「文節の区切り」。
 */
export const SEGMENTATION_ORIGIN_TEXT: Readonly<Record<SegmentationOrigin, string>> = {
  dictionary: '区切りの出どころは、漢字を辞書で読みに直した語の境目へ寄せて写した文節の区切りです。',
  'kana-only':
    '原文が漢字を含まないので、前処理の対応だけで区切りを写しています。かなだけの文では分割器の精度が落ちる見込みですが、精度は測っていません。',
  'dictionary-unavailable': '辞書を読み込めず漢字を読みに直していないので、前処理の対応だけで区切りを写しています。',
};

/** 「分割器はBudouX 0.10.0（日本語のモデル）です。」の後に出どころの文を続けた文。 */
export function segmentationSourceSentence(splitter: SegmenterInfo, origin: SegmentationOrigin): string {
  return `分割器は${splitter.name} ${splitter.version}（日本語のモデル）です。${SEGMENTATION_ORIGIN_TEXT[origin]}`;
}
