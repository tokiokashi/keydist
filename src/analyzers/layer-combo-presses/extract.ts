import { defineSingleAnalyzer, type SingleAnalyzerDefinition, type SingleAnalyzerExtractContext } from '#analyzers/contract.ts';
import type { LayerPresentationRole } from '#input/layouts/types.ts';
import { attributeMetrics } from '#interpretation/attribution.ts';
import { computeTriggerParticipation, type TriggerCounts } from '#interpretation/trigger-participation.ts';
import { layerComboDisciplineContext } from '#analyzers/discipline-material.ts';
import { DEFAULT_LAYER_COMBO_PRESSES_OPTIONS, layerComboPressesOptions, type LayerComboPressesOptions } from './options.ts';

/**
 * レイヤーとコンボの押下数の抽出（仕様 §11.10の帰属先ごとの押下数）。
 *
 * 押下をレイヤーとコンボ枠へ割り振る規則は `computeMetrics` が持つので、ここでは数え直さず、
 * `interpretation/attribution.ts` が `Metrics` の集計に表示区分を添えた値を、表の行に並べるだけにする。
 * 割合は求めない（表示側が各行の `presses` と `LayerComboPressesExtracted.presses` から求める）。
 *
 * 切り替えのキーの参加率と同手率（仕様 §11.10.1）は、キー押下ではなくStrokeを単位にするので、別の表として
 * `interpretation/trigger-participation.ts` の回数を行に並べる。分母は `LayerComboPressesExtracted.strokes`。
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

/** 切り替えのキーの行1つぶん（仕様 §11.10.1）。 */
export interface TriggerRow {
  readonly id: string;
  readonly label: string;
  /** その行の条件に当たる打鍵（Stroke）の数 */
  readonly participated: number;
  /** そのうち、切り替えのキーと出力が同じ手の打鍵の数 */
  readonly sameHand: number;
}

/** 行の群。同じ打鍵が、群の中の複数の行に入ることがある。 */
export interface TriggerGroup {
  readonly id: 'all' | 'face' | 'order' | 'persistence' | 'composition';
  readonly label: string;
  readonly rows: readonly TriggerRow[];
}

export interface LayerComboPressesExtracted {
  /** 全キー押下の総数（`Metrics.presses`）。帰属先ごとの押下数の和に等しい */
  readonly presses: number;
  /** レイヤーを配列の宣言順に並べ、コンボ枠があれば末尾に置く */
  readonly rows: readonly AttributionRow[];
  /** 全打鍵（Stroke）の数。切り替えのキーの参加率の分母 */
  readonly strokes: number;
  readonly triggerGroups: readonly TriggerGroup[];
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
  const participation = computeTriggerParticipation(trace);
  const row = (id: string, label: string, counts: TriggerCounts | undefined): TriggerRow => ({
    id,
    label,
    participated: counts?.participated ?? 0,
    sameHand: counts?.sameHand ?? 0,
  });
  const triggerGroups: TriggerGroup[] = [
    { id: 'all', label: '全体', rows: [row('all', '切り替えのキーが参加した打鍵', participation.all)] },
    { id: 'face', label: 'レイヤー・コンボ', rows: rows.map((entry) => row(entry.id, entry.label, participation.faces.get(entry.id))) },
    {
      id: 'order',
      label: '打鍵の順序',
      rows: [
        row('overlap', '同時に押す', participation.orders.overlap),
        row('before', '先に打つ', participation.orders.before),
        row('after', '後に打つ', participation.orders.after),
      ],
    },
    {
      id: 'persistence',
      label: '持続',
      rows: [row('single', '単発', participation.persistence.single), row('held', '保持', participation.persistence.held)],
    },
    {
      id: 'composition',
      label: '合成',
      rows: [
        row('layer', '合成（レイヤーに数える）', participation.composition.layer),
        row('combo', '合成（コンボ枠に数える）', participation.composition.combo),
        row('none', '合成以外', participation.composition.none),
      ],
    },
  ];
  return { presses: metrics.presses, rows, strokes: participation.strokes, triggerGroups };
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
