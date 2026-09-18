import { THUMB_KEY } from '../geometry.ts';
import { faceFromEntries, fromFaces, type Face, type Layout } from './types.ts';

/**
 * 飛鳥123（最終版）。
 *
 * 配字:
 *   k-ayaki/benizara `飛鳥123(拡張親指シフト).bnz`
 *   source blob: cb8e9a6d7694c695e9978d9752c469956c26208b
 *
 * 紅皿定義はローマ字送出なので、かなへ変換できるセルだけを直接かなへ正規化する。
 * 機能キー・英数記号は解析対象へ入れない。
 *
 * 飛鳥は左右親指シフトを同時打鍵でき、親指を押したまま次の文字へ継続できるため、
 * FaceMode と保持能力を独立に simultaneous + hold-capable として宣言する。
 */
const face = (
  trigger: string[],
  entries: Record<string, string>,
  options: Pick<Face, 'layer' | 'inputRole' | 'triggerPersistence'> = { inputRole: 'layer' },
): Face => ({
  ...faceFromEntries(trigger, 'simultaneous', entries),
  ...options,
});

const ASUKA_FACES: Face[] = [
  face([], {
    w: 'ー',
    r: 'び', i: 'と', o: 'は', p: 'ぽ',
    a: 'き', s: 'し', d: 'う', f: 'て', g: 'ぎ', h: 'ゆ', j: 'ん', k: 'い', l: 'か', ';': 'た', "'": 'ほ',
    z: 'じ', x: 'ち', c: 'に', v: 'り', b: 'ぶ', n: 'ゃ', m: 'っ', ',': 'ょ', '.': 'ゅ', '/': 'さ',
  }),
  face([THUMB_KEY.LT], {
    q: 'ぃ', w: 'ひ', e: 'け', r: 'ぁ', t: 'ぅ', y: 'ヴ', i: 'よ', o: 'ふ', p: 'へ',
    a: 'だ', s: 'あ', d: 'が', f: 'ば', g: 'ぇ', h: 'ず', j: 'る', k: 'す', l: 'ま', ';': 'で', "'": 'げ',
    z: 'ぜ', x: 'ね', c: 'せ', v: 'ぴ', b: 'ぉ', n: 'や', m: 'え',
  }, {
    layer: '左親指',
    inputRole: 'layer',
    triggerPersistence: 'hold-capable',
  }),
  face([THUMB_KEY.RT], {
    w: 'べ', e: 'れ', r: 'ぺ', y: 'ぢ', u: 'ぬ', i: 'ど', o: 'め', p: 'ぞ', '[': 'ご',
    a: 'わ', s: 'お', d: 'な', f: 'ら', g: 'ぷ', h: 'づ', j: 'く', k: 'の', l: 'こ', ';': 'そ', "'": 'ろ',
    z: 'ぱ', x: 'ぐ', c: 'み', v: 'ざ', n: 'む', m: 'を', ',': 'つ', '.': 'も', '/': 'ぼ',
  }, {
    layer: '右親指',
    inputRole: 'layer',
    triggerPersistence: 'hold-capable',
  }),
];

const layout: Layout = fromFaces('asuka', '飛鳥', ASUKA_FACES);
layout.legends.set(THUMB_KEY.LT, '左親指');
layout.legends.set(THUMB_KEY.RT, '右親指');

export const ASUKA = layout;
