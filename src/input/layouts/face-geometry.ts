import { DEFAULT_FINGER_ASSIGNMENT, keyId, resolveKeyId, THUMB_KEY, type Finger } from '../shapes/geometry.ts';
import type { Face } from './types.ts';

export type Hand = 'left' | 'right';

/** Face.rowsとextraCellsをphysical key id -> outputへ展開するauthoring/presentation共通view。 */
export function faceCells(face: Face): Map<string, string> {
  const cells = new Map<string, string>();
  face.rows.forEach((row, rowIndex) => {
    const outputs = typeof row === 'string' ? [...row] : [...row];
    outputs.forEach((output, colIndex) => {
      if (output === '' || output === ' ') return;
      cells.set(keyId(rowIndex, colIndex), output);
    });
  });
  for (const [key, output] of Object.entries(face.extraCells ?? {})) {
    if (output === '' || output === ' ') continue;
    cells.set(key, output);
  }
  return cells;
}

/**
 * 面のセルを、同じ出力の経路を作る順に並べる。
 * 並びは `faceCells` と同じで、`defaultCells` に挙げたキーのセルだけを、同じ出力を持つ他のセルより前に置く。
 * 他の出力のセルどうしの順は変えない。
 */
export function faceCellsInAlternativeOrder(face: Face): [string, string][] {
  const cells = [...faceCells(face)];
  const defaults = new Set((face.defaultCells ?? []).map(resolveKeyId));
  if (defaults.size === 0) return cells;
  const marked = (key: string): boolean => defaults.has(resolveKeyId(key));
  const defaultOutputs = new Set(cells.filter(([key]) => marked(key)).map(([, output]) => output));
  const first = cells.filter(([key, output]) => defaultOutputs.has(output) && marked(key));
  const rest = cells.filter(([key, output]) => !(defaultOutputs.has(output) && marked(key)));
  // 既定のセルは、同じ出力のセルのうち最初に現れる位置へ移す。他の出力のセルの並びは動かさない
  const result: [string, string][] = [];
  for (const cell of rest) {
    const lead = first.find(([, output]) => output === cell[1]);
    if (lead !== undefined && !result.includes(lead)) result.push(lead);
    result.push(cell);
  }
  for (const cell of first) if (!result.includes(cell)) result.push(cell);
  return result;
}

/** 物理キーidから、既定の指割り当てに基づく手を引く。 */
export function handOfKey(key: string): Hand | undefined {
  const resolved = resolveKeyId(key);
  if (resolved === THUMB_KEY.LT) return 'left';
  if (resolved === THUMB_KEY.RT) return 'right';
  const finger: Finger | undefined = DEFAULT_FINGER_ASSIGNMENT.baseFinger[resolved];
  if (!finger) return undefined;
  return finger.startsWith('L') ? 'left' : 'right';
}
