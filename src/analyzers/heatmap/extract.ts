import { COMBO_LAYER_ID, type LayerKind, type LayerPresentationRole } from '#input/layouts/types.ts';
import type { Trace } from '#trace/generate.ts';
import { normalizedRoleColors } from './layer-heatmap.ts';

/**
 * ヒートマップの抽出（仕様 §11.2 のキー別の押下数）。
 *
 * 数えるのは、キー（物理キーid）× 面（Traceの `aggregationGroupId`。層のid）ごとの押下数だけ。
 * 色の尺度（線形・対数）と層の表示方法は表示側の設定で、ここには入らない。
 * 表示側が層を選ぶ時は番号ではなく `HeatmapSurface.id` で引く（層の構成は配列ごとに違うため）。
 *
 * 面ごとの集計は `HeatmapSurface` の1形に揃え、統合は全面を物理キーで合算した値として別に持つ。
 * キーの詳細を共通の集計へ寄せる時に、面の単位をそのまま使える。
 */

/** 面（層またはコンボ枠）1つぶんの、キーごとの押下数。 */
export interface HeatmapSurface {
  /** 面のid（Traceの `aggregationGroupId`） */
  readonly id: string;
  readonly label: string;
  readonly kind: LayerKind;
  /** 配列定義が宣言した表示区分。宣言の無い面は `undefined` */
  readonly role: LayerPresentationRole | undefined;
  /** 面に帰属するキー押下の総数 */
  readonly presses: number;
  /** キーid → 押下数。ツールチップにも使う実際の値 */
  readonly keyCounts: ReadonlyMap<string, number>;
  /** 層操作として押したキーid → 回数。`keyCounts` に含まれる */
  readonly triggerKeyCounts: ReadonlyMap<string, number>;
  /** 同じ層の文字トリガーを複数同時押下したキーid → 回数 */
  readonly pairedTriggerKeyCounts: ReadonlyMap<string, number>;
  /** 色を決める押下数。層操作の分を除き、同時押下したトリガーを足し戻した値 */
  readonly colorCounts: ReadonlyMap<string, number>;
  /** `colorCounts` の最大値。キーが無ければ0 */
  readonly maxColorCount: number;
}

export interface HeatmapExtracted {
  /** 統合ヒートマップ。全面の押下を物理キーで合算した値 */
  readonly integrated: {
    readonly presses: number;
    /** キーid → 押下数 */
    readonly keyCounts: ReadonlyMap<string, number>;
    /** `keyCounts` の最大値。キーが無ければ0 */
    readonly maxCount: number;
  };
  /** 層別ヒートマップ。宣言順で、コンボ枠は含めない */
  readonly layers: readonly HeatmapSurface[];
  /** コンボ枠。コンボの押下が無ければ `undefined` */
  readonly combo: HeatmapSurface | undefined;
  /** 層どうしで共通にする最大値（`layers` の `maxColorCount` の最大）。キーが無ければ0 */
  readonly sharedMaxColorCount: number;
}

interface Accumulator {
  presses: number;
  keyCounts: Map<string, number>;
  triggerKeyCounts: Map<string, number>;
  pairedTriggerKeyCounts: Map<string, number>;
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function maxValue(map: ReadonlyMap<string, number>): number {
  return Math.max(0, ...map.values());
}

export function computeHeatmapExtraction(trace: Trace): HeatmapExtracted {
  const definitions = new Map(trace.layerDefinitions.map((definition) => [definition.id, definition]));
  // 宣言順の面を先に作り、宣言に無い面は初出の順で後ろへ足す
  const accumulators = new Map<string, Accumulator>();
  const ensure = (id: string): Accumulator => {
    let accumulator = accumulators.get(id);
    if (accumulator === undefined) {
      accumulator = { presses: 0, keyCounts: new Map(), triggerKeyCounts: new Map(), pairedTriggerKeyCounts: new Map() };
      accumulators.set(id, accumulator);
    }
    return accumulator;
  };
  for (const definition of trace.layerDefinitions) ensure(definition.id);

  const integratedCounts = new Map<string, number>();
  let integratedPresses = 0;
  for (const stroke of trace.strokes) {
    const accumulator = ensure(stroke.aggregationGroupId);
    const triggerKeys = new Set(stroke.triggerKeys);
    const pairedTriggerKeys = new Set(stroke.pairedTriggerKeys);
    for (const press of stroke.presses) {
      for (const key of press.keys) {
        integratedPresses++;
        increment(integratedCounts, key.id);
        accumulator.presses++;
        increment(accumulator.keyCounts, key.id);
        if (triggerKeys.has(key.id)) increment(accumulator.triggerKeyCounts, key.id);
        if (pairedTriggerKeys.has(key.id)) increment(accumulator.pairedTriggerKeyCounts, key.id);
      }
    }
  }

  const surfaces = [...accumulators].map(([id, accumulator]): HeatmapSurface => {
    const definition = definitions.get(id);
    const role = definition?.presentationRole;
    const colorCounts = normalizedRoleColors(role, accumulator);
    return {
      id,
      label: definition?.label ?? id,
      kind: definition?.kind ?? 'layer',
      role,
      presses: accumulator.presses,
      keyCounts: accumulator.keyCounts,
      triggerKeyCounts: accumulator.triggerKeyCounts,
      pairedTriggerKeyCounts: accumulator.pairedTriggerKeyCounts,
      colorCounts,
      maxColorCount: maxValue(colorCounts),
    };
  });

  const layers = surfaces.filter((surface) => surface.id !== COMBO_LAYER_ID);
  const combo = surfaces.find((surface) => surface.id === COMBO_LAYER_ID);
  return {
    integrated: {
      presses: integratedPresses,
      keyCounts: integratedCounts,
      maxCount: maxValue(integratedCounts),
    },
    layers,
    combo: combo !== undefined && combo.presses > 0 ? combo : undefined,
    sharedMaxColorCount: Math.max(0, ...layers.map((layer) => layer.maxColorCount)),
  };
}
