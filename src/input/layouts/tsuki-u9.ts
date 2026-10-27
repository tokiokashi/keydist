import { faceFromEntries, fromFaces, withAliases, type Face, type Layout } from './types.ts';
import { THUMB_KEY } from '../shapes/geometry.ts';

/**
 * 月配列U9（U9完成版）。
 * 作者Uジローが公開した「菱」用の定義ファイル `tsuki_u9.zip` の `tsuki_U9.hh`（2013-01-11）と、
 * 配列図 `tsukiU9_L.gif`（同日）を仕様根拠にする。
 * http://yellow.ribbon.to/~ujiro/
 * 定義ファイルとの突き合わせは `test/fixtures/sources/tsuki-u9.json` と `tsuki-u9.test.ts` を参照。
 *
 * `d` `k` はシフト1、`s` `l` はシフト2（濁音・半濁音）の前置シフトで、単打の面にかなを持たない。
 * 作者の定義では、どちらのシフトのキーも全てのキーに効く。反対の手のシフトを既定の打ち方にするため、
 * 先に反対の手の面、後に同じ手の面を並べる。同じかなを2通りで打てるセルは、先に並べた面が
 * 打鍵の既定になる。反対の手の面だけで、作者の定義にある全てのかなと句読点を打てる。
 *
 * 次の入力は面で書けないので表さない。
 * - シフトのキー自身を対象にする入力（`d` `d`、`k` `k`、`s` `s`、`l` `l`）
 * - シフトとSpaceの入力（、 。）
 * - シフト2の後に `v` を押してから打つ3打の面。ふぁ ふぃ ふぇ ふぉ でぃ てぃ ちぇ は、
 *   ふ + ぁ のように分けて打つ扱いになる。作者はこの面を「オプション」としている
 * JISにしか無いキー（`jis-ro` `jis-]`）と、記号のセルも表さない。
 * JISの `@` はANSIの `[`、`:` は `'` に写している。
 */

const LEFT_KEYS = new Set([...'qwertasdfgzxcvb']);

const face = (trigger: string[], entries: Record<string, string>, layer?: string): Face => ({
  ...faceFromEntries(trigger, 'prefix', entries),
  ...(layer === undefined ? {} : { layer }),
  inputRole: trigger.length > 0 ? 'modifier' : 'layer',
  ...(trigger.length > 0 ? { triggerPersistence: 'single' as const } : {}),
});

const BASE: Record<string, string> = {
  q: 'ゅ',
  w: 'と',
  e: 'し',
  r: 'こ',
  t: 'ょ',
  y: 'つ',
  u: 'ん',
  i: 'い',
  o: 'か',
  p: 'り',
  '[': 'ー',
  ']': '「',
  a: 'は',
  f: 'て',
  g: 'た',
  h: 'く',
  j: 'う',
  ';': 'き',
  "'": 'ち',
  z: 'す',
  x: 'を',
  c: 'に',
  v: 'な',
  b: 'さ',
  n: 'っ',
  m: 'る',
  ',': 'の',
  '.': 'も',
  '/': 'へ',
};

/** シフト1（`d` または `k`）を前置した時の面。 */
const SHIFT_1: Record<string, string> = {
  q: 'ぁ',
  w: 'ゃ',
  e: 'ね',
  r: 'ら',
  t: 'め',
  y: 'ぬ',
  u: 'む',
  i: 'み',
  o: 'え',
  p: 'ぇ',
  a: 'ぃ',
  s: 'け',
  d: '、',
  f: 'あ',
  g: 'れ',
  h: 'ま',
  j: 'お',
  k: 'ほ',
  l: 'そ',
  ';': 'ろ',
  z: 'ぅ',
  x: 'や',
  c: 'せ',
  v: 'よ',
  b: 'ゆ',
  n: 'ひ',
  m: 'わ',
  ',': 'ふ',
  '.': 'ぃ',
  '/': 'ぉ',
};

/** シフト2（`s` または `l`）を前置した時の面。 */
const SHIFT_2: Record<string, string> = {
  q: '!',
  w: 'ど',
  e: 'じ',
  r: 'ご',
  y: 'づ',
  u: 'ぴ',
  i: 'ぽ',
  o: 'が',
  p: '?',
  a: 'ば',
  s: 'げ',
  d: '。',
  f: 'で',
  g: 'だ',
  h: 'ぐ',
  j: 'ヴ',
  k: 'ぼ',
  l: 'ぞ',
  ';': 'ぎ',
  "'": 'ぢ',
  z: 'ず',
  x: 'ぱ',
  c: 'ぜ',
  b: 'ざ',
  n: 'び',
  m: 'ぷ',
  ',': 'ぶ',
  '.': 'ぺ',
  '/': 'べ',
};

/** 左手か右手の対象だけを取り出す。シフトのキー自身は対象にしない。 */
const pick = (entries: Record<string, string>, left: boolean, trigger: string): Record<string, string> =>
  Object.fromEntries(Object.entries(entries).filter(([key]) => LEFT_KEYS.has(key) === left && key !== trigger));

const SHIFT_1_CROSS_LAYER = 'シフト1';
const SHIFT_2_CROSS_LAYER = 'シフト2';
const SHIFT_1_SAME_HAND_LAYER = 'シフト1（同じ手）';
const SHIFT_2_SAME_HAND_LAYER = 'シフト2（同じ手）';

export const TSUKI_U9_FACES: Face[] = [
  face([], BASE),
  // 反対の手のシフト（既定の打ち方）
  face(['k'], pick(SHIFT_1, true, 'k'), SHIFT_1_CROSS_LAYER),
  face(['d'], pick(SHIFT_1, false, 'd'), SHIFT_1_CROSS_LAYER),
  face(['l'], pick(SHIFT_2, true, 'l'), SHIFT_2_CROSS_LAYER),
  face(['s'], pick(SHIFT_2, false, 's'), SHIFT_2_CROSS_LAYER),
  // 同じ手のシフト
  face(['d'], pick(SHIFT_1, true, 'd'), SHIFT_1_SAME_HAND_LAYER),
  face(['k'], pick(SHIFT_1, false, 'k'), SHIFT_1_SAME_HAND_LAYER),
  face(['s'], pick(SHIFT_2, true, 's'), SHIFT_2_SAME_HAND_LAYER),
  face(['l'], pick(SHIFT_2, false, 'l'), SHIFT_2_SAME_HAND_LAYER),
];

const layout: Layout = fromFaces('tsuki-u9', '月配列U9', TSUKI_U9_FACES);
layout.legends.delete(THUMB_KEY.LT);
layout.legends.delete(THUMB_KEY.RT);
export const TSUKI_U9 = withAliases(layout, ['つきゆーきゅー', 'つきゆーきゅう', 'つきはいれつゆーきゅー']);
