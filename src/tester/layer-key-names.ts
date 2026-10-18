import type { KeyPatternTriggerActivation } from '#input/layouts/key-pattern-picker.ts';
import { aggregationTriggerChords, aggregationTriggerKeys, layerLabelOf } from '#input/layouts/layers.ts';
import type { Layout } from '#input/layouts/index.ts';
import type { RealizedSemanticAction } from '#input/semantics/index.ts';
import { resolveKeyId, type PhysicalKeyboardStandard } from '#input/shapes/geometry.ts';
import { physicalKeyDisplayLabel } from '#input/shapes/key-labels.ts';

/*
 * 層のトリガーとして働いたキー（シフトキーなど）の呼び名を、Testerの3か所
 * （レイヤーカード・逆引き・Pressed / Recognized）で同じ規則で決める。
 * 文字を出したキーは、どの設定でも物理キーの名前で出す。
 */

/**
 * トリガーキーの呼び名の種類。
 * - authored: 配列の作者が層に付けた名前（新JISの「Shift」、新下駄の「中指シフト」など）
 * - key-name: 物理キーの名前（K・左親指など）
 * - legend: 配列が決めたキーの刻印（新下駄の中指シフトなら「い / か」）
 *
 * 作者の呼び名・刻印を持たないキーは、どの種類でもキー名で出す。
 */
export type LayerKeyNaming = 'authored' | 'key-name' | 'legend';

export const DEFAULT_LAYER_KEY_NAMING: LayerKeyNaming = 'authored';

export const LAYER_KEY_NAMING_OPTIONS: readonly { readonly value: LayerKeyNaming; readonly label: string }[] = [
  { value: 'authored', label: '作者の呼び名' },
  { value: 'key-name', label: 'キー名' },
  { value: 'legend', label: '刻印' },
];

export function isLayerKeyNaming(value: unknown): value is LayerKeyNaming {
  return LAYER_KEY_NAMING_OPTIONS.some((option) => option.value === value);
}

/** 表示に並べるキー1つ分。左右どちらを押してもよいキーは `keys` にまとめる。 */
export interface NamedKeySlot {
  readonly keys: readonly string[];
  /**
   * このキーがその打鍵で層のトリガーとして働いた時の、層の識別子。
   * 文字を出したキーには付けない。
   */
  readonly triggerLayerIds?: readonly string[];
}

const triggerKeySetCache = new WeakMap<Layout, Map<string, ReadonlySet<string>>>();

function layerTriggerKeySet(layout: Layout, layerId: string): ReadonlySet<string> {
  let byLayer = triggerKeySetCache.get(layout);
  if (byLayer === undefined) {
    byLayer = new Map();
    triggerKeySetCache.set(layout, byLayer);
  }
  let keys = byLayer.get(layerId);
  if (keys === undefined) {
    keys = new Set(aggregationTriggerKeys(layout, layerId));
    byLayer.set(layerId, keys);
  }
  return keys;
}

const distinct = (values: readonly string[]): string[] => [...new Set(values)];

function slotSignature(slot: NamedKeySlot): string {
  return distinct(slot.keys.map(resolveKeyId)).sort().join('\u0000');
}

/** キーの刻印。刻印の無いキーは `undefined`。 */
function legendOf(layout: Layout, key: string): string | undefined {
  const legend = layout.legends.get(resolveKeyId(key))?.trim();
  return legend === undefined || legend === '' ? undefined : legend;
}

/** 層の名前を配列が付けていて、スロットのキーがその層のトリガーである時の名前。 */
function authoredNameOf(layout: Layout, slot: NamedKeySlot): string | undefined {
  const resolved = slot.keys.map(resolveKeyId);
  for (const layerId of slot.triggerLayerIds ?? []) {
    const label = layerLabelOf(layout, layerId);
    if (label === undefined) continue;
    const triggers = layerTriggerKeySet(layout, layerId);
    if (resolved.some((key) => triggers.has(key))) return label;
  }
  return undefined;
}

/**
 * 1つの表示（1つの経路・1つの認識結果・押下中のキー一覧）にあたるスロットの列から、
 * 表示名を返す。スロットの列を複数渡すと、列をまたいで同じ作者の呼び名の別のキーを見分ける。
 * 同じ作者の呼び名が別のキーに付く時は、どのキーかが分かるよう「中指シフト（K）」の形でキー名を添える。
 */
export function layerKeyNames(
  layout: Layout,
  slotLists: readonly (readonly NamedKeySlot[])[],
  naming: LayerKeyNaming,
  standard?: PhysicalKeyboardStandard,
): string[][] {
  const keyName = (key: string) => physicalKeyDisplayLabel(key, standard);
  const keyNamesOf = (slot: NamedKeySlot) => distinct(slot.keys.map(keyName)).join(' / ');

  const authored = slotLists.map((slots) => slots.map((slot) => (naming === 'authored' ? authoredNameOf(layout, slot) : undefined)));
  const signaturesByName = new Map<string, Set<string>>();
  slotLists.forEach((slots, listIndex) => {
    slots.forEach((slot, slotIndex) => {
      const name = authored[listIndex][slotIndex];
      if (name === undefined) return;
      const signatures = signaturesByName.get(name) ?? new Set<string>();
      signatures.add(slotSignature(slot));
      signaturesByName.set(name, signatures);
    });
  });

  return slotLists.map((slots, listIndex) =>
    slots.map((slot, slotIndex) => {
      if (slot.triggerLayerIds === undefined) return keyNamesOf(slot);
      if (naming === 'key-name') return keyNamesOf(slot);
      if (naming === 'legend') {
        const legends = slot.keys.map((key) => legendOf(layout, key));
        return legends.every((legend) => legend !== undefined) ? distinct(legends as string[]).join(' / ') : keyNamesOf(slot);
      }
      const name = authored[listIndex][slotIndex];
      if (name === undefined) return keyNamesOf(slot);
      return (signaturesByName.get(name)?.size ?? 0) > 1 ? `${name}（${keyNamesOf(slot)}）` : name;
    }),
  );
}

/** 押下中のキーの表示名。今そのキーを使って層が起動している時だけ、トリガーとして名前を付ける。 */
export function pressedKeyNames(
  layout: Layout,
  pressedKeys: readonly string[],
  activeTriggers: readonly KeyPatternTriggerActivation[],
  naming: LayerKeyNaming,
  standard?: PhysicalKeyboardStandard,
): string[] {
  const slots = pressedKeys.map((key): NamedKeySlot => {
    const resolved = resolveKeyId(key);
    const layerIds = distinct(
      activeTriggers.filter((activation) => activation.triggerKeys.map(resolveKeyId).includes(resolved)).map((a) => a.aggregationGroupId),
    );
    return layerIds.length > 0 ? { keys: [key], triggerLayerIds: layerIds } : { keys: [key] };
  });
  return layerKeyNames(layout, [slots], naming, standard)[0];
}

/**
 * 1つの認識結果が持つ打鍵ごとに、押したキーと押したままのキーの表示名を返す。
 * そのキーがトリガー側として参加した打鍵だけ、層のトリガーとして名前を付ける。
 */
export function recognizedActionKeyNames(
  layout: Layout,
  actions: readonly RealizedSemanticAction[],
  naming: LayerKeyNaming,
  standard?: PhysicalKeyboardStandard,
): { readonly keys: string[]; readonly held: string[] }[] {
  const lists: NamedKeySlot[][] = [];
  for (const action of actions) {
    const layerId = action.input.aggregationGroupId;
    const outputs = new Set(action.outputKeys.map(resolveKeyId));
    const triggers = new Set(action.triggerKeys.map(resolveKeyId));
    lists.push(
      action.keys.map((key): NamedKeySlot => {
        const resolved = resolveKeyId(key);
        return triggers.has(resolved) && !outputs.has(resolved) ? { keys: [key], triggerLayerIds: [layerId] } : { keys: [key] };
      }),
      action.heldKeys.map(
        (key): NamedKeySlot =>
          layerTriggerKeySet(layout, layerId).has(resolveKeyId(key)) ? { keys: [key], triggerLayerIds: [layerId] } : { keys: [key] },
      ),
    );
  }
  const names = layerKeyNames(layout, lists, naming, standard);
  return actions.map((_, index) => ({ keys: names[index * 2], held: names[index * 2 + 1] }));
}

/**
 * レイヤーカードの見出し。作者の呼び名は層の名前そのもの。
 * キー名・刻印の時は、層を起動するキーを並べる（同時に押すキーは「+」、どれか1つで足りるキーは「/」）。
 * 起動するキーを持たない層は、層の名前のまま出す。
 */
export function layerCardTitle(layout: Layout, layerId: string, layerLabel: string, naming: LayerKeyNaming, standard?: PhysicalKeyboardStandard): string {
  if (naming === 'authored') return layerLabel;

  const chords: string[][] = [];
  const seen = new Set<string>();
  for (const chord of aggregationTriggerChords(layout, layerId)) {
    const keys = distinct(chord.keys.map(resolveKeyId));
    const signature = [...keys].sort().join('\u0000');
    if (keys.length === 0 || seen.has(signature)) continue;
    seen.add(signature);
    chords.push(keys);
  }
  if (chords.length === 0) return layerLabel;

  const name = (key: string) =>
    naming === 'legend' ? (legendOf(layout, key) ?? physicalKeyDisplayLabel(key, standard)) : physicalKeyDisplayLabel(key, standard);
  return distinct(chords.map((keys) => distinct(keys.map(name)).join(' + '))).join(' / ');
}
