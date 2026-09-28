import type { Layout } from './types.ts';
import type { UserLayout } from './user-layouts.ts';

/**
 * 配列の「種類」（#544 用語集「打ち方はテキストの言語×配列の種類から導く」の後者）。
 *
 * - `alpha`: 英字を直接打つ配列。日本語テキストにはローマ字変換を介して使う
 *   （qwerty・dvorak・colemak系・workman・大西系）
 * - `kana`: かなをそのまま打つ配列。ローマ字変換を経ない（なぎ系・NICOLA・新配列系等）
 *
 * **暫定。この対応は現状のAnalyzerの挙動（`src/legacy/main.ts` の `layoutsOf` が
 * モードごとにどの配列一覧・ローマ字表を組み立てているか、`src/input/layouts/index.ts` の
 * `LAYOUTS` / `LAYOUTS_JA` の構成）をそのまま写したもので、正しさは検証していない。**
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
  'kawasemi-kai',
  'kawasemi-plus',
]);

/** 組み込み配列のidから種類を引く。未知のidは`alpha`にする（英字系がほとんどのため）。 */
export function builtInLayoutKind(layoutId: string): LayoutKind {
  return BUILT_IN_KANA_LAYOUT_IDS.has(layoutId) ? 'kana' : 'alpha';
}

/**
 * 自作配列（`UserLayout`）の種類。`direct: true` は「かなをローマ字へ変換せず、
 * sequencesを直接使う」（`user-layouts.ts` の `UserLayout.direct` コメント）ことを表す
 * フィールドで、これは今のAnalyzerが日本語モードで
 * 「ローマ字表を挟むか（`romaji`）／挟まないか（`kana`）」を切り替える条件そのもの
 * （`src/legacy/main.ts` の `layoutsOf`）。そのため `direct` を `alpha` / `kana` の
 * 判定にそのまま使う。
 *
 * 英語モードでの現状挙動との食い違いに注意: 現状の `layoutsOf('en')` は
 * `direct` の値によらず全ての自作配列を「ローマ字変換なし」（英語直接入力）として扱う。
 * これは組み込みのかな配列が英語モードの一覧に一切現れない（`LAYOUTS` に含まれない）
 * こととは対応が違う。今回はこの食い違いを解消せず、`deriveInputMethod`
 * （`#input/setup/input-method.ts`）側で「かな配列 + 英語テキストは使えない」という
 * #544 §4 の原則を自作配列にも一律で適用する（＝ `direct: true` の自作配列は
 * 英語テキストには使えない、と判定する）。現状の英語モードの挙動とは変わるが、
 * 「英語テキストにかな配列は使えない」という原則と矛盾する現状の方を保存する理由が
 * ないと判断した。決めきれなかった点として引き継ぐ
 */
export function userLayoutKind(layout: UserLayout): LayoutKind {
  return layout.direct === true ? 'kana' : 'alpha';
}

/**
 * `Layout` の種類を引く。組み込みか自作かで参照先が違う（組み込みはid表、自作は
 * 元の `UserLayout.direct`）ため、自作配列の一覧を呼び出し側から渡してもらう。
 * `userLayouts` に無いidは組み込み扱いにする。
 */
export function layoutKind(
  layout: Layout,
  userLayouts: ReadonlyMap<string, UserLayout>,
): LayoutKind {
  const user = userLayouts.get(layout.id);
  return user ? userLayoutKind(user) : builtInLayoutKind(layout.id);
}
