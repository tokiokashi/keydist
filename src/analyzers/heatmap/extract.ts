import { defineSingleAnalyzer, type SingleAnalyzerDefinition, type SingleAnalyzerExtractContext } from '#analyzers/contract.ts';
import { COMBO_LAYER_ID, fromRows, type LayerPresentationRole } from '#input/layouts/types.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { computeMetrics, type Metrics } from '#interpretation/metrics.ts';
import { DEFAULT_TRACE_POLICY, generateTrace, type Trace } from '#trace/generate.ts';
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
 * 層ごとの集計は「キーid → 件数」の1形に揃えてあり、キーの詳細を共通の集計へ寄せる時に
 * 層の単位をそのまま使える。
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
}

export function computeHeatmapExtraction(trace: Trace, metrics: Metrics): HeatmapExtracted {
  const definitions = new Map(trace.layerDefinitions.map((definition) => [definition.id, definition]));
  const layers = metrics.layers.map((stat): HeatmapLayer => ({
    id: stat.id,
    label: stat.label,
    role: definitions.get(stat.id)?.presentationRole,
    presses: stat.presses,
    keyCounts: stat.keyCounts,
    triggerKeyCounts: stat.triggerKeyCounts,
    pairedTriggerKeyCounts: stat.pairedTriggerKeyCounts,
    colorCounts: normalizedRoleColors(definitions.get(stat.id)?.presentationRole, stat),
  }));
  return {
    integrated: {
      presses: metrics.presses,
      keyCounts: metrics.keyCounts,
      maxCount: Math.max(0, ...metrics.keyCounts.values()),
    },
    layers,
    combo: metrics.comboPresses > 0
      ? {
        id: COMBO_LAYER_ID,
        label: definitions.get(COMBO_LAYER_ID)?.label ?? COMBO_LAYER_ID,
        presses: metrics.comboPresses,
        keyCounts: metrics.comboKeyCounts,
      }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// 入れ忘れ防止テストの材料
// ---------------------------------------------------------------------------

/** `optionsDiscipline.extractForTest` 専用の、1層だけの小さい配列で打った結果。 */
function fixtureExtraction(): HeatmapExtracted {
  const layout = fromRows('heatmap-fixture', 'fixture', ['qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./']);
  const geometry = buildGeometry('row-staggered');
  const trace = generateTrace('aaq', layout, geometry, DEFAULT_TRACE_POLICY);
  return computeHeatmapExtraction(trace, computeMetrics(trace, geometry));
}

/**
 * engine（`engine/cache.ts` の `getExtraction`）が呼ぶ、Analyzer契約の実体。
 * 解析設定はどれも表示だけが変わるので、抽出の結果には効かない。
 */
export const heatmapDefinition: SingleAnalyzerDefinition<HeatmapOptions, HeatmapExtracted> = defineSingleAnalyzer({
  id: 'heatmap',
  options: heatmapOptions,
  extract(context: SingleAnalyzerExtractContext<HeatmapOptions>): HeatmapExtracted {
    return computeHeatmapExtraction(context.trace, context.metrics);
  },
  optionsDiscipline: {
    sample: DEFAULT_HEATMAP_OPTIONS,
    alternates: ALTERNATE_HEATMAP_OPTIONS,
    extractForTest: () => fixtureExtraction(),
  },
});
