import { THUMB_KEY } from '../shapes/geometry.ts';
import { charMeaning, faceFromEntries, fromFaces, modifierKeyMeaning, withAliases, type Face, type Layout, type TriggerMeaning } from './types.ts';

/**
 * シン蜂蜜小梅（作: 141F氏）。
 *
 * 出典:
 *   作者ブログ掲載の紅皿定義
 *   http://61degc.seesaa.net/article/483919146.html
 *
 * 親指シフトと文字キー同士の同時押しを混在させる配列なので、
 * 親指面はlayer、文字キーの同時押しはcompositionとしてsemanticを分離する。
 * 基本の打ち方から外れた拡張の面は無いので、文字キーの同時押しの面はtriggerのキーごとの層に数える。
 */
const face = (
  trigger: string[],
  entries: Record<string, string>,
  options: Pick<Face, 'layer' | 'inputRole' | 'compositionAggregation' | 'triggerPersistence'> = { inputRole: 'layer' },
): Face => ({
  ...faceFromEntries(trigger, 'simultaneous', entries),
  ...options,
});

const layerFace = (
  trigger: string[],
  entries: Record<string, string>,
  layer?: string,
): Face => face(trigger, entries, trigger.length === 0 ? {
  inputRole: 'layer',
} : {
  layer,
  inputRole: 'layer',
  triggerPersistence: 'single',
});

/** 文字キー同時押しの面が、トリガーのキーの意味を引く組。 */
const SIMULTANEOUS_GROUP = '文字キー同時押し';

/**
 * 文字キー同時押しの面のトリガーのキーが持つ意味。
 * キーは出るかなの1文字目を決めるので、単打面の文字とは関係が無い。
 * 意味の文字は、面で出るかなの1文字目を、面に現れる順に「・」でつないだもの。
 * 「を」（k）は1字で出るかなで、拗音・外来音の1文字目ではないので含めない。
 * 「ぱ」（h）は、ぱ・ぽ・ぷ（1字で出る半濁音）の代表として書く。
 * 半濁音のキー（g）は、文字を持たない修飾のキーとして働く。
 */
const SIMULTANEOUS_KEY_MEANINGS: Readonly<Record<string, TriggerMeaning>> = {
  u: charMeaning('ひ・び'),
  i: charMeaning('き・ぎ'),
  o: charMeaning('つ・に・づ'),
  h: charMeaning('ぴ・ぱ'),
  j: charMeaning('ふ・ぶ'),
  k: charMeaning('く・い・ぐ'),
  l: charMeaning('り・し・じ'),
  n: charMeaning('み'),
  m: charMeaning('う・ヴ'),
  ',': charMeaning('て・で'),
  '.': charMeaning('ち・ぢ'),
  g: modifierKeyMeaning('半濁音'),
  ';': charMeaning('と・ど'),
  '/': charMeaning('ぬ'),
};

/**
 * 文字キー同時押しの面。層の名前を定義で付ける時は `layer` に書く。
 * 付けない時は既定の名前になる（出るかなの種類、または「<トリガーの文字>のシフト」）。
 */
const compositionFace = (trigger: string, entries: Record<string, string>, layer?: string): Face => ({
  ...face([trigger], entries, {
    inputRole: 'composition',
    compositionAggregation: 'layer',
    triggerPersistence: 'single',
  }),
  triggerMeaningGroups: { [trigger]: SIMULTANEOUS_GROUP },
  ...(layer === undefined ? {} : { presentationLabel: layer }),
});

const SHIN_KOUME_FACES: Face[] = [
  // シフト無し
  layerFace([], {
    q: '。', w: 'な', e: 'て', r: 'せ', t: 'そ', u: 'お', i: 'の', o: 'に', '[': '、',
    a: 'こ', s: 'た', d: 'か', f: 'る', g: 'は', h: 'ー', j: 'ん', k: 'い', l: 'し', ';': 'と',
    z: 'ゆ', x: 'ほ', c: 'ま', v: 'ろ', n: 'っ', m: 'う', ',': 'す', '.': 'ら', '/': 'へ',
  }),

  // 左親指シフト。半濁音は作者が後に示した文字キー同時押しを正として重複を除く。
  layerFace([THUMB_KEY.LT], {
    w: 'け', e: 'よ', y: 'ゑ', u: 'び', i: 'ぎ', o: 'づ',
    a: 'め', s: 'や', d: 'も', f: 'さ', g: 'ぅ', h: 'ぃ', j: 'ぁ', k: 'ぐ', l: 'じ', ';': 'ど',
    z: 'ゅ', x: 'ゃ', c: 'ふ', v: 'ょ', b: 'ぉ', n: 'ぇ', m: 'ヴ', ',': 'ず', '.': 'ぢ', '/': 'べ',
  }, '左親指'),

  // 右親指シフト。同じく半濁音5字はcomposition側へ寄せる。
  layerFace([THUMB_KEY.RT], {
    w: 'げ', e: 'で', r: 'ぜ', t: 'ぞ', y: 'ゐ', u: 'ひ', i: 'き', o: 'つ',
    a: 'ご', s: 'だ', d: 'が', f: 'ざ', g: 'ば', h: 'む', j: 'れ', k: 'く', l: 'り', ';': 'わ', "'": 'ね',
    x: 'ぼ', c: 'ぶ', b: 'ゎ', n: 'み', m: 'あ', ',': 'え', '.': 'ち', '/': 'ぬ',
  }, '右親指'),

  // 半濁音・拗音・外来音。紅皿定義の文字キー同時押しをcompositionとして表す。
  compositionFace('g', { u: 'ぴ', '/': 'ぺ' }, '半濁音'),

  compositionFace('u', {
    q: 'ひぇ', w: 'ひゅ', e: 'ひょ', r: 'ひゃ', t: 'ひぃ',
    z: 'びぇ', x: 'びゅ', c: 'びょ', v: 'びゃ', b: 'びぃ',
  }),
  compositionFace('i', {
    q: 'きぇ', w: 'きゅ', e: 'きょ', r: 'きゃ', t: 'きぃ',
    z: 'ぎぇ', x: 'ぎゅ', c: 'ぎょ', v: 'ぎゃ', b: 'ぎぃ',
  }),
  compositionFace('o', {
    q: 'つぇ', e: 'つぉ', r: 'つぁ', t: 'つぃ',
    a: 'にぇ', s: 'にゅ', d: 'にょ', f: 'にゃ', g: 'にぃ',
    z: 'づぇ', c: 'づぉ', v: 'づぁ', b: 'づぃ',
  }),
  compositionFace('h', {
    q: 'ぴぇ', w: 'ぴゅ', e: 'ぴょ', r: 'ぴゃ', t: 'ぴぃ',
    g: 'ぱ', x: 'ぽ', c: 'ぷ',
  }),
  compositionFace('j', {
    a: 'ふぇ', s: 'ふゅ', d: 'ふぉ', f: 'ふぁ', g: 'ふぃ',
    z: 'ぶぇ', x: 'ぶゅ', c: 'ぶぉ', v: 'ぶぁ', b: 'ぶぃ',
  }),
  compositionFace('k', {
    q: 'くぇ', w: 'くゎ', e: 'くぉ', r: 'くぁ', t: 'くぃ',
    a: 'いぇ', d: 'を',
    z: 'ぐぇ', x: 'ぐゎ', c: 'ぐぉ', v: 'ぐぁ', b: 'ぐぃ',
  }),
  compositionFace('l', {
    q: 'りぇ', w: 'りゅ', e: 'りょ', r: 'りゃ', t: 'りぃ',
    a: 'しぇ', s: 'しゅ', d: 'しょ', f: 'しゃ', g: 'しぃ',
    z: 'じぇ', x: 'じゅ', c: 'じょ', v: 'じゃ', b: 'じぃ',
  }),
  compositionFace(';', {
    s: 'とぅ',
    x: 'どぅ',
  }),
  compositionFace('n', {
    q: 'みぇ', w: 'みゅ', e: 'みょ', r: 'みゃ', t: 'みぃ',
  }),
  compositionFace('m', {
    a: 'うぇ', d: 'うぉ', g: 'うぃ',
    z: 'ヴぇ', x: 'ヴゅ', c: 'ヴぉ', v: 'ヴぁ', b: 'ヴぃ',
  }),
  compositionFace(',', {
    s: 'てゅ', g: 'てぃ',
    x: 'でゅ', b: 'でぃ',
  }),
  compositionFace('.', {
    q: 'ちぇ', w: 'ちゅ', e: 'ちょ', r: 'ちゃ', t: 'ちぃ',
    z: 'ぢぇ', x: 'ぢゅ', c: 'ぢょ', v: 'ぢゃ', b: 'ぢぃ',
  }),
  compositionFace('/', {
    e: 'ぬぉ',
  }),
];

const layout: Layout = {
  ...fromFaces('shin-koume', 'シン蜂蜜小梅', SHIN_KOUME_FACES),
  triggerMeanings: { [SIMULTANEOUS_GROUP]: SIMULTANEOUS_KEY_MEANINGS },
};
layout.legends.set(THUMB_KEY.LT, '親指左');
layout.legends.set(THUMB_KEY.RT, '親指右');

export const SHIN_KOUME = withAliases(layout, ['しんはちみつこうめ', 'しんこうめ', 'はちみつこうめ']);
