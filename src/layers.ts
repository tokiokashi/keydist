import {
  DEFAULT_FINGER_ASSIGNMENT,
  keyId,
  resolveKeyId,
  THUMB_KEY,
  type Finger,
} from './geometry.ts';
import type { Face, Layout } from './layouts/types.ts';

export type Hand = 'left' | 'right';

export type LayerPresentationRole = 'layer' | 'modifier';

export interface Layer {
  /** compiled presentation aggregation id。consumerはFaceから逆算しない。 */
  id: string;
  /** presentation上の区分。Face.roleは分類境界でここへ畳む。 */
  role: LayerPresentationRole;
  /** 元Face列における最初の出現順。presentation ordering専用。 */
  order: number;
  /** このレイヤーに含めた面。通常は単独面、逆手の面だけ2面を持つ */
  faces: readonly Face[];
}

export interface FaceGroups {
  /** 盤面の置き換えとして表示するレイヤー */
  layers: Layer[];
  /** かなへ作用する修飾面。宣言されたlayerはここでも畳む */
  modifiers: Layer[];
  /** compositionとして明示された面 */
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
    if (layer.id === 'single') continue;
    const style = { layerIndex: index + 1, colorSlot: (index % 8) + 1 };
    for (const face of layer.faces) styles.set(face, style);
  }
  return styles;
}

/**
 * Return the keys that should be emphasized when a layer trigger is shown.
 * This is presentation-only: the face trigger and Layout.map remain unchanged.
 */
export function displayTriggerKeys(face: Face): readonly string[] {
  return (face.presentationTriggerKeys ?? face.trigger).map(resolveKeyId);
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

/** semantic cellと明示presentation membershipを、このFaceの表示セルとして統合する。 */
export function faceDisplayCells(face: Face): Map<string, string> {
  const cells = faceCells(face);
  for (const [rawKey, label] of Object.entries(face.presentationCells ?? {})) {
    if (label === '' || label === ' ') continue;
    const key = resolveKeyId(rawKey);
    const previous = cells.get(key);
    if (previous === undefined) cells.set(key, label);
    else if (previous !== label) cells.set(key, `${previous} / ${label}`);
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

/**
 * compiled Layoutのpresentation Faceをaggregation mappingで分類する。
 * semantic authoringのinputRole / face.layerは再解釈せず、
 * faceLayerIdsを帰属authority、layerDefinitionsをkind authorityとして使う。
 */
export function classifyPresentationFaces(
  layout: Pick<Layout, 'faces' | 'faceLayerIds' | 'layerDefinitions'>,
): FaceGroups {
  const faces = layout.faces ?? [];
  if (faces.length === 0) return { layers: [], modifiers: [], combos: [] };
  if (!layout.faceLayerIds) {
    throw new Error('Face表示にはfaceLayerIdsの明示が必要');
  }

  const kinds = new Map(
    (layout.layerDefinitions ?? []).map((definition) => [definition.id, definition.kind] as const),
  );
  const groups = new Map<string, { order: number; faces: Face[] }>();
  const combos: Face[] = [];

  for (const [faceIndex, face] of faces.entries()) {
    const layerId = layout.faceLayerIds.get(face);
    if (layerId === undefined) {
      throw new Error('Face表示には全FaceのfaceLayerIds明示が必要');
    }
    const kind = kinds.get(layerId);
    if (kind === undefined) {
      throw new Error(`Face表示にはaggregation「${layerId}」のlayerDefinitions明示が必要`);
    }
    if (kind === 'combo') {
      combos.push(face);
      continue;
    }
    const group = groups.get(layerId);
    if (group) group.faces.push(face);
    else groups.set(layerId, { order: faceIndex, faces: [face] });
  }

  const layers: Layer[] = [];
  const modifiers: Layer[] = [];
  for (const [id, group] of groups) {
    const roles = new Set(group.faces.map((face) => face.role === 'modifier' ? 'modifier' : 'layer'));
    if (roles.size > 1) {
      throw new Error('同じpresentation aggregationへ異なる表示roleのFaceを混在させられない');
    }
    const role: LayerPresentationRole = roles.has('modifier') ? 'modifier' : 'layer';
    (role === 'modifier' ? modifiers : layers).push({
      id,
      role,
      order: group.order,
      faces: group.faces,
    });
  }
  return { layers, modifiers, combos };
}

/** compiled presentation aggregationを元Face列の出現順へ戻す。role別配列の連結順はauthorityにしない。 */
export function orderedPresentationLayers(
  groups: Pick<FaceGroups, 'layers' | 'modifiers'>,
): Layer[] {
  return [...groups.layers, ...groups.modifiers]
    .sort((first, second) => first.order - second.order);
}

/** 面の順序を保ちながら、盤面を置き換える単一キー面だけをレイヤーへ集約する。 */
export function groupFacesIntoLayers(faces: readonly Face[]): Layer[] {
  return classifyFaces(faces).layers;
}
