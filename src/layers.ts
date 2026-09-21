import {
  DEFAULT_FINGER_ASSIGNMENT,
  keyId,
  resolveKeyId,
  THUMB_KEY,
  type Finger,
} from './geometry.ts';
import type { Face, LayerPresentationRole, Layout } from './layouts/types.ts';

export type Hand = 'left' | 'right';

export interface Layer {
  /** compiled presentation aggregation id。consumerはFaceから逆算しない。 */
  id: string;
  /** compiled presentation aggregationの表示区分。 */
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
 * presentation上のtrigger alternativeを正規化する。
 * authoring済みの外側OR / 内側chord構造を保持し、key aliasと重複だけを除く。
 * 未指定時はFace.trigger全体を1 chordとしてfallbackする。
 */
export function displayTriggerAlternatives(face: Face): readonly (readonly string[])[] {
  const authored = face.presentationTriggerAlternatives;
  if (authored === undefined) {
    const chord = [...new Set(face.trigger.map(resolveKeyId))];
    return chord.length === 0 ? [] : [chord];
  }
  if (authored.length === 0) {
    throw new Error('presentationTriggerAlternativesは空にできない');
  }

  const seen = new Set<string>();
  const alternatives: string[][] = [];
  authored.forEach((alternative, index) => {
    const chord = [...new Set(alternative.map(resolveKeyId))];
    if (chord.length === 0) {
      throw new Error(`presentationTriggerAlternatives[${index}]は空にできない`);
    }
    const signature = [...chord].sort().join('\u0000');
    if (seen.has(signature)) return;
    seen.add(signature);
    alternatives.push(chord);
  });
  return alternatives;
}

/**
 * presentation trigger alternative全体から安全に付けられる手ラベルを返す。
 * 左OR右のようにalternative間で手が異なる場合は、両方同時と誤読させないため未指定。
 * 1 alternative内に左右両手を含むchordだけは「両手」とする。
 */
export function displayTriggerHandLabel(face: Face): '左手' | '右手' | '両手' | undefined {
  const labels = displayTriggerAlternatives(face).map((alternative) => {
    const hands = new Set(alternative.map(handOfKey).filter(
      (hand): hand is Hand => hand !== undefined,
    ));
    if (hands.size === 0) return undefined;
    if (hands.size > 1) return '両手' as const;
    return hands.has('left') ? '左手' as const : '右手' as const;
  });
  if (labels.length === 0 || labels.some((label) => label === undefined)) return undefined;
  const unique = new Set(labels);
  return unique.size === 1 ? labels[0] : undefined;
}

/**
 * layer trigger表示で強調する全physical key。
 * alternative/chordの区別を落としたhighlight用途専用view。
 */
export function displayTriggerKeys(face: Face): readonly string[] {
  return [...new Set(displayTriggerAlternatives(face).flat())];
}

/** presentation trigger alternativeとphysical key集合のexact match。 */
export function matchesDisplayTriggerAlternative(
  face: Face,
  keys: ReadonlySet<string>,
): boolean {
  const resolved = new Set([...keys].map(resolveKeyId));
  return displayTriggerAlternatives(face).some(
    (alternative) =>
      alternative.length === resolved.size
      && alternative.every((key) => resolved.has(key)),
  );
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
 * authoring semantic metadataは再解釈せず、
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

  const definitions = new Map(
    (layout.layerDefinitions ?? []).map((definition) => [definition.id, definition] as const),
  );
  const groups = new Map<string, {
    order: number;
    role: LayerPresentationRole;
    faces: Face[];
  }>();
  const combos: Face[] = [];

  for (const [faceIndex, face] of faces.entries()) {
    const layerId = layout.faceLayerIds.get(face);
    if (layerId === undefined) {
      throw new Error('Face表示には全FaceのfaceLayerIds明示が必要');
    }
    const definition = definitions.get(layerId);
    if (definition === undefined) {
      throw new Error(`Face表示にはaggregation「${layerId}」のlayerDefinitions明示が必要`);
    }
    if (definition.kind === 'combo') {
      combos.push(face);
      continue;
    }
    if (definition.presentationRole === undefined) {
      throw new Error(
        `Face表示にはaggregation「${layerId}」のpresentationRole明示が必要`,
      );
    }

    const group = groups.get(layerId);
    if (group) group.faces.push(face);
    else groups.set(layerId, {
      order: faceIndex,
      role: definition.presentationRole,
      faces: [face],
    });
  }

  const layers: Layer[] = [];
  const modifiers: Layer[] = [];
  for (const [id, group] of groups) {
    (group.role === 'modifier' ? modifiers : layers).push({
      id,
      role: group.role,
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

