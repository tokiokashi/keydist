import type { TextLanguage } from './samples.ts';

export type { TextLanguage } from './samples.ts';

/**
 * かな判定に使う文字範囲（#544 §5「自由入力は自動判定し、かなを含めば日本語」）。
 *
 * - ひらがな（U+3040-309F）・カタカナ（U+30A0-30FF、長音記号ーや ヶ を含む）を対象にする。
 *   長音記号・拗音・小書き文字もこの範囲に収まるので個別に足す必要はない
 * - 半角カナ（U+FF66-FF9F）も対象にする。かな漢字変換を経ない自由入力に混ざりうるため
 * - 漢字（CJK統合漢字）・全角記号・々（々自体は漢字の踊り字でU+3005、この範囲に入らない）は
 *   対象外にする。判定規則は文字どおり「かな」を見るもので、日本語テキストの判定を
 *   「日本語として意味が通るか」まで広げない。keydistが扱うテキストはローマ字 / かな直接
 *   入力の対象なので、実用上のJPテキストには助詞等でかなが必ず混ざる。純粋な漢字のみの
 *   テキストは境界ケースとして「かなを含まない」= 'en' 側に倒す（この判定を字面どおりに
 *   保つ方が、例外を増やして「かな相当」を広げるより境界線を説明しやすい）
 */
const KANA_PATTERN = /[぀-ゟ゠-ヿｦ-ﾟ]/u;

/** テキストにかなが含まれるかどうかから言語を自動判定する。 */
export function detectTextLanguage(text: string): TextLanguage {
  return KANA_PATTERN.test(text) ? 'ja' : 'en';
}

/**
 * テキストの言語は「自動判定した結果」と「利用者が手動で直した指定」を分けて持つ
 * （#544 §5・用語集「テキストは言語を属性に持つ」）。`override` が無ければ `detected` を使う。
 * 自動判定の結果そのものを上書きで潰さないのは、テキストを直した時に再判定した
 * `detected` と、利用者の意図である `override` を両方残しておくため。
 */
export interface TextLanguageSelection {
  readonly detected: TextLanguage;
  readonly override?: TextLanguage;
}

/** 新しいテキストに対する既定の選択（自動判定のみ、手動指定なし）を作る。 */
export function detectTextLanguageSelection(text: string): TextLanguageSelection {
  return { detected: detectTextLanguage(text) };
}

/** 選択から実際に使う言語を1つに決める。手動指定があればそれを優先する。 */
export function resolveTextLanguage(selection: TextLanguageSelection): TextLanguage {
  return selection.override ?? selection.detected;
}
