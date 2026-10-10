import { findActiveLayerFace } from '#input/layouts/key-pattern-picker.ts';
import {
  classifyPresentationFaces,
  displayTriggerKeys,
  layerDefinitionsWithLabels,
  layerShiftStyles,
  type Layer,
  type LayerShiftStyle,
} from '#input/layouts/layers.ts';
import { resolveKeyId } from '#input/shapes/geometry.ts';
import type { Face, Layout } from '#input/layouts/types.ts';
import { presentationLayersOf } from '../heatmap-figure.ts';
import { canToggleLayerDetail, compactPresentationOf, type LayerDetail } from '../layer-detail.ts';

/**
 * キーを選んで出る文字を調べる図で、トリガーになるキーを色で示すための材料（純粋な計算）。
 *
 * レイヤーの色は、ヒートマップ（レイヤー）のシフトキーの枠と同じく、配列の全レイヤーから
 * `layerShiftStyles` で1回だけ決めた番号を使う（まとめ方に依らず番号は変わらない）。
 * 配列がレイヤーをまとめる表示を宣言していて、まとめる設定の時は、残すレイヤーだけがその色を持ち、
 * まとめられる側のレイヤーのトリガーは「それ以外のレイヤー」の1色にする。
 * 同じキーが残すレイヤーとまとめられる側の両方のトリガーなら、残すレイヤーの色にする。
 * レイヤーとコンボの両方のトリガーになるキーは、レイヤー（まとめられる側を含む）の色にする。
 * 色を持たないトリガー（コンボ・単打の層）は選択の色になる。
 */

/** トリガーの枠の色。 */
export type TriggerTone =
  | { readonly kind: 'layer'; readonly slot: number }
  /** まとめられる側のレイヤー */
  | { readonly kind: 'others' }
  /** 選択の色（コンボ） */
  | { readonly kind: 'selection' };

/** 凡例の1項目。 */
export interface TriggerGuideLegendItem {
  readonly id: string;
  readonly tone: TriggerTone;
  readonly label: string;
}

export interface TriggerGuide {
  /** トリガーになる物理キーid → 色。レイヤー、コンボの面、コンボの定義の順に、先に決まった色を残す */
  readonly keyTones: ReadonlyMap<string, TriggerTone>;
  readonly legend: readonly TriggerGuideLegendItem[];
  /** 1つのキーだけでレイヤーに切り替わるトリガーを選んだ時の、そのレイヤーの色。該当しなければ未定義 */
  readonly toneOfSelected: (selected: readonly string[]) => TriggerTone | undefined;
}

export const COMBO_LEGEND_ID = 'combo';
export const OTHER_LAYERS_LEGEND_ID = 'other-layers';
export const OTHER_LAYERS_LABEL = 'それ以外のレイヤー';

const OTHERS_TONE: TriggerTone = { kind: 'others' };
const SELECTION_TONE: TriggerTone = { kind: 'selection' };

export function triggerGuide(layout: Layout, detail: LayerDetail): TriggerGuide {
  const layers = presentationLayersOf(layout);
  const styles = layerShiftStyles(layers);
  const definitions = layerDefinitionsWithLabels(layout);
  const compact = compactPresentationOf(layout);
  const keepIds = compact !== undefined && detail === 'compact' && canToggleLayerDetail(layout)
    ? new Set(compact.keepLayerIds)
    : undefined;
  const isKept = (layerId: string) => keepIds === undefined || keepIds.has(layerId);
  const keyTones = new Map<string, TriggerTone>();
  const faceTones = new Map<Face, TriggerTone>();
  const legend: TriggerGuideLegendItem[] = [];

  const toneOfFace = (face: Face, layer: Layer): TriggerTone => {
    if (!isKept(layer.id)) return OTHERS_TONE;
    const style = styles.get(face);
    return style === undefined ? SELECTION_TONE : { kind: 'layer', slot: style.colorSlot };
  };

  // 残すレイヤー（まとめない時は全レイヤー）を先に決め、まとめられる側は空いているキーにだけ置く
  for (const layer of layers.filter((candidate) => isKept(candidate.id))) {
    let style: LayerShiftStyle | undefined;
    for (const face of layer.faces) {
      style ??= styles.get(face);
      const tone = toneOfFace(face, layer);
      faceTones.set(face, tone);
      for (const trigger of displayTriggerKeys(face)) {
        const key = resolveKeyId(trigger);
        if (!keyTones.has(key)) keyTones.set(key, tone);
      }
    }
    if (style !== undefined) {
      const name = definitions.find((definition) => definition.id === layer.id)?.label ?? layer.id;
      legend.push({ id: layer.id, tone: { kind: 'layer', slot: style.colorSlot }, label: `レイヤー${style.layerIndex}の${name}` });
    }
  }

  let hasOthers = false;
  for (const layer of layers.filter((candidate) => !isKept(candidate.id))) {
    for (const face of layer.faces) {
      faceTones.set(face, OTHERS_TONE);
      for (const trigger of displayTriggerKeys(face)) {
        hasOthers = true;
        const key = resolveKeyId(trigger);
        if (!keyTones.has(key)) keyTones.set(key, OTHERS_TONE);
      }
    }
  }
  if (hasOthers) legend.push({ id: OTHER_LAYERS_LEGEND_ID, tone: OTHERS_TONE, label: OTHER_LAYERS_LABEL });

  let hasCombo = false;
  const addCombo = (key: string) => {
    hasCombo = true;
    if (!keyTones.has(key)) keyTones.set(key, SELECTION_TONE);
  };
  for (const face of classifyPresentationFaces(layout).combos) {
    for (const trigger of displayTriggerKeys(face)) addCombo(resolveKeyId(trigger));
  }
  for (const combo of layout.resolvedComboDefinitions ?? []) {
    for (const variant of combo.keyVariants ?? [combo.keys]) {
      for (const key of variant) addCombo(key);
    }
  }
  if (hasCombo) legend.push({ id: COMBO_LEGEND_ID, tone: SELECTION_TONE, label: 'コンボ' });

  return {
    keyTones,
    legend,
    toneOfSelected: (selected) => {
      const face = findActiveLayerFace(layout, new Set(selected));
      const tone = face === undefined ? undefined : faceTones.get(face);
      return tone?.kind === 'selection' ? undefined : tone;
    },
  };
}
