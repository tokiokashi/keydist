import type { Layout } from './types.ts';
import { isFaceUserLayout, type UserLayout } from './user-layouts.ts';

/**
 * 配列の「種類」（打ち方はテキストの言語×配列の種類から導く、の後者）。
 *
 * - `alpha`: 英字を直接打つ配列。日本語テキストにはローマ字変換を介して使う
 *   （qwerty・dvorak・colemak系・workman・大西系）
 * - `kana`: かなをそのまま打つ配列。ローマ字変換を経ない（なぎ系・NICOLA・新配列系等）
 *
 * **暫定。この対応は `src/input/layouts/index.ts` の `LAYOUTS` / `LAYOUTS_JA` の構成を
 * そのまま写したもので、正しさは検証していない。**
 * 例えば大西配列のTesterは実際にはローマ字入力になっていないまま放置されている等、
 * 配列ごとに対応がおかしい箇所がある。後で見直す前提で、対応表はここ1か所に閉じ込める
 * （`Layout` オブジェクトの形からは決まらない。理由は `#input/setup/types.ts` の
 * `Setup` 先頭コメント参照: 同じidの配列が`LAYOUTS`と`LAYOUTS_JA`の両方に存在し、
 * `LAYOUT_BY_ID` は後勝ちでJA側の実体を保持するため、`Layout.romajiTable` の有無から
 * 「かな配列かどうか」を逆算できない）。
 */
export type LayoutKind = 'alpha' | 'kana';

/**
 * 組み込みのかな配列のid一覧（`src/input/layouts/index.ts` の `LAYOUTS_JA` のうち、
 * `withRomaji` を通さずそのまま並べている配列と一致させる）。
 * ここに無いid（大西系・英字系）は `alpha` 扱いにする。
 */
const BUILT_IN_KANA_LAYOUT_IDS: ReadonlySet<string> = new Set([
  'naginata-v18',
  'nicola',
  'shin-koume',
  'asuka',
  'shin-jis-prefix',
  'shin-jis-simultaneous',
  'shingeta',
  'tsuki-2-263',
  'gekkou',
  'tsuki-u9',
  'tsukimisou',
  'yumi',
  'kawasemi-plus',
  'jis-kana',
]);

/** 組み込み配列のidから種類を引く。未知のidは`alpha`にする（英字系がほとんどのため）。 */
export function builtInLayoutKind(layoutId: string): LayoutKind {
  return BUILT_IN_KANA_LAYOUT_IDS.has(layoutId) ? 'kana' : 'alpha';
}

/**
 * 自作配列（`UserLayout`）の種類。面で定義する配列（`faces`）はローマ字を経ずにかなを打つので `kana`、
 * 段の文字で定義する配列はローマ字表を挟むので `alpha` にする。
 *
 * 英語テキストには、`deriveInputMethod`（`#input/setup/input-method.ts`）が
 * 「かな配列は使えない」という原則を自作配列にも一律で適用する
 * （面で定義する自作配列は英語テキストには使えない、と判定する）。
 */
export function userLayoutKind(layout: UserLayout): LayoutKind {
  return isFaceUserLayout(layout) ? 'kana' : 'alpha';
}

/**
 * `Layout` の種類を引く。組み込みか自作かで参照先が違う（組み込みはid表、自作は
 * 元の `UserLayout` が面で定義されているか）ため、自作配列の一覧を呼び出し側から渡してもらう。
 * `userLayouts` に無いidは組み込み扱いにする。
 */
export function layoutKind(layout: Layout, userLayouts: ReadonlyMap<string, UserLayout>): LayoutKind {
  const user = userLayouts.get(layout.id);
  return user ? userLayoutKind(user) : builtInLayoutKind(layout.id);
}
