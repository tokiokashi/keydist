import type { Face } from './types.ts';
import { faceCells, handOfKey } from '../layers.ts';

type Hand = 'left' | 'right';

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

const effectiveTriggerOrder = (face: Face): 'prefix' | 'suffix' | undefined =>
  face.triggerOrder ?? (face.mode === 'prefix' || face.mode === 'suffix' ? face.mode : undefined);

function validateFoldPair(first: Face, second: Face): void {
  const invalid = (reason: string): never => {
    throw new Error(`レイヤー「${first.layer ?? ''}」の面が畳み条件を満たさない: ${reason}`);
  };
  if (first.layer === undefined || first.layer !== second.layer) {
    invalid('同じlayerを宣言する必要がある');
  }
  if (first.trigger.length !== 1 || second.trigger.length !== 1) {
    invalid('triggerは単一キーである必要がある');
  }
  if (first.mode !== second.mode) invalid('modeが異なる');
  if (effectiveTriggerOrder(first) !== effectiveTriggerOrder(second)) {
    invalid('triggerOrderが異なる');
  }

  const firstTriggerHand = singleHand(first.trigger);
  const secondTriggerHand = singleHand(second.trigger);
  if (!opposite(firstTriggerHand, secondTriggerHand)) invalid('triggerが逆手でない');

  const firstCells = faceCells(first);
  const secondCells = faceCells(second);
  for (const key of firstCells.keys()) {
    if (secondCells.has(key)) invalid('対象セルが重複している');
  }

  const firstTargetHand = singleHand(firstCells.keys());
  const secondTargetHand = singleHand(secondCells.keys());
  if (!opposite(firstTargetHand, secondTargetHand)) invalid('対象セルが逆手でない');
}

/**
 * Face authoringのlayer folding宣言だけをconstructor境界で検証する。
 * compiled Layoutのconsumerへauthoring semantic分類APIを公開しない。
 */
export function validateFaceLayerAuthoring(faces: readonly Face[]): void {
  const groups = new Map<string, Face[]>();

  for (const face of faces) {
    if (face.inputRole === 'composition') {
      if (face.layer !== undefined) throw new Error('コンボ面にはレイヤーを宣言できない');
      continue;
    }
    if (face.layer === undefined) continue;
    const group = groups.get(face.layer);
    if (group) group.push(face);
    else groups.set(face.layer, [face]);
  }

  for (const [layer, group] of groups) {
    const roles = new Set(group.map((face) => face.role === 'modifier' ? 'modifier' : 'layer'));
    if (roles.size > 1) {
      throw new Error(`レイヤー「${layer}」に異なる役割の面を混在させられない`);
    }
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        validateFoldPair(group[i], group[j]);
      }
    }
  }
}
