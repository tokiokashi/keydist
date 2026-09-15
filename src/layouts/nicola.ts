import { THUMB_KEY } from '../geometry.ts';
import { fromFaces, type Face, type Layout } from './types.ts';

/** QWERTY 刻印のキー id で NICOLA の3面を記述する。 */
const QWERTY_ROWS = [
  '1234567890-=',
  'qwertyuiop[]',
  "asdfghjkl;'",
  'zxcvbnm,./',
] as const;
const QWERTY_KEYS = new Set([...QWERTY_ROWS.join('')]);

const face = (trigger: string[], entries: Record<string, string>): Face => {
  const invalidKeys = Object.keys(entries).filter((key) => !QWERTY_KEYS.has(key));
  if (invalidKeys.length > 0) throw new Error(`NICOLA 面に未知のキーがある: ${invalidKeys.join(', ')}`);
  return {
    trigger,
    mode: 'simultaneous',
    rows: QWERTY_ROWS.map((row) => [...row].map((key) => entries[key] ?? '')),
  };
};

/**
 * 親指シフト（NICOLA）J型。
 *
 * 配置は NICOLA 日本語入力コンソーシアムの規格書
 * (http://nicola.sunicom.co.jp/spec/kikaku.htm) に対応する DvorakJ の
 * 「NICOLA配列規格書」版 (https://github.com/k-ayaki/dvorakj_2023) から移植した。
 * 紅皿の定義 (https://github.com/k-ayaki/benizara) は D01/D11/D12/B10 で異なるため採らなかった。
 * 規格書 §3 の 2018.11 注記にある D12 の記載は DvorakJ の読みを採用し、
 * `゛` は B10 + 無変換、`゜` は D01 + 変換に置き、D12 の機能キー出力は追加していない。
 *
 * NICOLA 専用キーボードを前提にした配置を ANSI のキー id へ写しているため、
 * 既定の物理形状で出す距離の絶対値は参考値である。
 */
export const NICOLA_FACES: Face[] = [
  // 文字キー単打
  face([], {
    q: '。', w: 'か', e: 'た', r: 'こ', t: 'さ', y: 'ら', u: 'ち', i: 'く', o: 'つ',
    p: '，', '[': '、',
    a: 'う', s: 'し', d: 'て', f: 'け', g: 'せ', h: 'は', j: 'と', k: 'き', l: 'い', ';': 'ん',
    z: '．', x: 'ひ', c: 'す', v: 'ふ', b: 'へ', n: 'め', m: 'そ', ',': 'ね', '.': 'ほ', '/': '・',
  }),

  // 無変換キーとの同時打鍵
  face([THUMB_KEY.LT], {
    q: 'ぁ', w: 'え', e: 'り', r: 'ゃ', t: 'れ', y: 'ぱ', u: 'ぢ', i: 'ぐ', o: 'づ', p: 'ぴ',
    a: 'を', s: 'あ', d: 'な', f: 'ゅ', g: 'も', h: 'ば', j: 'ど', k: 'ぎ', l: 'ぽ',
    z: 'ぅ', x: 'ー', c: 'ろ', v: 'や', b: 'ぃ', n: 'ぷ', m: 'ぞ', ',': 'ぺ', '.': 'ぼ', '/': '゛',
  }),

  // 変換キーとの同時打鍵
  face([THUMB_KEY.RT], {
    q: '゜', w: 'が', e: 'だ', r: 'ご', t: 'ざ', y: 'よ', u: 'に', i: 'る', o: 'ま', p: 'ぇ',
    a: 'ヴ', s: 'じ', d: 'で', f: 'げ', g: 'ぜ', h: 'み', j: 'お', k: 'の', l: 'ょ', ';': 'っ',
    x: 'び', c: 'ず', v: 'ぶ', b: 'べ', n: 'ぬ', m: 'ゆ', ',': 'む', '.': 'わ', '/': 'ぉ',
  }),
];

export const NICOLA: Layout = fromFaces('nicola', '親指シフト（NICOLA）', NICOLA_FACES);
NICOLA.legends.set(THUMB_KEY.LT, '無変換');
NICOLA.legends.set(THUMB_KEY.RT, '変換');
