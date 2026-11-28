import type { Layout } from '#input/layouts/types.ts';
import { canonicalInputAlternativeIdentity, type CanonicalInputMap, type InputAlternative } from '#input/semantics/index.ts';

/**
 * 全角形の記号（U+FF01〜U+FF5E）から、対応する半角の記号への別名（仕様 §4）。
 * 全角形の英字・数字は別の文字として扱う。，と．は日本語の句読点の解決（仕様 §4.6）と重なるので入れない。
 */
export const EVALUATION_CHAR_ALIASES: Readonly<Record<string, string>> = (() => {
  const aliases: Record<string, string> = {};
  for (let code = 0xff01; code <= 0xff5e; code++) {
    const char = String.fromCodePoint(code);
    if (/[\p{L}\p{N}]/u.test(char) || char === '，' || char === '．') continue;
    aliases[char] = String.fromCodePoint(code - 0xfee0);
  }
  return aliases;
})();

/** 別名を持つ字（全角形の記号）が入りうる範囲。見出しの大半はこの範囲の字を含まないので、別名を当てる前の足切りに使う。 */
const FULLWIDTH_SYMBOL_RANGE = /[\uff01-\uff5e]/;

export const normalizeEvaluationChar = (char: string): string => EVALUATION_CHAR_ALIASES[char] ?? char;

/** 文字列の各文字に全角形の記号の別名を当てる。文字数は変わらない。 */
export const normalizeEvaluationHeading = (heading: string): string =>
  FULLWIDTH_SYMBOL_RANGE.test(heading) ? [...heading].map(normalizeEvaluationChar).join('') : heading;

const normalizedCanonicalInputsCache = new WeakMap<object, CanonicalInputMap>();

/**
 * 配列の出力の見出しにも、テキストと同じ別名を当てた対応表（仕様 §4）。
 * 別名で同じ見出しになる出力は、代わりの打ち方を併せて持つ。見出しが別名を含まない配列はそのまま返す。
 * 評価とTesterが、同じ見出しの表で打ち方を探す。
 */
export function evaluationCanonicalInputs(layout: Pick<Layout, 'canonicalInputs'>): CanonicalInputMap {
  const source = layout.canonicalInputs;
  const cached = normalizedCanonicalInputsCache.get(source);
  if (cached) return cached;
  let changed = false;
  for (const heading of source.keys()) {
    if (normalizeEvaluationHeading(heading) !== heading) {
      changed = true;
      break;
    }
  }
  let result: CanonicalInputMap = source;
  if (changed) {
    const merged = new Map<string, InputAlternative[]>();
    // 打ち方が2つ以上になった見出しだけ、重複を見分けるための識別子を作る。見出しの数万に1つずつ作ると、文字列化だけで時間がかかる
    const identitiesByHeading = new Map<string, Set<string>>();
    for (const [heading, alternatives] of source) {
      const key = normalizeEvaluationHeading(heading);
      let current = merged.get(key);
      if (current === undefined) {
        current = [];
        merged.set(key, current);
      }
      for (const alternative of alternatives) {
        if (current.length === 0) {
          current.push(alternative);
          continue;
        }
        let identities = identitiesByHeading.get(key);
        if (identities === undefined) {
          identities = new Set(current.map(canonicalInputAlternativeIdentity));
          identitiesByHeading.set(key, identities);
        }
        const identity = canonicalInputAlternativeIdentity(alternative);
        if (identities.has(identity)) continue;
        identities.add(identity);
        current.push(alternative);
      }
    }
    result = merged;
  }
  normalizedCanonicalInputsCache.set(source, result);
  return result;
}
