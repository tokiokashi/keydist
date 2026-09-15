import { THUMB_KEY } from '../geometry.ts';
import { fromFaces, type Face, type FaceMode, type Layout } from './types.ts';

/**
 * 月配列 2-263 式の登録枠（#22）。かなの配置は #22 の出典から埋める。
 * 準公式定義: https://github.com/k-ayaki/dvorakj_2023
 * 解説ページ: https://jisx6004.client.jp/tsuki.html
 */

const EMPTY_ROWS = ['', '', '', ''] as const;
const emptyFace = (trigger: string[], mode: FaceMode): Face => ({ trigger, mode, rows: EMPTY_ROWS });

const layout: Layout = fromFaces('tsuki-2-263', '月 2-263 式', [
  emptyFace([], 'prefix'),
  emptyFace(['d'], 'prefix'),
  emptyFace(['k'], 'prefix'),
]);
layout.legends.delete(THUMB_KEY.LT);
layout.legends.delete(THUMB_KEY.RT);
export const TSUKI_2_263 = layout;
