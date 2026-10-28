import type { DraftFace } from '#input/layouts/face-layout-edit.ts';
import { gridPositionOf } from '#input/layouts/kana-face-layout.ts';

/**
 * 段ごとの文字列の欄と、キーごとの出力の対応。画面の外の純関数だけを置く。
 *
 * 欄の書き方:
 * - 1文字の出力はそのまま書く。空きキーは半角スペース
 * - 2文字以上の出力は、半角の二重引用符で囲む。囲みの中に `"` は書けないので、最初の `"` で囲みが閉じる。
 *   囲みが隣り合っても曖昧にならない（`"きゃ""きゅ"` は2つの出力）。
 *   `"` を含む出力を持つ段は欄から直せない（`hasQuoteOutput`）
 */

const QUOTE = '"';
const EMPTY = ' ';

/**
 * 図のキーのうち面の上の位置を持つものを、段（行）ごとに、列の小さい順に並べる。
 * 段の欄が割り当てる順で、出力欄のEnterが進む順（`nextOutputKey`）と同じ。
 */
export function figureRowKeys(figureKeys: readonly string[], rowCount: number): string[][] {
  const rows: { key: string; col: number }[][] = Array.from({ length: rowCount }, () => []);
  for (const key of figureKeys) {
    const position = gridPositionOf(key);
    if (position === undefined) continue;
    rows[position.row]?.push({ key, col: position.col });
  }
  return rows.map((row) => row.sort((a, b) => a.col - b.col).map((entry) => entry.key));
}

export type RowParse = { readonly ok: true; readonly outputs: readonly string[] } | { readonly ok: false; readonly reason: 'unclosed' | 'empty-quote' };

/** 欄の文字列を、キーごとの出力（空きキーは `''`）に読む。末尾の空きキーは落とす。 */
export function parseRowText(text: string): RowParse {
  const chars = [...text];
  const outputs: string[] = [];
  let index = 0;
  while (index < chars.length) {
    const char = chars[index]!;
    if (char !== QUOTE) {
      outputs.push(char === EMPTY ? '' : char);
      index += 1;
      continue;
    }
    let content = '';
    let closed = false;
    index += 1;
    while (index < chars.length) {
      const inner = chars[index]!;
      if (inner !== QUOTE) {
        content += inner;
        index += 1;
        continue;
      }
      closed = true;
      index += 1;
      break;
    }
    if (!closed) return { ok: false, reason: 'unclosed' };
    if (content === '') return { ok: false, reason: 'empty-quote' };
    outputs.push(content);
  }
  while (outputs.length > 0 && outputs[outputs.length - 1] === '') outputs.pop();
  return { ok: true, outputs };
}

/** 出力に `"` を含むキーがあるか。あれば欄の文字列に往復できないので、その段の欄は読み取り専用にする。 */
export const hasQuoteOutput = (outputs: readonly string[]): boolean => outputs.some((output) => output.includes(QUOTE));

/**
 * キーごとの出力を欄の文字列にする。末尾の空きキーは省く。囲んだ1文字は読み取りだけで受け、書き戻す時は囲まない。
 * `"` を含む出力もそのまま囲んで並べる。この文字列は表示だけで、読み戻さない。
 */
export function formatRowText(outputs: readonly string[]): string {
  const parts = outputs.map((output) => {
    if (output === '') return EMPTY;
    if (output.includes(QUOTE) || [...output].length >= 2) return `${QUOTE}${output}${QUOTE}`;
    return output;
  });
  while (parts.length > 0 && parts[parts.length - 1] === EMPTY) parts.pop();
  return parts.join('');
}

/** 面の出力のうち、段のキーに置いてある出力を、キーの順に並べる（空きキーは `''`）。 */
export function rowOutputs(face: DraftFace, keys: readonly string[]): string[] {
  return keys.map((key) => face.outputs[key] ?? '');
}

/**
 * 段のキーの出力を、読んだ出力で置き換える。欄の末尾より右のキーの出力は消す。
 * 段に属さないキー（左端の列のキーなど）の出力には触れない。上限を超えた分は置けないので捨てる。
 */
export function applyRowOutputs(face: DraftFace, keys: readonly string[], outputs: readonly string[]): DraftFace {
  const next = { ...face.outputs };
  keys.forEach((key, index) => {
    const output = outputs[index] ?? '';
    if (output === '') delete next[key];
    else next[key] = output;
  });
  return { ...face, outputs: next };
}
