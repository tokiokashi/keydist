import { findActiveLayerFace } from '#input/layouts/key-pattern-picker.ts';
import {
  classifyPresentationFaces,
  displayTriggerKeys,
  layerDefinitionsWithLabels,
  layerShiftStyles,
  type LayerShiftStyle,
} from '#input/layouts/layers.ts';
import { resolveKeyId } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import { presentationLayersOf } from '../heatmap-figure.ts';

/**
 * キーを選んで出る文字を調べる図で、トリガーになるキーを色で示すための材料（純粋な計算）。
 *
 * レイヤーの色は、レイヤー別ヒートマップのシフトキーの枠と同じく、配列の全レイヤーから
 * `layerShiftStyles` で1回だけ決めた番号を使う。色を持たないトリガー（コンボ・単打の層）は番号を持たず、選択の色になる。
 */

/** 凡例の1項目。番号が無ければ、選択の色。 */
export interface TriggerGuideLegendItem {
  readonly id: string;
  readonly slot: number | undefined;
  readonly label: string;
}

export interface TriggerGuide {
  /** トリガーになる物理キーid → 色の番号（無ければ undefined）。レイヤー、コンボの面、コンボの定義の順に、先に決まった色を残す */
  readonly keySlots: ReadonlyMap<string, number | undefined>;
  readonly legend: readonly TriggerGuideLegendItem[];
  /** 1つのキーだけでレイヤーに切り替わるトリガーを選んだ時の、そのレイヤーの色の番号。該当しなければ undefined */
  readonly slotOfSelected: (selected: readonly string[]) => number | undefined;
}

export const COMBO_LEGEND_ID = 'combo';

export function triggerGuide(layout: Layout): TriggerGuide {
  const layers = presentationLayersOf(layout);
  const styles = layerShiftStyles(layers);
  const definitions = layerDefinitionsWithLabels(layout);
  const keySlots = new Map<string, number | undefined>();
  const legend: TriggerGuideLegendItem[] = [];

  for (const layer of layers) {
    let style: LayerShiftStyle | undefined;
    for (const face of layer.faces) {
      const faceStyle = styles.get(face);
      style ??= faceStyle;
      for (const trigger of displayTriggerKeys(face)) {
        const key = resolveKeyId(trigger);
        if (!keySlots.has(key)) keySlots.set(key, faceStyle?.colorSlot);
      }
    }
    if (style !== undefined) {
      const name = definitions.find((definition) => definition.id === layer.id)?.label ?? layer.id;
      legend.push({ id: layer.id, slot: style.colorSlot, label: `レイヤー${style.layerIndex}の${name}` });
    }
  }

  let hasCombo = false;
  const addCombo = (key: string) => {
    hasCombo = true;
    if (!keySlots.has(key)) keySlots.set(key, undefined);
  };
  for (const face of classifyPresentationFaces(layout).combos) {
    for (const trigger of displayTriggerKeys(face)) addCombo(resolveKeyId(trigger));
  }
  for (const combo of layout.resolvedComboDefinitions ?? []) {
    for (const variant of combo.keyVariants ?? [combo.keys]) {
      for (const key of variant) addCombo(key);
    }
  }
  if (hasCombo) legend.push({ id: COMBO_LEGEND_ID, slot: undefined, label: 'コンボ' });

  return {
    keySlots,
    legend,
    slotOfSelected: (selected) => {
      const face = findActiveLayerFace(layout, new Set(selected));
      return face === undefined ? undefined : styles.get(face)?.colorSlot;
    },
  };
}
