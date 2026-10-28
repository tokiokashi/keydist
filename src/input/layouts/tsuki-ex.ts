import { faceFromEntries, fromFaces, withAliases, type Face, type Layout } from './types.ts';
import { THUMB_KEY } from '../shapes/geometry.ts';

/**
 * 月配列E-X。
 * 作者enin氏が記事で配布するGoogle日本語入力のローマ字設定ファイル `google-moon_ex-001us.txt`（US用、版は001。記事の日付は2016-03-30）を仕様根拠にする。
 * http://blog.livedoor.jp/eninlog/archives/4775068.html
 * 定義ファイルとの突き合わせは `test/fixtures/sources/tsuki-ex.json` と `tsuki-ex.test.ts` を参照。
 *
 * 単打の面は33キー。`d`（、）`k`（。）`l`（？）も単打で句読点を出し、同時に前置のトリガーになる。
 * `d` `k` `l` を押してから次のキーを打つと、その前置の面（D面・K面・L面）の文字が出る。
 * D面とK面は、反対の手のキーに加えて同じ手のキーにも文字を持つ（作者の言う「同手シフト」）。
 * 同じ句読点は面にもあり（、はD面の `f`、。はK面の `j`、？はK面の `;`）、単打で打てない環境のために作者が置いている。
 * 面を並べる順で打鍵の既定が決まるので、単打の面を先頭に置き、句読点は単打を既定にする。
 * 単打の句読点に続けて前置の面のキーを打つと、前置の面の入力と読まれるので、継ぎ目に確定の打鍵が入る（仕様 §4.7）。
 * 確定の打鍵は面の定義から決まり、作者の定義ファイルが個別に持つ継ぎ目の読み方は表さない。
 * 面には、記号のセルもANSIのキーに載るものは全て入れる。確定の打鍵は前置の面の出力キーの全セルから決まるため。
 * ゃ ゅ はD面、小書きの ぁ ぃ ぅ ぇ ぉ はK面、ょ は単打。濁音・半濁音はL面と、単打の面とは別のキーにあり、合成はしない。
 * 配列図のD面にある `[`（ゑ）と `'`（ゐ）は、作者の設定ファイルに無いので表さない。
 * JISの `@` はANSIの `[`、`:` は `'`、`^` は `=` に写している。
 */

const face = (trigger: string[], entries: Record<string, string>): Face => ({
  ...faceFromEntries(trigger, 'prefix', entries),
  inputRole: 'layer',
  ...(trigger.length > 0 ? { triggerPersistence: 'single' as const } : {}),
});

/** 単打の面。`d` `k` `l` も単打で句読点を出す。 */
const BASE: Record<string, string> = {
  '-': 'ー',
  q: 'わ',
  w: 'た',
  e: 'っ',
  r: 'て',
  t: 'ょ',
  y: 'つ',
  u: 'ん',
  i: 'い',
  o: 'し',
  p: 'け',
  '[': 'へ',
  a: 'の',
  s: 'と',
  d: '、',
  f: 'か',
  g: 'こ',
  h: 'く',
  j: 'う',
  k: '。',
  l: '？',
  ';': 'な',
  "'": 'ひ',
  z: 'す',
  x: 'は',
  c: 'に',
  v: 'で',
  b: 'さ',
  n: 'ま',
  m: 'る',
  ',': 'き',
  '.': 'も',
  '/': 'ー',
};

/** 前置 `d` の面。 */
const AFTER_D: Record<string, string> = {
  '6': '＾',
  '7': '＆',
  '8': '＊',
  '9': '’',
  '0': '”',
  '-': '；',
  '=': '：',
  w: 'づ',
  r: 'ヴ',
  t: 'ぢ',
  y: 'ぐ',
  u: 'ち',
  i: 'ゅ',
  o: 'せ',
  p: 'め',
  a: '！',
  s: '「',
  f: '、',
  g: '・',
  h: 'む',
  j: 'ら',
  k: 'り',
  l: 'み',
  ';': 'そ',
  z: '（',
  v: '）',
  n: 'ゃ',
  m: 'ふ',
  ',': 'や',
  '.': 'べ',
  '/': 'び',
};

/** 前置 `k` の面。 */
const AFTER_K: Record<string, string> = {
  '1': '￥',
  '2': '＠',
  '3': '＃',
  '4': '＄',
  '5': '％',
  q: 'ぬ',
  w: 'ご',
  e: 'れ',
  r: 'よ',
  t: 'ぼ',
  y: '――',
  u: 'ぁ',
  o: 'ぃ',
  a: 'え',
  s: 'あ',
  d: 'お',
  f: 'が',
  g: 'を',
  h: '……',
  j: '。',
  l: '」',
  ';': '？',
  z: 'ゆ',
  x: 'ね',
  c: 'げ',
  v: 'ほ',
  b: 'ろ',
  n: 'ぅ',
  m: 'ぇ',
  '.': 'ぉ',
};

/** 前置 `l` の面（濁音・半濁音）。 */
const AFTER_L: Record<string, string> = {
  q: 'ざ',
  w: 'ぎ',
  e: 'ず',
  r: 'ぜ',
  t: 'ぞ',
  y: '《',
  u: '》',
  i: '〜',
  a: 'ば',
  s: 'じ',
  d: 'ど',
  f: 'だ',
  g: 'ぶ',
  h: '【',
  j: '】',
  k: '／',
  z: 'ぱ',
  x: 'ぴ',
  c: 'ぷ',
  v: 'ぺ',
  b: 'ぽ',
  n: '『',
  m: '』',
};

export const TSUKI_EX_FACES: Face[] = [face([], BASE), face(['d'], AFTER_D), face(['k'], AFTER_K), face(['l'], AFTER_L)];

const layout: Layout = fromFaces('tsuki-ex', '月配列E-X', TSUKI_EX_FACES);
layout.legends.delete(THUMB_KEY.LT);
layout.legends.delete(THUMB_KEY.RT);
export const TSUKI_EX = withAliases(layout, ['つきいーえっくす', 'つきはいれついーえっくす']);
