import { THUMB_KEY } from '../shapes/geometry.ts';
import { faceFromEntries, fromFaces, withAliases, withComposedOutputs, type Face, type Layout } from './types.ts';

/**
 * 中指シフト月光。
 * 作者tkenが公開したMS-IMEのローマ字テーブル `gc_20210517`（2021-06-01の記事
 * 「中指シフト月光をレジストリに書き込む」）を仕様根拠にする。
 * https://t-ken.blogspot.com/2021/06/blog-post.html
 * 定義の復号と別の出典との照合は `test/fixtures/sources/gekkou.json` と `gekkou.test.ts` を参照。
 *
 * `d` と `k` はどちらも前置シフトで、単打の面にかなを持たない。2つのシフトの面は
 * 対象のキーがほぼ重なる（`f` `g` のかなだけが違う）。反対の手のシフトを既定の打ち方にするため、
 * 先に反対の手の面、後に同じ手の面を並べる。同じかなを2通りで打てるセルは、先に並べた面が
 * 打鍵の既定になる。作者が同じ手のシフトで打つと書いているゅ・ゃ（`d` + `f` `g`）は
 * 反対の手のシフトに別のかなが割り当たっているので、同じ手の面にだけある。
 * 濁音・半濁音は清音の後に ゛ ゜ を打つ後置で、定義にはこの2文字しかない。
 * 清濁の対応は、かな配列テスターの定義（清濁同置）に合わせる。
 * JISの `@` `:` はANSIの `[` `'` に写している。
 */

const LEFT_KEYS = new Set([...'qwertasdfgzxcvb']);

const face = (trigger: string[], entries: Record<string, string>, layer?: string): Face => ({
  ...faceFromEntries(trigger, 'prefix', entries),
  ...(layer === undefined ? {} : { layer }),
  inputRole: trigger.length > 0 ? 'modifier' : 'layer',
  ...(trigger.length > 0 ? { triggerPersistence: 'single' as const } : {}),
});

const BASE: Record<string, string> = {
  q: 'も',
  w: 'と',
  e: 'は',
  r: 'て',
  t: 'ょ',
  y: 'つ',
  u: 'ん',
  i: 'い',
  o: 'の',
  p: 'り',
  '[': 'っ',
  a: 'し',
  s: 'か',
  f: 'こ',
  g: 'た',
  h: 'く',
  j: 'う',
  l: '゛',
  ';': '゜',
  "'": 'ー',
  z: 'す',
  x: 'き',
  c: 'に',
  v: 'な',
  b: 'さ',
  n: 'ま',
  m: 'る',
  ',': '、',
  '.': '。',
};

/** `d` を前置した時の面。 */
const SHIFT_D: Record<string, string> = {
  q: 'ぁ',
  w: 'れ',
  e: 'せ',
  r: 'ほ',
  t: 'め',
  y: 'む',
  u: 'み',
  i: 'よ',
  o: 'ち',
  p: 'ぇ',
  a: 'ぃ',
  s: 'け',
  f: 'ゅ',
  g: 'ゃ',
  h: 'お',
  j: 'ふ',
  l: 'を',
  ';': 'え',
  "'": 'ゆ',
  z: 'ぅ',
  x: 'ね',
  c: 'へ',
  v: 'そ',
  b: 'や',
  n: 'わ',
  m: 'ろ',
  ',': 'ひ',
  '.': 'ぬ',
  '/': 'ぉ',
};

/** `k` を前置した時の面。`d` の面と違うのは `f` `g` だけ。 */
const SHIFT_K: Record<string, string> = { ...SHIFT_D, f: 'ら', g: 'あ' };

const pick = (entries: Record<string, string>, left: boolean): Record<string, string> =>
  Object.fromEntries(Object.entries(entries).filter(([key]) => LEFT_KEYS.has(key) === left));

const CROSS_LAYER = '中指シフト';
const SAME_HAND_LAYER = '中指シフト（同じ手）';

export const GEKKOU_FACES: Face[] = [
  face([], BASE),
  // 反対の手のシフト（既定の打ち方）
  face(['k'], pick(SHIFT_K, true), CROSS_LAYER),
  face(['d'], pick(SHIFT_D, false), CROSS_LAYER),
  // 同じ手のシフト
  face(['d'], pick(SHIFT_D, true), SAME_HAND_LAYER),
  face(['k'], pick(SHIFT_K, false), SAME_HAND_LAYER),
];

const layout: Layout = fromFaces('gekkou', '中指シフト月光', GEKKOU_FACES);

/** 清濁の対応はかな配列テスターの定義に合わせる。う の濁音は片仮名のヴ。 */
const VOICED: Record<string, string> = {
  か: 'が',
  き: 'ぎ',
  く: 'ぐ',
  け: 'げ',
  こ: 'ご',
  さ: 'ざ',
  し: 'じ',
  す: 'ず',
  せ: 'ぜ',
  そ: 'ぞ',
  た: 'だ',
  ち: 'ぢ',
  つ: 'づ',
  て: 'で',
  と: 'ど',
  は: 'ば',
  ひ: 'び',
  ふ: 'ぶ',
  へ: 'べ',
  ほ: 'ぼ',
  う: 'ヴ',
};

const SEMI_VOICED: Record<string, string> = {
  は: 'ぱ',
  ひ: 'ぴ',
  ふ: 'ぷ',
  へ: 'ぺ',
  ほ: 'ぽ',
};

const composed = withComposedOutputs(withComposedOutputs(layout, VOICED, '゛', '中指シフト月光'), SEMI_VOICED, '゜', '中指シフト月光');
composed.legends.delete(THUMB_KEY.LT);
composed.legends.delete(THUMB_KEY.RT);
export const GEKKOU = withAliases(composed, ['げっこう', 'ちゅうゆびしふとげっこう', 'なかゆびしふとげっこう']);
