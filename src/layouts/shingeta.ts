import { THUMB_KEY } from '../geometry.ts';
import { fromFaces, type Face, type FaceMode, type Layout } from './types.ts';

/**
 * 新下駄配列の登録枠（#19）。かなの配置は #19 の出典から埋める。
 * 準公式定義: https://github.com/k-ayaki/dvorakj_2023
 * 考案者の記事: http://kouy.exblog.jp/
 * 配列紹介記事: https://kouy.exblog.jp/13627994/
 */

const EMPTY_ROWS = ['', '', '', ''] as const;
const emptyFace = (trigger: string[], mode: FaceMode): Face => ({ trigger, mode, rows: EMPTY_ROWS });

const layout: Layout = fromFaces('shingeta', '新下駄', [
  emptyFace([], 'simultaneous'),
  emptyFace(['k'], 'simultaneous'),
  emptyFace(['d'], 'simultaneous'),
  emptyFace(['l'], 'simultaneous'),
  emptyFace(['s'], 'simultaneous'),
  emptyFace(['i'], 'simultaneous'),
  emptyFace(['o'], 'simultaneous'),
]);
layout.legends.set(THUMB_KEY.LT, '使わない');
layout.legends.set(THUMB_KEY.RT, '使わない');

export const SHINGETA = layout;
