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

/** 宣言された 2 面が issue #84 の構造条件を満たすか検証する。 */
export function canFoldFaces(first: Face, second: Face): boolean {
  if (first.layer === undefined || first.layer !== second.layer) return false;
  const invalid = (reason: string): never => {
    throw new Error(`層「${first.layer}」の面が畳み条件を満たさない: ${reason}`);
  };
  if (first.trigger.length !== 1 || second.trigger.length !== 1) invalid('trigger は単一キーである必要がある');
  if (first.mode !== second.mode) invalid('mode が異なる');

  const firstTriggerHand = singleHand(first.trigger);
  const secondTriggerHand = singleHand(second.trigger);
  if (!opposite(firstTriggerHand, secondTriggerHand)) invalid('trigger が逆手でない');

  const firstCells = faceCells(first);
  const secondCells = faceCells(second);
  const firstTargetHand = singleHand(firstCells.keys());
  const secondTargetHand = singleHand(secondCells.keys());
  if (!opposite(firstTargetHand, secondTargetHand)) invalid('対象セルが逆手でない');

  for (const key of firstCells.keys()) {
    if (secondCells.has(key)) invalid('対象セルが重複している');
  }
  return true;
}

/** 面の順序を保ちながら、宣言された単一キー面だけを層へ集約する。 */
export function groupFacesIntoLayers(faces: readonly Face[]): Layer[] {
  const groups = new Map<string, Face[]>();
  faces.forEach((face, index) => {
    // 2キー以上の trigger は修飾・コンボであり、盤面の層には含めない。
    if (face.trigger.length > 1) {
      if (face.layer !== undefined) throw new Error('コンボ面には層を宣言できない');
      return;
    }
    const groupKey = face.layer === undefined ? `single:${index}` : `layer:${face.layer}`;
    const group = groups.get(groupKey);
    if (group) group.push(face);
    else groups.set(groupKey, [face]);
  });

  const layers: Layer[] = [];
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (!canFoldFaces(group[i], group[j])) {
          throw new Error(`層「${group[i].layer ?? ''}」の面が畳み条件を満たさない`);
        }
      }
    }
    layers.push({ faces: group });
  }
  return layers;
}
