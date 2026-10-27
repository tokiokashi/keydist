import { THUMB_KEY } from '../shapes/geometry.ts';
import { faceFromEntries, fromFaces, withAliases, type Face, type FaceMode, type Layout } from './types.ts';

/**
 * 弓配列1.0.2 (Stable)。
 * 作者sleepwlkの記事「弓配列1.0.2 (Stable)」（2015-05-18）が本文に載せる文字配置と、
 * 拗音・外来音拡張の表を仕様根拠にする。
 * https://sleepwlk.hatenadiary.org/entry/20150518/yumi
 * 出典との突き合わせは `test/fixtures/sources/yumi.json` と `yumi.test.ts` を参照。
 *
 * `d`（★）`s`（☆）`k`（◆）`l`（◇）は前置シフトで、単打の面にかなを持たない。4つの面は
 * 同じ手のキーにも文字を持ち、対象のキーが重なるので、面ごとに別の層にする。
 * 濁音・半濁音は清音と別のキーに置かれていて、合成はしない。
 *
 * 拗音・外来音拡張は後置で、`b`（ゃ）`x`（ゅ）`z`（ょ）を特定のキーの後に押す。
 * この3つのキーは単打でも ゃ ゅ ょ を出す。`n` `b` は ひゃ の1字になり、く と ゃ を
 * 続けて出す打ち方は無い。
 * 多重シフトの面（記号・ギリシャ文字・キリル文字・矢印などで、かなの本体を持たない）と、
 * JISにしか無いキー（`jis-ro` `jis-]`）を最初のキーにする拡張の5件は表さない。
 * JISの `@` はANSIの `[`、`:` は `'` に写している。
 */

const face = (trigger: string[], mode: FaceMode, entries: Record<string, string>, layer?: string): Face => ({
  ...faceFromEntries(trigger, mode, entries),
  ...(layer === undefined ? {} : { layer }),
  inputRole: trigger.length > 0 ? 'modifier' : 'layer',
  ...(trigger.length > 0 ? { triggerPersistence: 'single' as const } : {}),
});

const BASE: Record<string, string> = {
  '-': 'ふ',
  q: 'ど',
  w: 'の',
  e: 'か',
  r: 'と',
  t: 'あ',
  y: 'む',
  u: 'う',
  i: 'い',
  o: 'し',
  p: 'ー',
  '[': 'じ',
  ']': '・',
  a: 'す',
  f: 'て',
  g: 'た',
  h: 'き',
  j: 'ん',
  ';': 'で',
  "'": 'ち',
  z: 'ょ',
  x: 'ゅ',
  c: 'ま',
  v: 'に',
  b: 'ゃ',
  n: 'く',
  m: 'っ',
  ',': '、',
  '.': '。',
  '/': 'ヴ',
};

/** `d`（★）を前置した時の面。 */
const SHIFT_D: Record<string, string> = {
  '-': '―',
  q: 'ヶ',
  u: 'ぎ',
  i: 'れ',
  o: 'み',
  p: '？',
  '[': '「',
  ']': '」',
  a: 'ぇ',
  s: 'ぞ',
  f: 'ぉ',
  h: 'ひ',
  j: 'り',
  k: 'こ',
  l: 'は',
  ';': 'よ',
  n: 'ぱ',
  m: 'ぷ',
  ',': '（',
  '.': '）',
};

/** `s`（☆）を前置した時の面。 */
const SHIFT_S: Record<string, string> = {
  q: 'ヵ',
  e: 'ゎ',
  u: 'ぐ',
  i: 'お',
  o: 'や',
  p: '！',
  a: 'ぃ',
  d: 'ぽ',
  f: 'ぁ',
  h: 'ず',
  j: 'る',
  k: 'つ',
  l: 'そ',
  ';': 'さ',
  n: 'ざ',
  m: 'ぺ',
};

/** `k`（◆）を前置した時の面。 */
const SHIFT_K: Record<string, string> = {
  w: 'め',
  e: 'え',
  r: 'ご',
  t: 'げ',
  a: 'を',
  s: 'が',
  d: 'も',
  f: 'ら',
  g: 'ば',
  j: 'わ',
  l: 'ぢ',
  ';': 'ぴ',
  z: 'ぜ',
  x: 'ぼ',
  c: 'ゆ',
  v: 'ね',
  b: 'ゐ',
};

/** `l`（◇）を前置した時の面。 */
const SHIFT_L: Record<string, string> = {
  w: 'ほ',
  e: 'ろ',
  r: 'へ',
  a: 'せ',
  s: 'だ',
  d: 'け',
  f: 'な',
  g: 'ぶ',
  j: 'ぅ',
  k: 'び',
  ';': 'ぬ',
  z: 'べ',
  c: '…',
  v: 'づ',
  b: 'ゑ',
};

/** `b`（ゃ）を最初のキーの後に押した時の面。 */
const SUFFIX_B: Record<string, string> = {
  '6': 'ぢゃ',
  '7': 'ぐぁ',
  '8': 'うぁ',
  '-': 'ふぁ',
  y: 'くぁ',
  u: 'ぎゃ',
  p: 'みゃ',
  f: 'とぅ',
  j: 'りゃ',
  ';': 'どぅ',
  n: 'ひゃ',
  m: 'びゃ',
  ',': 'ぴゃ',
  '/': 'ヴぁ',
};

/** `x`（ゅ）を最初のキーの後に押した時の面。 */
const SUFFIX_X: Record<string, string> = {
  '6': 'ぢゅ',
  '7': 'ひぇ',
  '8': 'うぇ',
  '9': 'じぇ',
  '0': 'しぇ',
  '=': 'ふぇ',
  y: 'くぇ',
  u: 'ぎゅ',
  i: 'いぇ',
  p: 'みゅ',
  j: 'りゅ',
  c: 'ぴぇ',
  n: 'ひゅ',
  m: 'びゅ',
  ',': 'ぴゅ',
  '.': 'ヴぇ',
};

/** `z`（ょ）を最初のキーの後に押した時の面。 */
const SUFFIX_Z: Record<string, string> = {
  '6': 'ぢょ',
  '7': 'うぃ',
  '8': 'うぉ',
  '9': 'くぃ',
  '0': 'すぃ',
  '-': 'ふぉ',
  '=': 'ふぃ',
  y: 'くぉ',
  u: 'ぎょ',
  p: 'みょ',
  f: 'てぃ',
  j: 'りょ',
  ';': 'でぃ',
  c: 'ずぃ',
  n: 'ひょ',
  m: 'びょ',
  ',': 'ぴょ',
  '.': 'ヴぃ',
  '/': 'ヴぉ',
};

export const YUMI_FACES: Face[] = [
  face([], 'prefix', BASE),
  face(['d'], 'prefix', SHIFT_D, '★シフト'),
  face(['s'], 'prefix', SHIFT_S, '☆シフト'),
  face(['k'], 'prefix', SHIFT_K, '◆シフト'),
  face(['l'], 'prefix', SHIFT_L, '◇シフト'),
  face(['b'], 'suffix', SUFFIX_B, '拗音・外来音（ゃ）'),
  face(['x'], 'suffix', SUFFIX_X, '拗音・外来音（ゅ）'),
  face(['z'], 'suffix', SUFFIX_Z, '拗音・外来音（ょ）'),
];

const layout: Layout = fromFaces('yumi', '弓配列', YUMI_FACES);
layout.legends.delete(THUMB_KEY.LT);
layout.legends.delete(THUMB_KEY.RT);
export const YUMI = withAliases(layout, ['ゆみ', 'ゆみはいれつ']);
