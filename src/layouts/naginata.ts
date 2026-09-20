import { THUMB_KEY } from '../geometry.ts';
import { fromFaces, withThumbShiftAlternatives, type Face, type Layout } from './types.ts';

/**
 * 薙刀式v18（作: 大岡俊彦）。
 * 公式配布のDvorakJ定義ファイルから機械的に起こした。
 * https://oookaworks.seesaa.net/article/456099128.html
 *
 * センターシフトは旧idのspace（thumb-r）を先押しして重ねるSandS。Stroke表現は同時押しのまま、
 * triggerOrder='prefix' で先押し制約を保持する。濁音は逆手の人差指中段（f / j）、
 * 半濁音は逆手の人差指下段（v / m）、小書きはqとの同時押し。
 * 拗音・外来音は3キー同時押しを含む。
 */

const QWERTY_ROWS = [
  '1234567890-=',
  'qwertyuiop[]',
  "asdfghjkl;'",
  'zxcvbnm,./',
] as const;

/** QWERTYのキーidで面のセルを指定するための補助関数。 */
const face = (
  trigger: string[],
  entries: Record<string, string>,
  options: Pick<Face, 'layer' | 'role' | 'inputRole' | 'triggerPersistence' | 'triggerOrder'> = {
    inputRole: 'layer',
  },
): Face => ({
  trigger,
  mode: 'simultaneous',
  rows: QWERTY_ROWS.map((row) => [...row].map((key) => entries[key] ?? '')),
  ...options,
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
  }, { inputRole: 'modifier', triggerPersistence: 'hold-capable', triggerOrder: 'prefix' }),

  // 小書き
  face(['q'], { j: 'ぁ', k: 'ぃ', l: 'ぅ', o: 'ぇ', n: 'ぉ', h: 'ゃ', p: 'ゅ', i: 'ょ', '.': 'ゎ' }, { role: 'modifier', inputRole: 'modifier', triggerPersistence: 'hold-capable' }),

  // 濁音（右手側のトリガー）
  face(['j'], {
    f: 'が', w: 'ぎ', s: 'げ', v: 'ご', r: 'じ', a: 'ぜ', b: 'ぞ', g: 'ぢ', e: 'で',
    d: 'ど', c: 'ば', x: 'び', z: 'ぼ',
  }, { layer: '濁音', role: 'modifier', inputRole: 'modifier', triggerPersistence: 'hold-capable' }),

  // 濁音（左手側のトリガー）
  face(['f'], { u: 'ざ', o: 'ず', n: 'だ', l: 'づ', h: 'ぐ', j: 'が', p: 'べ', ';': 'ぶ' }, { layer: '濁音', role: 'modifier', inputRole: 'modifier', triggerPersistence: 'hold-capable' }),

  // 半濁音
  face(['m'], { c: 'ぱ', x: 'ぴ', z: 'ぽ' }, { layer: '半濁音', role: 'modifier', inputRole: 'modifier', triggerPersistence: 'hold-capable' }),
  face(['v'], { p: 'ぺ', ';': 'ぷ' }, { layer: '半濁音', role: 'modifier', inputRole: 'modifier', triggerPersistence: 'hold-capable' }),

  // 拗音の母音面
  face(['h'], { w: 'きゃ', r: 'しゃ', g: 'ちゃ', d: 'にゃ', x: 'ひゃ', s: 'みゃ', e: 'りゃ' }, { role: 'modifier', inputRole: 'modifier', triggerPersistence: 'hold-capable' }),
  face(['p'], { w: 'きゅ', r: 'しゅ', g: 'ちゅ', d: 'にゅ', x: 'ひゅ', s: 'みゅ', e: 'りゅ' }, { role: 'modifier', inputRole: 'modifier', triggerPersistence: 'hold-capable' }),
  face(['i'], { w: 'きょ', r: 'しょ', g: 'ちょ', d: 'にょ', x: 'ひょ', s: 'みょ', e: 'りょ' }, { role: 'modifier', inputRole: 'modifier', triggerPersistence: 'hold-capable' }),

  // 外来音・濁音拗音。triggerは残りのキーをまとめて1面にする。
  face(['o', 'v'], { k: 'いぇ', l: 'うぇ', h: 'くぇ', ';': 'ふぇ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['k', 'v'], { l: 'うぃ', h: 'くぃ', ';': 'ふぃ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['n', 'v'], { l: 'うぉ', h: 'くぉ', ';': 'ふぉ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['h', 'j'], { w: 'ぎゃ', r: 'じゃ', g: 'ぢゃ', x: 'びゃ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['j', 'p'], { w: 'ぎゅ', r: 'じゅ', g: 'ぢゅ', e: 'でゅ', x: 'びゅ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['i', 'j'], { w: 'ぎょ', r: 'じょ', g: 'ぢょ', x: 'びょ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['j', 'v'], { h: 'くぁ', l: 'つぁ', ';': 'ふぁ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['k', 'm'], { e: 'てぃ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['m', 'p'], { e: 'てゅ', x: 'ぴゅ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['j', 'k'], { e: 'でぃ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['l', 'm'], { d: 'とぅ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['j', 'l'], { d: 'どぅ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['h', 'm'], { x: 'ぴゃ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['i', 'm'], { x: 'ぴょ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['j', 'o'], { r: 'じぇ', g: 'ぢぇ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['m', 'o'], { r: 'しぇ', g: 'ちぇ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['f', 'j'], { h: 'ぐぁ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['f', 'k'], { h: 'ぐぃ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['f', 'o'], { h: 'ぐぇ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['f', 'n'], { h: 'ぐぉ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['.', 'f'], { h: 'ぐゎ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['.', 'v'], { h: 'くゎ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
  face(['p', 'v'], { ';': 'ふゅ' }, { inputRole: 'composition', triggerPersistence: 'hold-capable' }),
];

export const NAGINATA_V18: Layout = withThumbShiftAlternatives(
  fromFaces('naginata-v18', '薙刀式v18', NAGINATA_V18_FACES),
  THUMB_KEY.RT,
  [THUMB_KEY.RT, THUMB_KEY.LT],
);
NAGINATA_V18.legends.set(THUMB_KEY.RT, 'Space');
