import { THUMB_KEY } from '../geometry.ts';
import { faceFromEntries, fromFaces, type Face, type Layout } from './types.ts';

/**
 * 新下駄配列。
 * 準公式定義: https://github.com/k-ayaki/dvorakj_2023の
 * `data/lang/jpn/同時に打鍵する配列/下駄配列系/新下駄配列.txt`。
 * 考案者の記事: http://kouy.exblog.jp/13627994/
 * DvorakJの数字・記号・機能キーはかな面の定義から除き、数字段にある小書きかなと
 * QWERTYの文字キー段にあるかな・句読点を写す。単打面の重複する長音は、元記事の主要部に合わせてqを採る。
 * D面の重複する括弧や機能キーは採らず、単打面の `「` を残す。
 */

const face = (trigger: string[], entries: Record<string, string>, layer?: string): Face => ({
  ...faceFromEntries(trigger, 'simultaneous', entries),
  layer,
});

export const SHINGETA_FACES: Face[] = [
  face([], {
    q: 'ー', w: 'に', e: 'は', r: '、', t: 'ち', y: 'ぐ', u: 'ば', i: 'こ', o: 'が', p: 'ひ', '[': 'げ', ']': '「',
    a: 'の', s: 'と', d: 'か', f: 'ん', g: 'っ', h: 'く', j: 'う', k: 'い', l: 'し', ';': 'な',
    z: 'す', x: 'ま', c: 'き', v: 'る', b: 'つ', n: 'て', m: 'た', ',': 'で', '.': '。', '/': 'ぶ',
  }),
  face(['k'], {
    1: 'ぁ', 2: 'ぃ', 3: 'ぅ', 4: 'ぇ', 5: 'ぉ',
    q: 'ふぁ', w: 'ご', e: 'ふ', r: 'ふぃ', t: 'ふぇ',
    a: 'ほ', s: 'じ', d: 'れ', f: 'も', g: 'ゆ',
    z: 'づ', x: 'ぞ', c: 'ぼ', v: 'む', b: 'ふぉ',
  }, '中指シフト'),
  face(['d'], {
    y: 'うぃ', u: 'ぱ', i: 'よ', o: 'み', p: 'うぇ', '[': 'うぉ',
    h: 'へ', j: 'あ', ';': 'え',
    n: 'せ', m: 'ね', ',': 'べ', '.': 'ぷ', '/': 'ヴ',
  }, '中指シフト'),
  face(['l'], {
    1: 'ゃ', 2: 'みゃ', 3: 'みゅ', 4: 'みょ', 5: 'ゎ',
    q: 'ぢ', w: 'め', e: 'け', r: 'てぃ', t: 'でぃ',
    a: 'を', s: 'さ', d: 'お', f: 'り', g: 'ず',
    z: 'ぜ', x: 'ざ', c: 'ぎ', v: 'ろ', b: 'ぬ',
  }, '薬指シフト'),
  face(['s'], {
    y: 'しぇ', u: 'ぺ', i: 'ど', o: 'や', p: 'じぇ',
    h: 'び', j: 'ら', ';': 'そ',
    n: 'わ', m: 'だ', ',': 'ぴ', '.': 'ぽ', '/': 'ちぇ',
  }, '薬指シフト'),
  face(['i'], {
    1: 'ゅ', 2: 'びゃ', 3: 'びゅ', 4: 'びょ',
    q: 'ひゅ', w: 'しゅ', e: 'しょ', r: 'きゅ', t: 'ちゅ',
    a: 'ひょ', f: 'きょ', g: 'ちょ',
    z: 'ひゃ', c: 'しゃ', v: 'きゃ', b: 'ちゃ',
  }),
  face(['o'], {
    1: 'ょ', 2: 'ぴゃ', 3: 'ぴゅ', 4: 'ぴょ',
    q: 'りゅ', w: 'じゅ', e: 'じょ', r: 'ぎゅ', t: 'にゅ',
    a: 'りょ', f: 'ぎょ', g: 'にょ',
    z: 'りゃ', c: 'じゃ', v: 'ぎゃ', b: 'にゃ',
  }),
];

const layout: Layout = fromFaces('shingeta', '新下駄', SHINGETA_FACES);
layout.legends.delete(THUMB_KEY.LT);
layout.legends.delete(THUMB_KEY.RT);
export const SHINGETA = layout;
