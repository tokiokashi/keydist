import { THUMB_KEY } from '../geometry.ts';
import { fromFaces, type Face, type Layout } from './types.ts';

/**
 * 薙刀式 v18（作: 大岡俊彦）。
 * 公式配布の DvorakJ 定義ファイルから機械的に起こした。
 * https://oookaworks.seesaa.net/article/456099128.html
 *
 * センターシフトは旧 id の space（thumb-r）との同時押し。濁音は逆手の人差指中段（f / j）、
 * 半濁音は逆手の人差指下段（v / m）、小書きは q との同時押し。
 * 拗音・外来音は 3 キー同時押しを含む。
 */

const QWERTY_ROWS = [
  '1234567890-=',
  'qwertyuiop[]',
  "asdfghjkl;'",
  'zxcvbnm,./',
] as const;

/** QWERTY のキー id で面のセルを指定するための補助関数。 */
const face = (trigger: string[], entries: Record<string, string>, layer?: string): Face => ({
  trigger,
  mode: 'simultaneous',
  rows: QWERTY_ROWS.map((row) => [...row].map((key) => entries[key] ?? '')),
  layer,
});

/** 既存の直接定義を、発火条件を持つ同時押し面へ移したもの。 */
export const NAGINATA_V18_FACES: Face[] = [
  // 単打面
  face([], {
    j: 'あ', k: 'い', l: 'う', f: 'か', w: 'き', h: 'く', s: 'け', v: 'こ',
    r: 'し', o: 'す', b: 'そ', n: 'た', g: 'っ', e: 'て', d: 'と', m: 'な',
    c: 'は', x: 'ひ', p: 'へ', z: 'ほ', '.': 'ら', i: 'る', '/': 'れ', a: 'ろ',
    ',': 'ん', ';': 'ー',
  }),

  // センターシフト
  face(['space'], {
    v: '、', m: '。', o: 'え', n: 'お', u: 'さ', a: 'せ', g: 'ち', l: 'つ',
    d: 'に', b: 'ぬ', w: 'ね', j: 'の', ';': 'ふ', f: 'ま', s: 'み', ',': 'む',
    r: 'め', k: 'も', h: 'や', p: 'ゆ', i: 'よ', e: 'り', '.': 'わ', c: 'を',
  }),

  // 小書き
  face(['q'], { j: 'ぁ', k: 'ぃ', l: 'ぅ', o: 'ぇ', n: 'ぉ', h: 'ゃ', p: 'ゅ', i: 'ょ', '.': 'ゎ' }),

  // 濁音（右手側のトリガー）
  face(['j'], {
    f: 'が', w: 'ぎ', s: 'げ', v: 'ご', r: 'じ', a: 'ぜ', b: 'ぞ', g: 'ぢ', e: 'で',
    d: 'ど', c: 'ば', x: 'び', z: 'ぼ',
  }, '濁音'),

  // 濁音（左手側のトリガー）
  face(['f'], { u: 'ざ', o: 'ず', n: 'だ', l: 'づ', h: 'ぐ', p: 'べ', ';': 'ぶ' }, '濁音'),

  // 半濁音
  face(['m'], { c: 'ぱ', x: 'ぴ', z: 'ぽ' }, '半濁音'),
  face(['v'], { p: 'ぺ', ';': 'ぷ' }, '半濁音'),

  // 拗音の母音面
  face(['h'], { w: 'きゃ', r: 'しゃ', g: 'ちゃ', d: 'にゃ', x: 'ひゃ', s: 'みゃ', e: 'りゃ' }),
  face(['p'], { w: 'きゅ', r: 'しゅ', g: 'ちゅ', d: 'にゅ', x: 'ひゅ', s: 'みゅ', e: 'りゅ' }),
  face(['i'], { w: 'きょ', r: 'しょ', g: 'ちょ', d: 'にょ', x: 'ひょ', s: 'みょ', e: 'りょ' }),

  // 外来音・濁音拗音。trigger は残りのキーをまとめて 1 面にする。
  face(['o', 'v'], { k: 'いぇ', l: 'うぇ', h: 'くぇ', ';': 'ふぇ' }),
  face(['k', 'v'], { l: 'うぃ', h: 'くぃ', ';': 'ふぃ' }),
  face(['n', 'v'], { l: 'うぉ', h: 'くぉ', ';': 'ふぉ' }),
  face(['h', 'j'], { w: 'ぎゃ', r: 'じゃ', g: 'ぢゃ', x: 'びゃ' }),
  face(['j', 'p'], { w: 'ぎゅ', r: 'じゅ', g: 'ぢゅ', e: 'でゅ', x: 'びゅ' }),
  face(['i', 'j'], { w: 'ぎょ', r: 'じょ', g: 'ぢょ', x: 'びょ' }),
  face(['j', 'v'], { h: 'くぁ', l: 'つぁ', ';': 'ふぁ' }),
  face(['k', 'm'], { e: 'てぃ' }),
  face(['m', 'p'], { e: 'てゅ', x: 'ぴゅ' }),
  face(['j', 'k'], { e: 'でぃ' }),
  face(['l', 'm'], { d: 'とぅ' }),
  face(['j', 'l'], { d: 'どぅ' }),
  face(['h', 'm'], { x: 'ぴゃ' }),
  face(['i', 'm'], { x: 'ぴょ' }),
  face(['j', 'o'], { r: 'じぇ', g: 'ぢぇ' }),
  face(['m', 'o'], { r: 'しぇ', g: 'ちぇ' }),
  face(['f', 'j'], { h: 'ぐぁ' }),
  face(['f', 'k'], { h: 'ぐぃ' }),
  face(['f', 'o'], { h: 'ぐぇ' }),
  face(['f', 'n'], { h: 'ぐぉ' }),
  face(['.', 'f'], { h: 'ぐゎ' }),
  face(['.', 'v'], { h: 'くゎ' }),
  face(['p', 'v'], { ';': 'ふゅ' }),
];

export const NAGINATA_V18: Layout = fromFaces('naginata-v18', '薙刀式 v18', NAGINATA_V18_FACES);
NAGINATA_V18.legends.set(THUMB_KEY.RT, 'Space');
