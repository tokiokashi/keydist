import type { SegmenterInfo } from '#input/text/segmentation.ts';

/**
 * 文節の分割器の名前と版。`package.json` の `budoux` の版と同じにする（テストが一致を確かめる）。
 * 分割器本体を読み込まずに、数値の条件へ記録できるよう別のファイルに置く。
 */
export const BUNSETSU_SPLITTER: SegmenterInfo = { name: 'BudouX', version: '0.10.0' };
