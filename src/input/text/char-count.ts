/**
 * テキストの文字数（コードポイント数）。評価（`trace/generate.ts` の `inputChars`）と同じ数え方に揃える。
 * 書記素で数えると、結合文字（`か` + 結合用濁点）や絵文字の連結が1つにまとまり、解析が対象にした
 * 文字の数と一致しなくなるため、`length` や書記素ではなくコードポイントで数える。
 */
export function countTextCharacters(text: string): number {
  return [...text].length;
}
