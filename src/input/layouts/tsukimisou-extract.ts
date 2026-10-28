import { faceFromEntries, fromFaces, withAliases, type Face, type FaceMode, type Layout } from './types.ts';
import { THUMB_KEY } from '../shapes/geometry.ts';

/**
 * 月見草エキス配列。
 * 作者2ufkpfb9daxnik氏のAutoHotkey用の対応表`g20220908.txt`（リポジトリ`ahk-suffixshift`のコミット4b1c379）を仕様根拠にする。
 * 定義ファイルとの突き合わせは`test/fixtures/sources/tsukimisou-extract.json`と`tsukimisou-extract.test.ts`を参照。
 *
 * 単打の面は32キーで、後置のトリガーの`e` `i` `o` `s` `f`も単打でそれぞれ ゃ ぃ ぇ ょ ゅ を出す。
 * 後置の面は5枚（トリガー`e` `i` `o` `s` `f`）で、出力キーを打った後にトリガーを打つ。
 * 清音と濁音・半濁音は別のキーに置かれていて、合成はしない。前置の面と3打の面は無い。
 * 数字段の記号7セルは、定義ファイルの文字（`! ? ( )`は半角、`・「」`は全角）のまま持つ。
 * 定義ファイルのキー名はANSIの刻印で書かれているので、JISの`@`の位置の`[`、`:`の位置の`'`もそのままANSIの位置に置く。
 */

const face = (trigger: string[], mode: FaceMode, entries: Record<string, string>): Face => ({
  ...faceFromEntries(trigger, mode, entries),
  inputRole: 'layer',
  ...(trigger.length > 0 ? { triggerPersistence: 'single' as const } : {}),
});

/** 単打の面。`e` `i` `o` `s` `f` は後置のトリガーでもあり、単打でも ゃ ぃ ぇ ょ ゅ を出す。 */
const BASE: Record<string, string> = {
  q: 'ー',
  w: 'か',
  e: 'ゃ',
  r: 'く',
  t: 'ま',
  y: 'ヴ',
  u: 'が',
  i: 'ぃ',
  o: 'ぇ',
  p: 'む',
  '[': 'ふ',
  a: 'し',
  s: 'ょ',
  d: 'う',
  f: 'ゅ',
  g: '、',
  h: 'て',
  j: 'た',
  k: 'い',
  l: 'ん',
  ';': 'に',
  "'": 'こ',
  z: 'き',
  x: 'で',
  c: 'は',
  v: 'の',
  b: 'け',
  n: 'な',
  m: 'と',
  ',': 'す',
  '.': '。',
  '/': 'っ',
};

/** 後置`e`の面。出力キーを打った後に`e`を打つ。数字段の括弧と鉤括弧を含む。 */
const SUFFIX_E: Record<string, string> = {
  '8': '「',
  '9': '(',
  '0': ')',
  '-': '」',
  q: 'ぢゃ',
  w: 'る',
  r: 'ぶ',
  t: 'ぴゃ',
  y: 'ヴぁ',
  u: 'つぁ',
  p: 'ぎゃ',
  '[': 'ふぁ',
  a: 'しゃ',
  d: 'ゃ',
  h: 'せ',
  j: 'りゃ',
  k: 'ぱ',
  l: 'や',
  ';': 'にゃ',
  "'": 'ちゃ',
  z: 'きゃ',
  x: 'ゎ',
  v: 'ぐ',
  b: 'ぁ',
  n: 'じゃ',
  m: 'さ',
  ',': 'びゃ',
  '.': 'ひゃ',
  '/': 'みゃ',
};

/** 後置`i`の面。数字段の ! ? ・ を含む。 */
const SUFFIX_I: Record<string, string> = {
  '2': '!',
  '3': '?',
  '4': '・',
  q: 'ぢ',
  w: 'ご',
  r: 'ぽ',
  t: 'ぴ',
  y: 'ヴぃ',
  u: 'つぃ',
  p: 'ぞ',
  '[': 'ふぃ',
  a: 'ね',
  d: 'うぃ',
  g: 'ぺ',
  h: 'てぃ',
  j: 'り',
  l: 'ゆ',
  ';': 'げ',
  "'": 'ち',
  z: 'づ',
  x: 'でぃ',
  v: 'ど',
  b: 'ぃ',
  n: 'じ',
  m: 'そ',
  '.': 'ひ',
  '/': 'み',
};

/** 後置`o`の面。 */
const SUFFIX_O: Record<string, string> = {
  w: 'め',
  r: 'ぬ',
  y: 'ヴぇ',
  u: 'つぇ',
  p: 'ぎ',
  '[': 'ふぇ',
  a: 'しぇ',
  d: 'うぇ',
  g: 'わ',
  h: 'ぼ',
  j: 'れ',
  k: 'いぇ',
  ';': 'ら',
  "'": 'ちぇ',
  c: 'へ',
  v: 'あ',
  b: 'ぇ',
  n: 'じぇ',
  m: 'ろ',
  ',': 'び',
};

/** 後置`s`の面。 */
const SUFFIX_S: Record<string, string> = {
  q: 'ぢょ',
  w: 'ょ',
  r: 'べ',
  t: 'ぴょ',
  y: 'ヴぉ',
  u: 'つぉ',
  p: 'ぎょ',
  '[': 'ふぉ',
  a: 'しょ',
  d: 'うぉ',
  g: 'ぜ',
  h: 'だ',
  j: 'りょ',
  k: 'ほ',
  l: 'も',
  ';': 'にょ',
  "'": 'ちょ',
  z: 'きょ',
  c: 'ぷ',
  v: 'ば',
  b: 'ぉ',
  n: 'じょ',
  m: 'を',
  ',': 'びょ',
  '.': 'ひょ',
  '/': 'みょ',
};

/** 後置`f`の面。 */
const SUFFIX_F: Record<string, string> = {
  q: 'ぢゅ',
  w: 'え',
  r: 'ゅ',
  t: 'ぴゅ',
  y: 'ヴゅ',
  u: 'つ',
  p: 'ぎゅ',
  '[': 'ふゅ',
  a: 'しゅ',
  d: 'お',
  h: 'てゅ',
  j: 'りゅ',
  k: 'ず',
  l: 'よ',
  ';': 'にゅ',
  "'": 'ちゅ',
  z: 'きゅ',
  x: 'でゅ',
  c: 'ざ',
  v: 'どぅ',
  b: 'ぅ',
  n: 'じゅ',
  m: 'とぅ',
  ',': 'びゅ',
  '.': 'ひゅ',
  '/': 'みゅ',
};

export const TSUKIMISOU_EXTRACT_FACES: Face[] = [
  face([], 'prefix', BASE),
  face(['e'], 'suffix', SUFFIX_E),
  face(['i'], 'suffix', SUFFIX_I),
  face(['o'], 'suffix', SUFFIX_O),
  face(['s'], 'suffix', SUFFIX_S),
  face(['f'], 'suffix', SUFFIX_F),
];

const layout: Layout = fromFaces('tsukimisou-extract', '月見草エキス配列', TSUKIMISOU_EXTRACT_FACES);
layout.legends.delete(THUMB_KEY.LT);
layout.legends.delete(THUMB_KEY.RT);
export const TSUKIMISOU_EXTRACT = withAliases(layout, ['つきみそうえきす', 'つきみそうえきすはいれつ']);
