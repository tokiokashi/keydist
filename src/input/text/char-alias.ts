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

export const normalizeEvaluationChar = (char: string): string => EVALUATION_CHAR_ALIASES[char] ?? char;

/** 文字列の各文字に全角形の記号の別名を当てる。文字数は変わらない。 */
export const normalizeEvaluationHeading = (heading: string): string => [...heading].map(normalizeEvaluationChar).join('');

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
    for (const [heading, alternatives] of source) {
      const key = normalizeEvaluationHeading(heading);
      const current = merged.get(key) ?? [];
      for (const alternative of alternatives) {
        const identity = canonicalInputAlternativeIdentity(alternative);
        if (!current.some((candidate) => canonicalInputAlternativeIdentity(candidate) === identity)) current.push(alternative);
      }
      merged.set(key, current);
    }
    result = merged;
  }
  normalizedCanonicalInputsCache.set(source, result);
  return result;
}
