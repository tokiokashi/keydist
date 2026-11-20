import { containsKanji } from '#input/text/reading.ts';
import type { Layout } from './types.ts';

const kanjiDirectByHeadings = new WeakMap<object, boolean>();

/**
 * 漢直の配列（漢字を直接打つ入力）か。出力に漢字（`\p{Script=Han}`）を含む見出しを1つ以上持つ配列（仕様 §4.3）。
 * 見出しの表は配列ごとに作った後は書き換えないので、表ごとに1度だけ判定する。
 */
export function isKanjiDirectLayout(layout: Pick<Layout, 'canonicalInputs'>): boolean {
  const known = kanjiDirectByHeadings.get(layout.canonicalInputs);
  if (known !== undefined) return known;
  let found = false;
  for (const heading of layout.canonicalInputs.keys()) {
    if (containsKanji(heading)) {
      found = true;
      break;
    }
  }
  kanjiDirectByHeadings.set(layout.canonicalInputs, found);
  return found;
}
