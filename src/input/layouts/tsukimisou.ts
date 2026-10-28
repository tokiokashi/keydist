import { faceFromEntries, fromFaces, withAliases, type Face, type FaceMode, type Layout } from './types.ts';
import { THUMB_KEY } from '../shapes/geometry.ts';

/**
 * 月見草配列v2。
 * 作者mentaiko氏が解説ページで配布するGoogle日本語入力のローマ字テーブル（2021-04-25）を仕様根拠にする。
 * https://mentaiko.syoyu.net/tsukimisou
 * 定義ファイルとの突き合わせは`test/fixtures/sources/tsukimisou.json`と`tsukimisou.test.ts`を参照。
 *
 * 単打の面は31キーで、`e`（、）`s`（・）`f`（。）`j`（っ）も単打でかなを出す。
 * `e` `s` `f`は直前に打ったキーの出力を変える後置のトリガーでもあり、拗音・小書き・濁音・半濁音の一部が入る。
 * `j`は前置のトリガーでもあり、続くキーで別のかなを出す。前置`j`・出力キー・後置`e` `s` `f`の3打の面は、
 * ひゃ行・びゃ行・ぴゃ行・みゃ行・ぢゃ行の15字、ぎゃ行・じゃ行の6字と、っぐ・っしぇ・っちぇ・っぱ・っぶ・っぷ・っへ・っぺ・っぼ・っぽの10件。
 * ぎゃ行・じゃ行は後置の面でも打てる。
 *
 * 前置`j`の面のわ・あ・や（`j` `e` / `s` / `f`）は、後置`e` `s` `f`の面の`j`のセルにも読める。
 * 同じ打鍵なので、前置`j`の面を打鍵のセルにし、後置の面の`j`のセルは表示だけにする。
 * 作者の定義にある、継ぎ目の読み方の個別の例外は表さない（確定の打鍵は面の定義から決まる）。
 * 濁音・半濁音は清音と別のキーに置かれていて、合成はしない。
 * JISの`@`はANSIの`[`、`:`は`'`に写している。
 */

const face = (
  trigger: string[],
  mode: FaceMode,
  entries: Record<string, string>,
  options: { suffixTrigger?: string[]; presentationCells?: Record<string, string> } = {},
): Face => ({
  ...faceFromEntries(trigger, mode, entries),
  ...(options.suffixTrigger === undefined ? {} : { suffixTrigger: options.suffixTrigger }),
  ...(options.presentationCells === undefined ? {} : { presentationCells: options.presentationCells }),
  inputRole: 'layer',
  ...(trigger.length > 0 ? { triggerPersistence: 'single' as const } : {}),
});

/** 単打の面。`e` `s` `f` `j`も単打でかなを出す。`y`は使わない。 */
const BASE: Record<string, string> = {
  q: 'だ',
  w: 'か',
  e: '、',
  r: 'が',
  t: 'を',
  u: 'き',
  i: 'ん',
  o: 'た',
  p: 'つ',
  '[': 'ち',
  a: 'に',
  s: '・',
  d: 'う',
  f: '。',
  g: 'て',
  h: 'こ',
  j: 'っ',
  k: 'い',
  l: 'と',
  ';': 'く',
  "'": 'り',
  z: 'で',
  x: 'も',
  c: 'ま',
  v: 'の',
  b: 'は',
  n: 'し',
  m: 'な',
  ',': 'る',
  '.': 'す',
  '/': 'れ',
};

/** 後置`e`の面。出力キーを打った後に`e`を打つ。 */
const SUFFIX_E: Record<string, string> = {
  q: 'ゑ',
  w: 'ふ',
  r: 'ふぁ',
  t: 'うぇ',
  u: 'きゃ',
  i: 'む',
  o: 'せ',
  p: 'じゃ',
  '[': 'ちゃ',
  a: 'にゃ',
  s: 'ぷ',
  d: 'じぇ',
  f: 'ぶ',
  g: 'とぅ',
  h: 'ぜ',
  k: 'め',
  l: 'け',
  ';': 'げ',
  "'": 'りゃ',
  z: 'どぅ',
  x: 'ちぇ',
  c: 'しぇ',
  v: 'ぎゃ',
  b: 'ふぇ',
  n: 'しゃ',
  m: 'ね',
  ',': 'ぅ',
  '.': 'ヴぇ',
  '/': 'ぇ',
};

/** 後置`s`の面。 */
const SUFFIX_S: Record<string, string> = {
  q: 'ゐ',
  e: 'へ',
  r: 'ふぉ',
  t: 'うぃ',
  u: 'きょ',
  i: 'ろ',
  o: 'そ',
  p: 'じょ',
  '[': 'ちょ',
  a: 'にょ',
  d: 'べ',
  f: 'ぐ',
  g: 'てぃ',
  h: 'ぞ',
  k: 'ら',
  l: 'え',
  ';': 'ご',
  "'": 'りょ',
  z: 'でぃ',
  c: 'ぺ',
  v: 'ぎょ',
  b: 'ふぃ',
  n: 'しょ',
  m: 'ー',
  ',': 'ぉ',
  '.': 'ヴぃ',
  '/': 'ぃ',
};

/** 後置`f`の面。 */
const SUFFIX_F: Record<string, string> = {
  q: 'ゎ',
  w: 'ほ',
  e: 'ぱ',
  r: 'ふょ',
  t: 'うぉ',
  u: 'きゅ',
  i: 'ゆ',
  o: 'さ',
  p: 'じゅ',
  '[': 'ちゅ',
  a: 'にゅ',
  s: 'ぼ',
  d: 'ば',
  g: 'てゅ',
  h: 'ざ',
  k: 'お',
  l: 'ど',
  ';': 'ず',
  "'": 'りゅ',
  z: 'でゅ',
  x: 'ぽ',
  v: 'ぎゅ',
  b: 'ふゅ',
  n: 'しゅ',
  m: 'よ',
  ',': 'ヴぉ',
  '.': 'ヴぁ',
  '/': 'ぁ',
};

/** 前置`j`の面。 */
const PREFIX_J: Record<string, string> = {
  e: 'わ',
  t: 'つぉ',
  i: 'び',
  a: 'じ',
  s: 'あ',
  d: 'み',
  f: 'や',
  k: 'ひ',
  "'": 'ぴ',
  x: 'ぬ',
  c: 'づ',
  v: 'ぎ',
  m: 'ぢ',
  ',': 'ヴ',
};

/** 前置`j`、出力キー、後置`e`の3打の面。 */
const THREE_E: Record<string, string> = {
  i: 'びゃ',
  a: 'じゃ',
  s: 'っぷ',
  d: 'みゃ',
  f: 'っぶ',
  k: 'ひゃ',
  "'": 'ぴゃ',
  x: 'っちぇ',
  c: 'っしぇ',
  v: 'ぎゃ',
  m: 'ぢゃ',
};

/** 前置`j`、出力キー、後置`s`の3打の面。 */
const THREE_S: Record<string, string> = {
  e: 'っへ',
  i: 'びょ',
  a: 'じょ',
  d: 'みょ',
  f: 'っぐ',
  k: 'ひょ',
  "'": 'ぴょ',
  c: 'っぺ',
  v: 'ぎょ',
  m: 'ぢょ',
};

/** 前置`j`、出力キー、後置`f`の3打の面。 */
const THREE_F: Record<string, string> = {
  e: 'っぱ',
  i: 'びゅ',
  a: 'じゅ',
  s: 'っぼ',
  d: 'みゅ',
  k: 'ひゅ',
  "'": 'ぴゅ',
  x: 'っぽ',
  v: 'ぎゅ',
  m: 'ぢゅ',
};

export const TSUKIMISOU_FACES: Face[] = [
  face([], 'prefix', BASE),
  face(['e'], 'suffix', SUFFIX_E, { presentationCells: { j: 'わ' } }),
  face(['s'], 'suffix', SUFFIX_S, { presentationCells: { j: 'あ' } }),
  face(['f'], 'suffix', SUFFIX_F, { presentationCells: { j: 'や' } }),
  face(['j'], 'prefix', PREFIX_J),
  face(['j'], 'prefix', THREE_E, { suffixTrigger: ['e'] }),
  face(['j'], 'prefix', THREE_S, { suffixTrigger: ['s'] }),
  face(['j'], 'prefix', THREE_F, { suffixTrigger: ['f'] }),
];

const layout: Layout = fromFaces('tsukimisou', '月見草配列v2', TSUKIMISOU_FACES);
layout.legends.delete(THUMB_KEY.LT);
layout.legends.delete(THUMB_KEY.RT);
export const TSUKIMISOU = withAliases(layout, ['つきみそう', 'つきみそうはいれつ']);
