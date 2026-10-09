import { defineSingleAnalyzer, type SingleAnalyzerDefinition, type SingleAnalyzerExtractContext } from '#analyzers/contract.ts';
import type { LayerPresentationRole } from '#input/layouts/types.ts';
import { attributeMetrics } from '#interpretation/attribution.ts';
import { layerComboDisciplineContext } from '#analyzers/discipline-material.ts';
import { DEFAULT_LAYER_COMBO_OPTIONS, layerComboOptions, type LayerComboOptions } from './options.ts';

/**
 * レイヤーとコンボの内訳の抽出（仕様 §11.10の帰属先ごとの押下数）。
 *
 * 押下をレイヤーとコンボ枠へ割り振る規則は `computeMetrics` が持つので、ここでは数え直さず、
 * `interpretation/attribution.ts` が `Metrics` の集計に表示区分を添えた値を、表の行に並べるだけにする。
 * 割合は求めない（表示側が各行の `presses` と `LayerComboExtracted.presses` から求める）。
 * 修飾の一覧・コンボ表・コンボの配列図は配列の定義から出すので、ここには入らない。
 */

/** 帰属先1つぶん。 */
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

export interface LayerComboExtracted {
  /** 全キー押下の総数（`Metrics.presses`）。帰属先ごとの押下数の和に等しい */
  readonly presses: number;
  /** レイヤーを配列の宣言順に並べ、コンボ枠があれば末尾に置く */
  readonly rows: readonly AttributionRow[];
}

/** 抽出の入力。解析設定は無い。 */
export type LayerComboExtractInput = Pick<SingleAnalyzerExtractContext<LayerComboOptions>, 'trace' | 'metrics'>;

export function computeLayerComboExtraction({ trace, metrics }: LayerComboExtractInput): LayerComboExtracted {
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
export const layerComboDefinition: SingleAnalyzerDefinition<LayerComboOptions, LayerComboExtracted> = defineSingleAnalyzer({
  id: 'layer-combo',
  options: layerComboOptions,
  extract: computeLayerComboExtraction,
  optionsDiscipline: {
    sample: DEFAULT_LAYER_COMBO_OPTIONS,
    alternates: DEFAULT_LAYER_COMBO_OPTIONS,
    context: layerComboDisciplineContext,
  },
});
