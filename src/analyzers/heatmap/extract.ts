import { defineSingleAnalyzer, type SingleAnalyzerDefinition, type SingleAnalyzerExtractContext } from '#analyzers/contract.ts';
import type { LayerPresentationRole } from '#input/layouts/types.ts';
import { attributeMetrics } from '#interpretation/attribution.ts';
import type { KeyDetails } from '#interpretation/key-detail.ts';
import type { Metrics } from '#interpretation/metrics.ts';
import type { Trace } from '#trace/generate.ts';
import { layerComboDisciplineContext } from '#analyzers/discipline-material.ts';
import { normalizedRoleColors } from './layer-heatmap.ts';
import { ALTERNATE_HEATMAP_OPTIONS, DEFAULT_HEATMAP_OPTIONS, heatmapOptions, type HeatmapOptions } from './options.ts';

/**
 * ヒートマップの抽出（仕様 §11.10のキーごとの押下数）。
 *
 * 押下を層へ割り振る規則（§11.10）は `computeMetrics` が持つので、ここでは数え直さず、
 * `Metrics` の層別・コンボ枠の集計を並べ替えて、色用の押下数を足すだけにする。
 * 層の宣言順・役割は `trace.layerDefinitions` から読む。
 *
 * 色の尺度（線形・対数）と層の表示方法は表示側の設定で、ここには入らない。
 * 表示側が層を選ぶ時は番号ではなく `HeatmapLayer.id` で引く（層の構成は配列ごとに違うため）。
 * 層どうしで共通にする最大値は、表示する層の組（まとめ・詳細など）で変わるので、
 * 表示側が表示する層の `colorCounts` から求める。
 *
 * キーの詳細（仕様 §11.11）は共通の集計（`interpretation/key-detail.ts`）の結果をそのまま持つ。
 * 面のidは層のid（コンボの面は `COMBO_LAYER_ID`）なので、層別図は `HeatmapLayer.id` でその面の値を引く。
 */

/** 層1つぶんの、キーごとの押下数。 */
export interface HeatmapLayer {
  /** 層のid（Traceの `aggregationGroupId`） */
  readonly id: string;
  readonly label: string;
  /** 配列定義が宣言した表示区分。宣言の無い層は `undefined` */
  readonly role: LayerPresentationRole | undefined;
  /** 層に帰属するキー押下の総数 */
  readonly presses: number;
  /** キーid → 押下数。ツールチップにも使う実際の値 */
  readonly keyCounts: ReadonlyMap<string, number>;
  /** 層操作として押したキーid → 回数。`keyCounts` に含まれる */
  readonly triggerKeyCounts: ReadonlyMap<string, number>;
  /** 同じ層の文字トリガーを複数同時押下したキーid → 回数 */
  readonly pairedTriggerKeyCounts: ReadonlyMap<string, number>;
  /** 色を決める押下数。層操作の分を除き、同時押下したトリガーを足し戻した値 */
  readonly colorCounts: ReadonlyMap<string, number>;
}

/** コンボ枠。層とは別に数える。 */
export interface HeatmapCombo {
  readonly id: string;
  readonly label: string;
  readonly presses: number;
  readonly keyCounts: ReadonlyMap<string, number>;
}

export interface HeatmapExtracted {
  /** 統合ヒートマップ。全キー押下を物理キーで合算した値 */
  readonly integrated: {
    readonly presses: number;
    /** キーid → 押下数 */
    readonly keyCounts: ReadonlyMap<string, number>;
    /** `keyCounts` の最大値。キーが無ければ0 */
    readonly maxCount: number;
  };
  /** 層別ヒートマップ。宣言順で、コンボ枠は含めない */
  readonly layers: readonly HeatmapLayer[];
  /** コンボ枠。コンボの押下が無ければ `undefined` */
  readonly combo: HeatmapCombo | undefined;
  /** キーの詳細。ツールチップと、キーを選んだ時の小窓が読む */
  readonly keyDetails: KeyDetails;
}

/** 抽出の入力。解析設定はどれも表示だけが変わるので、抽出の結果には効かない。 */
export interface HeatmapExtractInput {
  readonly trace: Trace;
  readonly metrics: Metrics;
  readonly keyDetails: KeyDetails;
  readonly options: HeatmapOptions;
}

export function computeHeatmapExtraction({ trace, metrics, keyDetails }: HeatmapExtractInput): HeatmapExtracted {
  const attribution = attributeMetrics(trace.layerDefinitions, metrics);
  const layers = attribution.layers.map((layer): HeatmapLayer => ({
    ...layer,
    colorCounts: normalizedRoleColors(layer.role, layer),
  }));
  return {
    integrated: {
      presses: metrics.presses,
      keyCounts: metrics.keyCounts,
      maxCount: Math.max(0, ...metrics.keyCounts.values()),
    },
    layers,
    combo: attribution.combo !== undefined && attribution.combo.presses > 0 ? attribution.combo : undefined,
    keyDetails,
  };
}

// ---------------------------------------------------------------------------
// 入れ忘れ防止テストの材料
// ---------------------------------------------------------------------------

/**
 * engine（`engine/cache.ts` の `getExtraction`）が呼ぶ、Analyzer契約の実体。
 * 解析設定はどれも表示だけが変わるので、抽出の結果には効かない。
 */
export const heatmapDefinition: SingleAnalyzerDefinition<HeatmapOptions, HeatmapExtracted> = defineSingleAnalyzer({
  id: 'heatmap',
  options: heatmapOptions,
  extract(context: SingleAnalyzerExtractContext<HeatmapOptions>): HeatmapExtracted {
    return computeHeatmapExtraction({ ...context, keyDetails: context.keyDetails() });
  },
  optionsDiscipline: {
    sample: DEFAULT_HEATMAP_OPTIONS,
    alternates: ALTERNATE_HEATMAP_OPTIONS,
    context: layerComboDisciplineContext,
  },
});
