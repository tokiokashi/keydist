import { defineSingleAnalyzer, type SingleAnalyzerDefinition, type SingleAnalyzerExtractContext } from '#analyzers/contract.ts';
import type { LayerPresentationRole } from '#input/layouts/types.ts';
import { attributeMetrics } from '#interpretation/attribution.ts';
import { layerComboDisciplineContext } from '#analyzers/discipline-material.ts';
import { DEFAULT_LAYER_COMBO_PRESSES_OPTIONS, layerComboPressesOptions, type LayerComboPressesOptions } from './options.ts';

/**
 * レイヤーとコンボの押下数の抽出（仕様 §11.10の帰属先ごとの押下数）。
 *
 * 押下をレイヤーとコンボ枠へ割り振る規則は `computeMetrics` が持つので、ここでは数え直さず、
 * `interpretation/attribution.ts` が `Metrics` の集計に表示区分を添えた値を、表の行に並べるだけにする。
 * 割合は求めない（表示側が各行の `presses` と `LayerComboPressesExtracted.presses` から求める）。
 */

/** 帰属先1つぶん（表の1行）。 */
export interface AttributionRow {
  /** レイヤーのid（Traceの `aggregationGroupId`）。コンボ枠は `COMBO_LAYER_ID` */
  readonly id: string;
  readonly label: string;
  readonly kind: 'layer' | 'combo';
  /** 配列定義が宣言した表示区分。宣言の無いレイヤーとコンボ枠は `undefined` */
  readonly role: LayerPresentationRole | undefined;
  /** この帰属先に帰属するキー押下の総数 */
  readonly presses: number;
}

export interface LayerComboPressesExtracted {
  /** 全キー押下の総数（`Metrics.presses`）。帰属先ごとの押下数の和に等しい */
  readonly presses: number;
  /** レイヤーを配列の宣言順に並べ、コンボ枠があれば末尾に置く */
  readonly rows: readonly AttributionRow[];
}

/** 抽出の入力。解析設定は無い。 */
export type LayerComboPressesExtractInput = Pick<SingleAnalyzerExtractContext<LayerComboPressesOptions>, 'trace' | 'metrics'>;

export function computeLayerComboPressesExtraction({ trace, metrics }: LayerComboPressesExtractInput): LayerComboPressesExtracted {
  const attribution = attributeMetrics(trace.layerDefinitions, metrics);
  const rows: AttributionRow[] = attribution.layers.map((layer) => ({
    id: layer.id,
    label: layer.label,
    kind: 'layer',
    role: layer.role,
    presses: layer.presses,
  }));
  if (attribution.combo !== undefined) {
    rows.push({
      id: attribution.combo.id,
      label: attribution.combo.label,
      kind: 'combo',
      role: undefined,
      presses: attribution.combo.presses,
    });
  }
  return { presses: metrics.presses, rows };
}

/** engine（`engine/cache.ts` の `getExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const layerComboPressesDefinition: SingleAnalyzerDefinition<LayerComboPressesOptions, LayerComboPressesExtracted> = defineSingleAnalyzer({
  id: 'layer-combo-presses',
  options: layerComboPressesOptions,
  extract: computeLayerComboPressesExtraction,
  optionsDiscipline: {
    sample: DEFAULT_LAYER_COMBO_PRESSES_OPTIONS,
    alternates: DEFAULT_LAYER_COMBO_PRESSES_OPTIONS,
    context: layerComboDisciplineContext,
  },
});
