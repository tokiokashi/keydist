import { THUMB_KEY } from '../geometry.ts';
import { fromFaces, type Face, type FaceMode, type Layout } from './types.ts';

/**
 * 親指シフト（NICOLA）の登録枠（#23）。かなの配置は #23 の出典から埋める。
 * 定義の出どころ: NICOLA 配列規格書 http://nicola.sunicom.co.jp/spec/kikaku.htm
 * 準公式定義: https://github.com/k-ayaki/benizara
 * 準公式定義: https://github.com/k-ayaki/dvorakj_2023
 */

const EMPTY_ROWS = ['', '', '', ''] as const;
const emptyFace = (trigger: string[], mode: FaceMode): Face => ({ trigger, mode, rows: EMPTY_ROWS });

const layout: Layout = fromFaces('nicola', '親指シフト（NICOLA）', [
  emptyFace([], 'simultaneous'),
  emptyFace([THUMB_KEY.LT], 'simultaneous'),
  emptyFace([THUMB_KEY.RT], 'simultaneous'),
]);
layout.legends.set(THUMB_KEY.LT, '無変換');
layout.legends.set(THUMB_KEY.RT, '変換');

export const NICOLA = layout;
