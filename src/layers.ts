import {
  DEFAULT_FINGER_ASSIGNMENT,
  keyId,
  resolveKeyId,
  THUMB_KEY,
  type Finger,
} from './geometry.ts';
import type { Face } from './layouts/types.ts';

export type Hand = 'left' | 'right';

export interface Layer {
  /** この層に含めた面。通常は単独面、逆手の面だけ 2 面を持つ */
  faces: readonly Face[];
}

/** 面の出力を、表示対象のキー id と出力文字の対応へ変換する。 */
export function faceCells(face: Face): Map<string, string> {
  const cells = new Map<string, string>();
  face.rows.forEach((row, rowIndex) => {
    const outputs = typeof row === 'string' ? [...row] : [...row];
    outputs.forEach((output, colIndex) => {
      if (output === '' || output === ' ') return;
      cells.set(keyId(rowIndex, colIndex), output);
    });
  });
  return cells;
}

/** 物理キー id から、既定の指割り当てに基づく手を引く。 */
export function handOfKey(key: string): Hand | undefined {
  const resolved = resolveKeyId(key);
  if (resolved === THUMB_KEY.LT) return 'left';
  if (resolved === THUMB_KEY.RT) return 'right';
  const finger: Finger | undefined = DEFAULT_FINGER_ASSIGNMENT.keyFinger[resolved];
  if (!finger) return undefined;
  return finger.startsWith('L') ? 'left' : 'right';
}

const singleHand = (keys: Iterable<string>): Hand | undefined => {
  const hands = new Set<Hand>();
  for (const key of keys) {
    const hand = handOfKey(key);
    if (!hand) return undefined;
    hands.add(hand);
  }
  return hands.size === 1 ? [...hands][0] : undefined;
};

const opposite = (first: Hand | undefined, second: Hand | undefined) =>
  first !== undefined && second !== undefined && first !== second;

/** 2 面を 1 層へ畳めるか、issue #84 の判定ルールで決める。 */
export function canFoldFaces(first: Face, second: Face): boolean {
  if (first.mode !== second.mode) return false;

  const firstTriggerHand = singleHand(first.trigger);
  const secondTriggerHand = singleHand(second.trigger);
  if (!opposite(firstTriggerHand, secondTriggerHand)) return false;

  const firstCells = faceCells(first);
  const secondCells = faceCells(second);
  const firstTargetHand = singleHand(firstCells.keys());
  const secondTargetHand = singleHand(secondCells.keys());
  if (!opposite(firstTargetHand, secondTargetHand)) return false;

  for (const key of firstCells.keys()) {
    if (secondCells.has(key)) return false;
  }
  return true;
}

/** 面の順序を保ちながら、畳める逆手ペアだけを隣接層へ集約する。 */
export function groupFacesIntoLayers(faces: readonly Face[]): Layer[] {
  const used = new Set<number>();
  const layers: Layer[] = [];

  for (let i = 0; i < faces.length; i++) {
    if (used.has(i)) continue;
    const pair = faces.findIndex((face, j) => j > i && !used.has(j) && canFoldFaces(faces[i], face));
    if (pair >= 0) {
      used.add(i);
      used.add(pair);
      layers.push({ faces: [faces[i], faces[pair]] });
    } else {
      used.add(i);
      layers.push({ faces: [faces[i]] });
    }
  }
  return layers;
}
