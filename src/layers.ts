import { resolveKeyId } from './geometry.ts';
import {
  faceCells,
  handOfKey,
  type Hand,
} from './layouts/face-geometry.ts';
import {
  SINGLE_LAYER_ID,
  type Face,
  type LayerDefinition,
  type LayerPresentationRole,
  type Layout,
} from './layouts/types.ts';

export { faceCells, handOfKey };
export type { Hand };

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

/**
 * compiled Layoutのpresentation Faceをaggregation mappingで分類する。
 * authoring semantic metadataは再解釈せず、
 * presentationではfaceLayerIdsを帰属authority、layerDefinitionsをkind authorityとして使う。semantic/analysis authorityには使わない。
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



/**
 * recognition window内のmodifier roleから、現在成立可能なpresentation aggregationを返す。
 * UIがFaceやlayout idを解釈せず、canonical semanticのroles / aggregationGroupIdをauthorityにする。
 * 複合modifierが揃った場合は、より多くのmodifier keyを要求するgroupを優先する。
 */
export function activeModifierAggregationGroupIds(
  layout: Pick<Layout, 'canonicalInputs'>,
  recognitionKeys: readonly string[],
): readonly string[] {
  const active = new Set(recognitionKeys.map(resolveKeyId));
  if (active.size === 0) return [];

  const matches: { id: string; modifierCount: number }[] = [];
  for (const alternatives of layout.canonicalInputs.values()) {
    for (const alternative of alternatives) {
      for (const input of alternative.semanticInputs) {
        const physical = new Set(input.physicalKeys.map(resolveKeyId));
        if (![...active].every((key) => physical.has(key))) continue;

        const modifierKeys = [...new Set(
          input.roles
            .filter((role) => role.role === 'modifier')
            .map((role) => resolveKeyId(role.key)),
        )];
        if (modifierKeys.length === 0) continue;
        if (!modifierKeys.every((key) => active.has(key))) continue;

        matches.push({
          id: input.aggregationGroupId,
          modifierCount: modifierKeys.length,
        });
      }
    }
  }

  const maxModifierCount = Math.max(0, ...matches.map((match) => match.modifierCount));
  return [...new Set(
    matches
      .filter((match) => match.modifierCount === maxModifierCount)
      .map((match) => match.id),
  )];
}

/** canonical aggregationに属するoutput key -> legend。 */
export function aggregationLegendMap(
  layout: Pick<Layout, 'canonicalInputs'>,
  aggregationGroupId: string,
): ReadonlyMap<string, string> {
  const legends = new Map<string, string>();

  const add = (key: string, output: string) => {
    const canonical = resolveKeyId(key);
    const previous = legends.get(canonical);
    if (previous === undefined) legends.set(canonical, output);
    else if (!previous.split(' / ').includes(output)) {
      legends.set(canonical, `${previous} / ${output}`);
    }
  };

  for (const [logicalOutput, alternatives] of layout.canonicalInputs) {
    for (const alternative of alternatives) {
      alternative.semanticInputs.forEach((input, index) => {
        if (input.aggregationGroupId !== aggregationGroupId) return;
        const realization = alternative.baseRealizations[index];
        const output = input.output || (
          alternative.semanticInputs.length === 1 ? logicalOutput : ''
        );
        if (output === '') return;
        for (const key of realization?.defaultOutputKeys ?? []) add(key, output);
        for (const view of realization?.alternateParticipations ?? []) {
          for (const key of view.outputKeys) add(key, output);
        }
      });
    }
  }

  return legends;
}

/** canonical aggregationのauthoring realizationがtriggerとして扱うphysical key。 */
export function aggregationTriggerKeys(
  layout: Pick<Layout, 'canonicalInputs'>,
  aggregationGroupId: string,
): readonly string[] {
  const keys = new Set<string>();
  for (const alternatives of layout.canonicalInputs.values()) {
    for (const alternative of alternatives) {
      alternative.semanticInputs.forEach((input, index) => {
        if (input.aggregationGroupId !== aggregationGroupId) return;
        const realization = alternative.baseRealizations[index];
        for (const key of realization?.defaultTriggerKeys ?? []) {
          keys.add(resolveKeyId(key));
        }
        for (const view of realization?.alternateParticipations ?? []) {
          for (const key of view.triggerKeys) keys.add(resolveKeyId(key));
        }
      });
    }
  }
  return [...keys];
}

/** compiled aggregationのtriggerを、人間向けのside-neutralな表示へ畳む。 */
export function aggregationTriggerDisplayText(
  layout: Pick<
    Layout,
    'canonicalInputs' | 'faces' | 'faceLayerIds' | 'thumbShiftKeys' | 'legends'
  >,
  aggregationGroupId: string,
): string {
  const authoredTexts = [...new Set(
    (layout.faces ?? [])
      .filter((face) => layout.faceLayerIds?.get(face) === aggregationGroupId)
      .map((face) => face.presentationTriggerText)
      .filter((text): text is string => text !== undefined && text.trim() !== ''),
  )];
  if (authoredTexts.length === 1) return authoredTexts[0];

  const keys = aggregationTriggerKeys(layout, aggregationGroupId);
  if (keys.length === 0) return '—';

  const equivalentThumbs = new Set((layout.thumbShiftKeys ?? []).map(resolveKeyId));
  if (equivalentThumbs.size > 1 && keys.every((key) => equivalentThumbs.has(resolveKeyId(key)))) {
    const labels = [...new Set(
      keys.map((key) => layout.legends.get(resolveKeyId(key)) ?? resolveKeyId(key)),
    )];
    if (labels.length === 1) return labels[0];
  }

  return keys
    .map((key) => layout.legends.get(resolveKeyId(key)) ?? resolveKeyId(key))
    .join(' + ');
}


/**
 * canonical semantic上でmodifier roleを持つphysical key。
 * analysis互換用。Input Converterの表示trigger判定はauthoring realizationを使う。
 */
export function modifierPhysicalKeys(
  layout: Pick<Layout, 'canonicalInputs'>,
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const alternatives of layout.canonicalInputs.values()) {
    for (const alternative of alternatives) {
      for (const input of alternative.semanticInputs) {
        for (const role of input.roles) {
          if (role.role === 'modifier') keys.add(resolveKeyId(role.key));
        }
      }
    }
  }
  return keys;
}


export interface PresentationTriggerGuideStyle {
  readonly kind: 'layer' | 'combo';
  readonly colorSlot?: number;
}

/**
 * legacy key-pattern pickerと同じ規則で、gestureの起点になり得るphysical keyへ
 * presentation色を割り当てる。layerはlayerShiftStylesのseries slotを再利用し、
 * composition/comboは専用色として扱う。
 */
export function presentationTriggerGuideStyles(
  layout: Layout,
): ReadonlyMap<string, PresentationTriggerGuideStyle> {
  const groups = classifyPresentationFaces(layout);
  const ordered = orderedPresentationLayers(groups);
  const faceStyles = layerShiftStyles(ordered);
  const styles = new Map<string, PresentationTriggerGuideStyle>();

  for (const layer of ordered) {
    for (const face of layer.faces) {
      const colorSlot = faceStyles.get(face)?.colorSlot;
      for (const rawKey of displayTriggerKeys(face)) {
        const key = resolveKeyId(rawKey);
        if (styles.has(key)) continue;
        styles.set(key, {
          kind: 'layer',
          ...(colorSlot === undefined ? {} : { colorSlot }),
        });
      }
    }
  }

  for (const face of groups.combos) {
    for (const rawKey of displayTriggerKeys(face)) {
      const key = resolveKeyId(rawKey);
      if (!styles.has(key)) styles.set(key, { kind: 'combo' });
    }
  }

  for (const combo of layout.resolvedComboDefinitions ?? []) {
    for (const variant of combo.keyVariants ?? [combo.keys]) {
      for (const rawKey of variant) {
        const key = resolveKeyId(rawKey);
        if (!styles.has(key)) styles.set(key, { kind: 'combo' });
      }
    }
  }

  return styles;
}

/**
 * 個々のchordをカンペへ列挙せず、authoring済みsemantic groupだけを短いラベルとして返す。
 */
export function semanticCombinationLabels(
  layout: Pick<Layout, 'canonicalInputs' | 'resolvedComboDefinitions'>,
): readonly string[] {
  const labels = new Set<string>();

  for (const alternatives of layout.canonicalInputs.values()) {
    for (const alternative of alternatives) {
      for (const input of alternative.semanticInputs) {
        for (const role of input.roles) {
          if (role.role === 'modifier' && role.modifierGroupId !== undefined) {
            labels.add(role.modifierGroupId);
          }
        }
      }
    }
  }

  for (const combo of layout.resolvedComboDefinitions ?? []) {
    if (combo.group !== undefined && combo.group.trim() !== '') labels.add(combo.group);
  }

  return [...labels];
}


/**
 * Input/Analyzerで小型カンペへ出すsemantic layer。
 * layoutがcompact presentation policyを持つ場合は、そのkeepLayerIdsだけをauthorityにする。
 * base(single)はmain keyboardが担うためカンペから除外する。
 */
export function compactLayerGuideDefinitions(
  layout: Pick<Layout, 'layerDefinitions' | 'layerViewPresentation'>,
): readonly LayerDefinition[] {
  const definitions = (layout.layerDefinitions ?? [])
    .filter((definition) =>
      definition.kind === 'layer'
      && definition.presentationRole === 'layer');

  const compact = layout.layerViewPresentation?.compact;
  if (compact === undefined) {
    return definitions.filter((definition) => definition.id !== SINGLE_LAYER_ID);
  }

  const keep = new Set(compact.keepLayerIds);
  return compact.keepLayerIds.flatMap((id) => {
    if (id === SINGLE_LAYER_ID) return [];
    const definition = definitions.find((candidate) => candidate.id === id);
    return definition === undefined || !keep.has(id) ? [] : [definition];
  });
}

/**
 * legacy layer diagramと同じseries color slotを、単キーで成立するlayer keyへ割り当てる。
 * 複合triggerの構成キーは常時着色せず、必要時の動的ガイドへ委ねる。
 * 同一physical keyが複数layerの起点ならauthoring順で先に現れるlayerの色を採用する。
 */
export function presentationTriggerColorSlots(layout: Layout): ReadonlyMap<string, number> {
  const groups = classifyPresentationFaces(layout);
  const layers = orderedPresentationLayers(groups);
  const styles = layerShiftStyles(layers);
  const result = new Map<string, number>();

  for (const layer of layers) {
    if (layer.role !== 'layer') continue;
    for (const face of layer.faces) {
      const slot = styles.get(face)?.colorSlot;
      if (slot === undefined) continue;
      for (const alternative of displayTriggerAlternatives(face)) {
        if (alternative.length !== 1) continue;
        const key = resolveKeyId(alternative[0]);
        if (!result.has(key)) result.set(key, slot);
      }
    }
  }

  return result;
}
