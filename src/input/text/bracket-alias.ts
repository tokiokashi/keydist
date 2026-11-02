import type { Layout } from '#input/layouts/types.ts';

/**
 * 二重かぎ括弧から、同じ入力として打つかぎ括弧への別名（仕様 §4）。
 * 変換で出す文字として、`『』` は `「」` と同じ物理入力で打つ。
 */
const BRACKET_ALIASES: Readonly<Record<string, string>> = { '『': '「', '』': '」' };

type AliasSource = Pick<Layout, 'canonicalInputs' | 'romajiTable'>;

/** 配列（ローマ字配列はローマ字テーブルを含む）が自分の出力として持たない二重かぎ括弧だけの別名。 */
export function bracketAliasesFor(layout: AliasSource): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const [from, to] of Object.entries(BRACKET_ALIASES)) {
    const owns = (heading: string) => heading.includes(from);
    const has = [...layout.canonicalInputs.keys()].some(owns) || (layout.romajiTable !== undefined && [...layout.romajiTable.keys()].some(owns));
    if (!has) aliases[from] = to;
  }
  return aliases;
}

/** テキストの二重かぎ括弧に、配列に応じた別名を当てる。文字数は変わらない。 */
export function applyBracketAliases(text: string, layout: AliasSource): string {
  const aliases = bracketAliasesFor(layout);
  if (Object.keys(aliases).length === 0) return text;
  return [...text].map((char) => aliases[char] ?? char).join('');
}
