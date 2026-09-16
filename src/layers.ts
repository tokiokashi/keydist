import {
  DEFAULT_FINGER_ASSIGNMENT,
  keyId,
  resolveKeyId,
  THUMB_KEY,
  type Finger,
} from './geometry.ts';
import type { Face, Layout } from './layouts/types.ts';

export type Hand = 'left' | 'right';

export interface Layer {
  /** このレイヤーに含めた面。通常は単独面、逆手の面だけ2面を持つ */
  faces: readonly Face[];
}

export interface FaceGroups {
  /** 盤面の置き換えとして表示するレイヤー */
  layers: Layer[];
  /** かなへ作用する修飾面。宣言されたlayerはここでも畳む */
  modifiers: Layer[];
  /** 2キー以上のtriggerを持つ面 */
  combos: readonly Face[];
}

export interface LayerShiftStyle {
  layerIndex: number;
  colorSlot: number;
}

/** シフト面ごとに、所属レイヤー単位の表示色を割り当てる。 */
export function layerShiftStyles(layers: readonly Layer[]): Map<Face, LayerShiftStyle> {
  const styles = new Map<Face, LayerShiftStyle>();
  for (const [index, layer] of layers.entries()) {
    const style = { layerIndex: index + 1, colorSlot: (index % 8) + 1 };
    for (const face of layer.faces) {
      if (face.trigger.length > 0) styles.set(face, style);
    }
  }
  return styles;
}

/**
 * Return the keys that should be emphasized when a layer trigger is shown.
 * This is presentation-only: the face trigger and Layout.map remain unchanged.
 */
export function displayTriggerKeys(
  layout: Pick<Layout, 'id'>,
  face: Face,
): readonly string[] {
  const triggerKeys = face.trigger.map(resolveKeyId);
  if (
    layout.id === 'naginata-v18' &&
    triggerKeys.length === 1 &&
    triggerKeys[0] === THUMB_KEY.RT
  ) {
    return [THUMB_KEY.LT, THUMB_KEY.RT];
  }
  return triggerKeys;
}

/** 面の出力を、表示対象のキーidと出力文字の対応へ変換する。 */
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

/**
 * 畳んだレイヤーの表示用セルを作る。
 *
 * 面の定義は同じ同時押しを2回持たないよう片方向だけを書くため、
 * たとえばk面のdセルはdシフトのkセルにも表示できる。評価用の
 * `Layout.map` には触れず、描画時だけ全単一キー面からこの対称位置を補う。
 */
export function foldedLayerCells(layer: Layer, faces: readonly Face[]): Map<string, string> {
  const cells = new Map<string, string>();
  for (const face of layer.faces) {
    for (const [key, label] of faceCells(face)) {
      const previous = cells.get(key);
      cells.set(key, previous === undefined ? label : `${previous} / ${label}`);
    }
  }

  // 片面のレイヤーや単打面には、相互シフトの補完を適用しない。
  if (layer.faces.length !== 2) return cells;
  const mode = layer.faces[0].mode;
  const triggers = new Set(layer.faces.flatMap((face) => face.trigger).map(resolveKeyId));

  for (const face of faces) {
    if (face.trigger.length !== 1 || face.mode !== mode) continue;
    const targetKey = resolveKeyId(face.trigger[0]);
    if (cells.has(targetKey)) continue;
    const source = faceCells(face);
    const mirrored = [...triggers]
      .map((trigger) => source.get(trigger))
      .filter((label): label is string => label !== undefined);
    if (mirrored.length > 0) {
      cells.set(targetKey, [...new Set(mirrored)].join(' / '));
    }
  }
  return cells;
}

/** 物理キーidから、既定の指割り当てに基づく手を引く。 */
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

/** 宣言された2面がissue #84の構造条件を満たすか検証する。 */
export function canFoldFaces(first: Face, second: Face): boolean {
  if (first.layer === undefined || first.layer !== second.layer) return false;
  const invalid = (reason: string): never => {
    throw new Error(`レイヤー「${first.layer}」の面が畳み条件を満たさない: ${reason}`);
  };
  if (first.trigger.length !== 1 || second.trigger.length !== 1) invalid('triggerは単一キーである必要がある');
  if (first.mode !== second.mode) invalid('modeが異なる');

  const firstTriggerHand = singleHand(first.trigger);
  const secondTriggerHand = singleHand(second.trigger);
  if (!opposite(firstTriggerHand, secondTriggerHand)) invalid('triggerが逆手でない');

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

function singleTriggerGroups(faces: readonly Face[]): Map<string, Face[]> {
  const groups = new Map<string, Face[]>();
  faces.forEach((face, index) => {
    // 2キー以上のtriggerは常にコンボであり、レイヤーの宣言だけ禁止する。
    if (face.trigger.length > 1) {
      if (face.layer !== undefined) throw new Error('コンボ面にはレイヤーを宣言できない');
      return;
    }
    const groupKey = face.layer === undefined ? `single:${index}` : `layer:${face.layer}`;
    const group = groups.get(groupKey);
    if (group) group.push(face);
    else groups.set(groupKey, [face]);
  });
  return groups;
}

function validateGroup(group: readonly Face[]): void {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (!canFoldFaces(group[i], group[j])) {
        throw new Error(`レイヤー「${group[i].layer ?? ''}」の面が畳み条件を満たさない`);
      }
    }
  }
}

/** 面をレイヤー・修飾・コンボへ分類し、宣言された面の畳み条件を検証する。 */
export function classifyFaces(faces: readonly Face[]): FaceGroups {
  const layers: Layer[] = [];
  const modifiers: Layer[] = [];
  for (const group of singleTriggerGroups(faces).values()) {
    validateGroup(group);
    const roles = new Set(group.map((face) => face.role === 'modifier' ? 'modifier' : 'layer'));
    if (roles.size > 1) throw new Error(`レイヤー「${group[0].layer ?? ''}」に異なる役割の面を混在させられない`);
    (roles.has('modifier') ? modifiers : layers).push({ faces: group });
  }
  return {
    layers,
    modifiers,
    combos: faces.filter((face) => face.trigger.length > 1),
  };
}

/** 面の順序を保ちながら、盤面を置き換える単一キー面だけをレイヤーへ集約する。 */
export function groupFacesIntoLayers(faces: readonly Face[]): Layer[] {
  return classifyFaces(faces).layers;
}
