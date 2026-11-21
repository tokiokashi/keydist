import { containsKanji } from '#input/text/reading.ts';
import type { Layout } from './types.ts';

const kanjiDirectByHeadings = new WeakMap<object, boolean>();

/**
 * 漢直の配列（漢字を直接打つ入力）か。出力に漢字（`\p{Script=Han}`）を含む見出しを1つ以上持つ配列（仕様 §4.3）。
 * 見出しの表は配列ごとに作った後は書き換えないので、表ごとに1度だけ判定する。
 */
export function isKanjiDirectLayout(layout: Pick<Layout, 'canonicalInputs' | 'pendingTable'>): boolean {
  // 表を取得する前の配列は、表の代わりに宣言を読む。表を別のファイルとして配る配列は漢直だけ
  if (layout.pendingTable !== undefined) return true;
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
