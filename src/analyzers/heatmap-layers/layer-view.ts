import type { PhysicalKeyboardStandard } from '#input/shapes/geometry.ts';
import {
  displayTriggerChords,
  defaultLayerNames,
  layerDefinitionsWithLabels,
  layerLabelOf,
  triggerChordsDisplayText,
  type Layer,
} from '#input/layouts/layers.ts';
import { SINGLE_LAYER_ID, type Layout } from '#input/layouts/types.ts';
import { mergeKeyDetails, type KeyDetail, type KeyDetails } from '#interpretation/key-detail.ts';
import { presentationLayersOf } from '../heatmap-figure.ts';
import { compactPresentationOf } from '../layer-detail.ts';
import type { HeatmapLayersExtracted, HeatmapLayer } from './extract.ts';
import { normalizedRoleColors } from './layer-heatmap.ts';
import {
  AUTO_SIDE_BY_SIDE_MAX_LAYERS,
  type HeatmapLayerArrangement,
  type HeatmapLayerDetail,
} from './options.ts';

/**
 * ヒートマップ（レイヤー）の図を並べるための、表示側の組み立て（純粋な計算）。
 *
 * 押下数は抽出（`extract.ts`）が数えたものをそのまま使い、ここでは数え直さない。
 * 足すのは、配列が宣言した層の並び・タイトル・「まとめ」の合算と、図どうしで共通にする最大値だけ。
 */

/** 層別図1枚ぶん。 */
export interface HeatmapLayerEntry {
  /** 層のid。「まとめ」で合算した図は、合算先の層のid */
  readonly id: string;
  /** この図が表す面のid（キーの詳細の面）。「まとめ」で合算した図は、合算先と合算した層のid全部 */
  readonly faceIds: readonly string[];
  readonly title: string;
  /** 層の名前（タイトルの前置きを除いたもの） */
  readonly label: string;
  /** 配列が宣言した層。キーの刻印と、シフトキーの枠色を引く */
  readonly layer: Layer;
  /** ツールチップに出す実際の押下数 */
  readonly keyCounts: ReadonlyMap<string, number>;
  /** 色を決める押下数 */
  readonly colorCounts: ReadonlyMap<string, number>;
}

function displayTriggerText(layout: Layout, face: Layer['faces'][number], layerName: string | undefined, standard: PhysicalKeyboardStandard | undefined): string {
  return face.presentationTriggerText
    ?? triggerChordsDisplayText(layout, displayTriggerChords(face), standard, layerName);
}

function layerTitle(layer: Layer, index: number, label: string, layout: Layout, standard: PhysicalKeyboardStandard | undefined): string {
  const head = `レイヤー${index + 1}: ${label}`;
  if (layer.faces.length === 0 || layer.id === SINGLE_LAYER_ID) return head;
  // 名前にトリガーのキーが入っている既定の名前は、見出しでトリガーを重ねて出さない
  const omitTrigger = defaultLayerNames(layout).get(layer.id)?.includesTrigger === true;
  const triggers = layer.faces.map((face) => displayTriggerText(layout, face, layerLabelOf(layout, layer.id), standard));
  const modeLabel = layout.layerDefinitions?.find((definition) => definition.id === layer.id)?.presentationModeLabel;
  const bracket = omitTrigger ? '' : ` [${triggers.join(' / ')}]`;
  return modeLabel === undefined ? `${head}${bracket}` : `${head}${bracket}・${modeLabel}`;
}

function emptyLayer(id: string, label: string): HeatmapLayer {
  return {
    id,
    label,
    role: undefined,
    presses: 0,
    keyCounts: new Map(),
    triggerKeyCounts: new Map(),
    pairedTriggerKeyCounts: new Map(),
    colorCounts: new Map(),
  };
}

function sumCounts(parts: readonly ReadonlyMap<string, number>[]): Map<string, number> {
  const total = new Map<string, number>();
  for (const part of parts) {
    for (const [key, count] of part) total.set(key, (total.get(key) ?? 0) + count);
  }
  return total;
}

/**
 * 層別図を並べる順に組み立てる。「まとめ」は、残す層以外の押下数を合算先の層へ足してから、
 * 合算先の役割で色用の押下数を求め直す（各層の色用の押下数を足すと、修飾の層で外した
 * 同時押下のトリガーが戻ってしまう）。
 */
export function buildLayerEntries(
  layout: Layout,
  extracted: HeatmapLayersExtracted,
  detail: HeatmapLayerDetail,
  standard?: PhysicalKeyboardStandard,
): HeatmapLayerEntry[] {
  const stats = new Map(extracted.layers.map((layer) => [layer.id, layer]));
  const presentation = presentationLayersOf(layout);
  // 配列が面として宣言していない層（英字配列のShiftなど）にも押下は帰属する。押下が無い間は図を足さず、
  // 使われた時だけ宣言済みの層の後ろへ足して、層別図の押下数の合計がヒートマップと食い違わないようにする
  const declared = new Set(presentation.map((layer) => layer.id));
  const undeclared = extracted.layers
    .filter((stat) => !declared.has(stat.id) && stat.presses > 0)
    .map((stat): Layer => ({ id: stat.id, role: stat.role ?? 'layer', order: Number.MAX_SAFE_INTEGER, faces: [] }));
  const definitions = layerDefinitionsWithLabels(layout);
  const entries = [...presentation, ...undeclared].map((layer, index) => {
    const label = definitions.find((definition) => definition.id === layer.id)?.label ?? layer.id;
    const stat = stats.get(layer.id) ?? emptyLayer(layer.id, label);
    return { stat, entry: { id: layer.id, faceIds: [layer.id], title: layerTitle(layer, index, stat.label, layout, standard), label: stat.label, layer, keyCounts: stat.keyCounts, colorCounts: stat.colorCounts } };
  });

  const compact = compactPresentationOf(layout);
  if (compact === undefined || detail === 'detail') return entries.map((item) => item.entry);

  const keepIds = new Set(compact.keepLayerIds);
  if (keepIds.size !== compact.keepLayerIds.length) throw new Error('レイヤーをまとめる表示の定義が正しくありません（残すレイヤーが重複しています）');
  if (!keepIds.has(compact.mergeIntoLayerId)) throw new Error('レイヤーをまとめる表示の定義が正しくありません（合算先は残すレイヤーに含めてください）');
  const byId = new Map(entries.map((item) => [item.entry.id, item]));
  const kept = compact.keepLayerIds.map((id) => {
    const item = byId.get(id);
    if (item === undefined) throw new Error(`レイヤーをまとめる表示の定義が正しくありません（レイヤー「${id}」が配列にありません）`);
    return item;
  });
  const merged = entries.filter((item) => !keepIds.has(item.entry.id));
  if (merged.length === 0) return entries.map((item) => item.entry);

  return kept.map((item) => {
    if (item.entry.id !== compact.mergeIntoLayerId) return item.entry;
    const parts = [item.stat, ...merged.map((other) => other.stat)];
    const keyCounts = sumCounts(parts.map((part) => part.keyCounts));
    const colorCounts = normalizedRoleColors(item.stat.role, {
      keyCounts,
      triggerKeyCounts: sumCounts(parts.map((part) => part.triggerKeyCounts)),
      pairedTriggerKeyCounts: sumCounts(parts.map((part) => part.pairedTriggerKeyCounts)),
    });
    return {
      ...item.entry,
      faceIds: [item.entry.id, ...merged.map((other) => other.entry.id)],
      title: `${item.entry.title}${compact.mergedTitleSuffix}`,
      keyCounts,
      colorCounts,
    };
  });
}

/**
 * 図1枚のキーの詳細。その図が表す面の値で、「まとめ」で合算した図は合算した面の和になる
 * （ヒートマップの図は面をまたいだ合算 `keyDetails.merged` を直接引く）。表す面のどれにも押下が無いキーは `undefined`。
 */
export function entryKeyDetail(keyDetails: KeyDetails, faceIds: readonly string[], keyId: string): KeyDetail | undefined {
  const parts = faceIds.flatMap((faceId) => keyDetails.faces.get(faceId)?.get(keyId) ?? []);
  if (parts.length <= 1) return parts[0];
  return mergeKeyDetails(parts);
}

/**
 * 層別図の全部で共通にする最大値（仕様 §11.10）。タブで隠れた図も含める。
 * 全部0なら1（割り算の分母にするため）。
 */
export function sharedMaxCount(entries: readonly HeatmapLayerEntry[]): number {
  let max = 1;
  for (const entry of entries) {
    for (const count of entry.colorCounts.values()) max = Math.max(max, count);
  }
  return max;
}

/** 並べ方が自動の時は、層の数で並置かタブに決める。 */
export function resolveArrangement(arrangement: HeatmapLayerArrangement, layerCount: number): 'side-by-side' | 'tabs' {
  if (arrangement === 'auto') return layerCount <= AUTO_SIDE_BY_SIDE_MAX_LAYERS ? 'side-by-side' : 'tabs';
  return arrangement;
}

/** タブで出す層の位置。idが今の図の中に無ければ最初の層。 */
export function activeEntryIndex(entries: readonly HeatmapLayerEntry[], activeLayerId: string): number {
  const index = entries.findIndex((entry) => entry.id === activeLayerId);
  return index < 0 ? 0 : index;
}
