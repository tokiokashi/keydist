/**
 * 読みを選ぶ候補の表。表記 → 読み（ひらがな）。読みが2つ以上ある表記だけを持つ。
 * 辞書の元のデータ（mecab-ipadic）から作ってあり、漢字を含むテキストを直す時にだけ読み込む。
 */
export type ReadingCandidateTable = Readonly<Record<string, readonly string[]>>;

/**
 * 表記の読みの候補。表の読みに、辞書が返した読みを足す（活用形など、表に無い読みがあるため）。
 * 重複しない。表の読みが先で、表に無い辞書の読みが後に付く。
 */
export function candidatesFor(table: ReadingCandidateTable, surface: string, dictionaryReadings: readonly string[]): string[] {
  const fromTable = Object.hasOwn(table, surface) ? table[surface]! : [];
  return [...new Set([...fromTable, ...dictionaryReadings])];
}
