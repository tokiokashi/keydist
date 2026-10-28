import { THUMB_KEY } from '../shapes/geometry.ts';
import { faceFromEntries, fromFaces, withAliases, withShiftedOutputs, type Face, type Layout } from './types.ts';

/**
 * せおと配列（通常版）。分割・カラムスタッガードの物理配列を前提にした左右母子分離のローマ字配列。
 *
 * 作者の制作記と公式ページの配列図の3段×10列を、QWERTYの文字のキー（`q`〜`p`・`a`〜`;`・`z`〜`/`）に置く。
 * `←` `→`（QWERTYの `t` `y` の位置）は作者が自由に変えてよいとするキーで、文字を置かない。
 * 数字段・`-` `=` `[` `]` `'` は作者の定義が読めないので、QWERTYのまま残す。
 * 作者が別に定義する記号も読めないので、`;` `/` は置かない。
 */
const BASE_ENTRIES: Record<string, string> = {
  // 数字段と30キーの外側はQWERTYのまま
  ...Object.fromEntries([..."1234567890-=[]'"].map((key) => [key, key])),
  // 上段
  q: 'p',
  w: 'z',
  e: 'h',
  r: 'f',
  u: 'q',
  i: 'o',
  o: 'w',
  p: 'x',
  // 中段
  a: 'd',
  s: 's',
  d: 'n',
  f: 't',
  g: 'g',
  h: 'l',
  j: 'a',
  k: 'i',
  l: 'u',
  ';': 'e',
  // 下段
  z: 'b',
  x: 'r',
  c: 'm',
  v: 'c',
  b: 'k',
  n: 'y',
  m: ',',
  ',': 'j',
  '.': '.',
  '/': 'v',
};

/**
 * 左親指を押しながら右手のキーを打つレイヤー（作者の「母音側サブレイヤー」）。
 * 中指の位置が `ん`、薬指の位置が `ー`、小指の位置が `っ`。人差し指の位置のBackSpaceは文章に現れないので置かない。
 * 出力はかなの文字そのもので、ローマ字の規則（`ん` `っ` `ー` を同じ文字で綴る）と対になる。
 */
const LAYER_ENTRIES: Record<string, string> = {
  k: 'ん',
  l: 'ー',
  ';': 'っ',
};

export const SEOTO_FACES: Face[] = [
  { ...faceFromEntries([], 'simultaneous', BASE_ENTRIES), inputRole: 'layer' },
  {
    ...faceFromEntries([THUMB_KEY.LT], 'simultaneous', LAYER_ENTRIES),
    layer: '左親指',
    inputRole: 'layer',
    triggerPersistence: 'single',
  },
];

export const SEOTO: Layout = withAliases(withShiftedOutputs(fromFaces('seoto', 'せおと配列', SEOTO_FACES, { RT: ' ' })), [
  'せおと',
  'せおとはいれつ',
  'seoto',
]);
