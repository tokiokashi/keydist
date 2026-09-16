import { THUMB_KEY } from '../geometry.ts';
import { fromFaces, type Face, type FaceMode, type Layout } from './types.ts';

/**
 * 新JISの登録枠（#24）。かなの配置は #24の出典から埋める。
 * 準公式定義: https://github.com/k-ayaki/dvorakj_2023
 * 配列図の出典: http://www.ykanda.jp/input/jis/jis.htm
 * 逐次シフトと通常シフトを別の定義として登録する。
 */

const EMPTY_ROWS = ['', '', '', ''] as const;
const emptyFace = (trigger: string[], mode: FaceMode): Face => ({ trigger, mode, rows: EMPTY_ROWS });

function makeLayout(id: string, name: string, mode: FaceMode): Layout {
  const layout = fromFaces(id, name, [
    emptyFace([], mode),
    emptyFace([THUMB_KEY.LT], mode),
    emptyFace([THUMB_KEY.RT], mode),
  ]);
  layout.legends.set(THUMB_KEY.LT, 'シフト');
  layout.legends.set(THUMB_KEY.RT, 'シフト');
  return layout;
}

export const SHIN_JIS_PREFIX = makeLayout('shin-jis-prefix', '新JIS（逐次シフト）', 'prefix');
export const SHIN_JIS_SIMULTANEOUS = makeLayout('shin-jis-simultaneous', '新JIS（通常シフト）', 'simultaneous');
