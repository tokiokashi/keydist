import { faceFromEntries, fromFaces, withAliases, type Face, type FaceMode, type Layout } from './types.ts';
import { THUMB_KEY } from '../shapes/geometry.ts';

/**
 * 月林檎配列。
 * 作者menmentsu氏が記事で配布するGoogle日本語入力のローマ字テーブル（記事の更新日は2021-04-29）を仕様根拠にする。
 * https://menmentsu.hateblo.jp/entry/2021/01/12/230614
 * 定義ファイルとの突き合わせは`test/fixtures/sources/tsuki-ringo.json`と`tsuki-ringo.test.ts`を参照。
 *
 * 単打の面は33キー。`e`は単打で ょ を出し、直前に打ったキーの出力を小書き・別のかなへ変える後置の★でもある。
 * `i`は単打で ゛ を出し、直前に打ったキーの出力を濁音・半濁音へ変える後置の ゛ でもある。
 * 作者の実装例に従い、き は`caps-lock`、後置 ゛ の ぎ も`caps-lock`のセルに置く（`extraCells`）。
 * 後置`e`と`i`の面は、単打の面の各キーの後に打つ。後置の面のセルは、単打の面のかなから引いた出力で、
 * 未確定の出力が連鎖する行（れ→ふ→ぶ のように、★の面のかなにさらに ゛ を打つ行）は、最後の出力を面のセルにする。
 * その連鎖は、キー・`e`・`i`の3打の経路で、同じ出力を2打（キー・`i`）でも打てるので、面に入れない（げ ぼ ぶ ぱ べ ぽ ぞ の7字）。
 * せ の★は ぉ、ゃ の★は ぁ。定義ファイルとの違いは、出典のmanifestの`substitutions`に根拠と一緒に記録している。
 * 作者の定義にある、継ぎ目の読み方の個別の例外は表さない（確定の打鍵は面の定義から決まる）。
 * JISの`@`はANSIの`[`、`:`は`'`に写している。
 */

const face = (trigger: string[], mode: FaceMode, entries: Record<string, string>): Face => ({
  ...faceFromEntries(trigger, mode, entries),
  inputRole: 'layer',
  ...(trigger.length > 0 ? { triggerPersistence: 'single' as const } : {}),
});

/** 単打の面。`e` `i`も単打で出力を持つ。 */
const BASE: Record<string, string> = {
  'caps-lock': 'き',
  q: 'せ',
  w: 'こ',
  e: 'ょ',
  r: 'ら',
  t: 'さ',
  y: 'や',
  u: 'す',
  i: '゛',
  o: 'ん',
  p: 'ゃ',
  '[': 'ー',
  a: 'れ',
  s: 'し',
  d: 'て',
  f: 'と',
  g: 'く',
  h: 'は',
  j: 'か',
  k: 'い',
  l: 'う',
  ';': 'る',
  "'": 'っ',
  z: 'ち',
  x: 'よ',
  c: 'に',
  v: 'の',
  b: 'ゅ',
  n: 'な',
  m: 'た',
  ',': 'お',
  '.': 'め',
  '/': 'つ',
};

/** 後置`e`（★）の面。単打の面のキーを打った後に`e`を打つ。 */
const SUFFIX_E: Record<string, string> = {
  q: 'ぉ',
  w: 'ぃ',
  r: 'け',
  t: 'ろ',
  y: 'ほ',
  u: 'ね',
  o: 'み',
  p: 'ぁ',
  '[': 'ぅ',
  a: 'ふ',
  d: 'ぬ',
  f: 'り',
  g: '。',
  h: '、',
  j: 'あ',
  k: 'ま',
  l: 'え',
  ';': 'へ',
  "'": 'む',
  x: 'ゎ',
  v: 'も',
  b: 'ひ',
  n: 'そ',
  m: 'を',
  ',': 'わ',
  '.': 'ゆ',
  '/': 'ぇ',
};

/** 後置`i`（゛）の面。 */
const SUFFIX_I: Record<string, string> = {
  'caps-lock': 'ぎ',
  q: 'ぜ',
  w: 'ご',
  r: 'げ',
  t: 'ざ',
  y: 'ぼ',
  u: 'ず',
  o: 'ぴ',
  a: 'ぶ',
  s: 'じ',
  d: 'で',
  f: 'ど',
  g: 'ぐ',
  h: 'ば',
  j: 'が',
  k: 'ぱ',
  l: 'ゔ',
  ';': 'べ',
  "'": 'ぷ',
  z: 'ぢ',
  x: '・',
  c: 'ｗ',
  v: 'ぽ',
  b: 'び',
  n: 'ぞ',
  m: 'だ',
  '.': 'ぺ',
  '/': 'づ',
};

export const TSUKI_RINGO_FACES: Face[] = [face([], 'prefix', BASE), face(['e'], 'suffix', SUFFIX_E), face(['i'], 'suffix', SUFFIX_I)];

const layout: Layout = fromFaces('tsuki-ringo', '月林檎配列', TSUKI_RINGO_FACES);
layout.legends.delete(THUMB_KEY.LT);
layout.legends.delete(THUMB_KEY.RT);
export const TSUKI_RINGO = withAliases(layout, ['つきりんご', 'つきりんごはいれつ']);
