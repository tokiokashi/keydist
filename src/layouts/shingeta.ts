import { THUMB_KEY } from '../geometry.ts';
import { faceFromEntries, fromFaces, type Face, type Layout } from './types.ts';

/**
 * 新下駄配列。
 * 考案者kouy氏による公開配列表:
 * https://kouy.exblog.jp/13627994/
 * keydistではこの公開された配列仕様をFace定義として独自に記述し、
 * 機能キーやJIS専用キーは解析対象から除く。
 * 単打面の重複する長音は元記事の主要部に合わせてqを採り、
 * D面の重複する括弧や機能キーは採らず、単打面の `「` を残す。
 */

const face = (
  trigger: string[],
  entries: Record<string, string>,
  layer?: string,
  inputRole: Face['inputRole'] = 'layer',
): Face => ({
  ...faceFromEntries(trigger, 'simultaneous', entries),
  layer,
  inputRole,
  ...(trigger.length > 0 ? { triggerPersistence: 'single' as const } : {}),
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
  }, '中指シフト', 'modifier'),
  face(['d'], {
    y: 'うぃ', u: 'ぱ', i: 'よ', o: 'み', p: 'うぇ', '[': 'うぉ',
    h: 'へ', j: 'あ', ';': 'え',
    n: 'せ', m: 'ね', ',': 'べ', '.': 'ぷ', '/': 'ヴ',
  }, '中指シフト', 'modifier'),
  face(['l'], {
    1: 'ゃ', 2: 'みゃ', 3: 'みゅ', 4: 'みょ', 5: 'ゎ',
    q: 'ぢ', w: 'め', e: 'け', r: 'てぃ', t: 'でぃ',
    a: 'を', s: 'さ', d: 'お', f: 'り', g: 'ず',
    z: 'ぜ', x: 'ざ', c: 'ぎ', v: 'ろ', b: 'ぬ',
  }, '薬指シフト', 'modifier'),
  face(['s'], {
    y: 'しぇ', u: 'ぺ', i: 'ど', o: 'や', p: 'じぇ',
    h: 'び', j: 'ら', ';': 'そ',
    n: 'わ', m: 'だ', ',': 'ぴ', '.': 'ぽ', '/': 'ちぇ',
  }, '薬指シフト', 'modifier'),
  face(['i'], {
    1: 'ゅ', 2: 'びゃ', 3: 'びゅ', 4: 'びょ',
    q: 'ひゅ', w: 'しゅ', e: 'しょ', r: 'きゅ', t: 'ちゅ',
    a: 'ひょ', f: 'きょ', g: 'ちょ',
    z: 'ひゃ', c: 'しゃ', v: 'きゃ', b: 'ちゃ',
  }, '拗音1', 'modifier'),
  face(['o'], {
    1: 'ょ', 2: 'ぴゃ', 3: 'ぴゅ', 4: 'ぴょ',
    q: 'りゅ', w: 'じゅ', e: 'じょ', r: 'ぎゅ', t: 'にゅ',
    a: 'りょ', f: 'ぎょ', g: 'にょ',
    z: 'りゃ', c: 'じゃ', v: 'ぎゃ', b: 'にゃ',
  }, '拗音2', 'modifier'),
];

const layout: Layout = fromFaces('shingeta', '新下駄', SHINGETA_FACES);
layout.legends.delete(THUMB_KEY.LT);
layout.legends.delete(THUMB_KEY.RT);
export const SHINGETA = layout;
