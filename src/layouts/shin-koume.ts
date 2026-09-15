import { THUMB_KEY } from '../geometry.ts';
import { fromFaces, type Face, type FaceMode, type Layout } from './types.ts';

/**
 * シン蜂蜜小梅の登録枠（#21）。かなの配置は #21 の出典から埋める。
 * 発表記事: http://61degc.seesaa.net/article/483912281.html
 * 設定ファイル配布記事: http://61degc.seesaa.net/article/483919146.html
 * 紹介記事: https://oookaworks.seesaa.net/article/483920902.html
 * 公式サイト（現在 404）: http://8x3koume.na.coocan.jp/
 */

const EMPTY_ROWS = ['', '', '', ''] as const;
const emptyFace = (trigger: string[], mode: FaceMode): Face => ({ trigger, mode, rows: EMPTY_ROWS });

const layout: Layout = fromFaces('shin-koume', 'シン蜂蜜小梅', [
  emptyFace([], 'simultaneous'),
  emptyFace([THUMB_KEY.LT], 'simultaneous'),
  emptyFace([THUMB_KEY.RT], 'simultaneous'),
  emptyFace([THUMB_KEY.LT, THUMB_KEY.RT], 'simultaneous'),
  emptyFace(['g'], 'simultaneous'),
  emptyFace(['h'], 'simultaneous'),
]);
layout.legends.set(THUMB_KEY.LT, '親指左');
layout.legends.set(THUMB_KEY.RT, '親指右');

export const SHIN_KOUME = layout;
