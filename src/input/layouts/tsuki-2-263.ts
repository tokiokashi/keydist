import { THUMB_KEY } from '../shapes/geometry.ts';
import {
  faceFromEntries,
  fromFaces,
  withComposedOutputs,
  type Face,
  type Layout,
} from './types.ts';

/**
 * 月配列2-263式。
 * 成立時の配列表（新JIS・月スレッド2の263番）:
 * https://jisx6004.client.jp/data/2chlog/1055763380.html
 * 解説・配列表: https://jisx6004.client.jp/tsuki.html
 * keydistでは公開された2-263式の配列仕様をFace定義として独自に記述する。
 * クロスシフトとして左側の対象キーを `k`、右側の対象キーを `d` に割り当て、
 * JIS専用キーの `・` はANSIでは表現しない。
 */

const face = (trigger: string[], entries: Record<string, string>, layer?: string): Face => ({
  ...faceFromEntries(trigger, 'prefix', entries),
  layer,
  inputRole: trigger.length > 0 ? 'modifier' : 'layer',
  ...(trigger.length > 0 ? { triggerPersistence: 'single' as const } : {}),
});

export const TSUKI_2_263_FACES: Face[] = [
  face([], {
    q: 'そ', w: 'こ', e: 'し', r: 'て', t: 'ょ', y: 'つ', u: 'ん', i: 'い', o: 'の', p: 'り', '[': 'ち',
    a: 'は', s: 'か', f: 'と', g: 'た', h: 'く', j: 'う', l: '゛', ';': 'き', "'": 'れ',
    z: 'す', x: 'け', c: 'に', v: 'な', b: 'さ', n: 'っ', m: 'る', ',': '、', '.': '。', '/': '゜',
  }),
  face(['d'], {
    y: 'ぬ', u: 'え', i: 'み', o: 'や', p: 'ぇ', '[': '「',
    h: 'ま', j: 'お', k: 'も', l: 'わ', ';': 'ゆ', "'": '」',
    n: 'む', m: 'ろ', ',': 'ね', '.': 'ー', '/': 'ぉ',
  }, '中指シフト'),
  face(['k'], {
    q: 'ぁ', w: 'ひ', e: 'ほ', r: 'ふ', t: 'め',
    a: 'ぃ', s: 'を', d: 'ら', f: 'あ', g: 'よ',
    z: 'ぅ', x: 'へ', c: 'せ', v: 'ゅ', b: 'ゃ',
  }, '中指シフト'),
];

const layout: Layout = fromFaces('tsuki-2-263', '月配列2-263式', TSUKI_2_263_FACES);

const VOICED: Record<string, string> = {
  か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご',
  さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど',
  は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
  う: 'ゔ',
};

const SEMI_VOICED: Record<string, string> = {
  は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ',
};

const composed = withComposedOutputs(
  withComposedOutputs(layout, VOICED, '゛', '月配列'),
  SEMI_VOICED,
  '゜',
  '月配列',
);
composed.legends.delete(THUMB_KEY.LT);
composed.legends.delete(THUMB_KEY.RT);
export const TSUKI_2_263 = composed;
