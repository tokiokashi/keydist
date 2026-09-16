import { THUMB_KEY } from '../geometry.ts';
import { fromFaces, type Face, type FaceMode, type Layout } from './types.ts';

/**
 * 飛鳥の登録枠（#20）。かなの配置は #20の出典から埋める。
 * 準公式定義: https://github.com/k-ayaki/benizara
 * 発表記事: http://61degc.seesaa.net/article/483912281.html
 * 設定ファイル配布記事: http://61degc.seesaa.net/article/483919146.html
 * 紹介記事: https://oookaworks.seesaa.net/article/483920902.html
 * 公式ブログ: https://ameblo.jp/asuka-layout/
 */

const EMPTY_ROWS = ['', '', '', ''] as const;
const emptyFace = (trigger: string[], mode: FaceMode): Face => ({ trigger, mode, rows: EMPTY_ROWS });

const layout: Layout = fromFaces('asuka', '飛鳥', [
  emptyFace([], 'simultaneous'),
  emptyFace([THUMB_KEY.LT], 'simultaneous'),
  emptyFace([THUMB_KEY.RT], 'simultaneous'),
]);
layout.legends.set(THUMB_KEY.LT, '左親指');
layout.legends.set(THUMB_KEY.RT, '右親指');

export const ASUKA = layout;
