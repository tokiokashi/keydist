import { COMBO_LAYER_ID, type LayerDefinition, type LayerPresentationRole } from '#input/layouts/types.ts';
import type { Metrics } from './metrics.ts';

/**
 * 押下の帰属先（仕様 §11.10）。
 *
 * 押下をレイヤーとコンボ枠へ割り振る規則は `computeMetrics` が1か所で持つ。ここでは数え直さず、
 * `Metrics` の層別・コンボ枠の集計に、配列が宣言したレイヤーの表示区分を添えて並べるだけにする。
 * ヒートマップとレイヤー・コンボの内訳が、同じ組み立てを使うための置き場。
 */

/** レイヤー1つぶんの帰属。並びは配列の宣言順で、宣言に無いレイヤーに帰属した押下は末尾に付く。 */
export interface LayerAttribution {
  /** レイヤーのid（Traceの `aggregationGroupId`） */
  readonly id: string;
  readonly label: string;
  /** 配列定義が宣言した表示区分。宣言の無いレイヤーは `undefined` */
  readonly role: LayerPresentationRole | undefined;
  /** レイヤーに帰属するキー押下の総数 */
  readonly presses: number;
  /** キーid → 押下数 */
  readonly keyCounts: ReadonlyMap<string, number>;
  /** レイヤー操作として押したキーid → 回数。`keyCounts` に含まれる */
  readonly triggerKeyCounts: ReadonlyMap<string, number>;
  /** 同じレイヤーの文字トリガーを複数同時押下したキーid → 回数 */
  readonly pairedTriggerKeyCounts: ReadonlyMap<string, number>;
}

/** コンボ枠の帰属。レイヤーとは別に数える。 */
export interface ComboAttribution {
  readonly id: string;
  readonly label: string;
  readonly presses: number;
  readonly keyCounts: ReadonlyMap<string, number>;
}

export interface Attribution {
  readonly layers: readonly LayerAttribution[];
  /** コンボ枠。配列がコンボ枠を宣言していないか、押下も無ければ `undefined` */
  readonly combo: ComboAttribution | undefined;
}

export function attributeMetrics(layerDefinitions: readonly LayerDefinition[], metrics: Metrics): Attribution {
  const definitions = new Map(layerDefinitions.map((definition) => [definition.id, definition]));
  const layers = metrics.layers.map((stat): LayerAttribution => ({
    id: stat.id,
    label: stat.label,
    role: definitions.get(stat.id)?.presentationRole,
    presses: stat.presses,
    keyCounts: stat.keyCounts,
    triggerKeyCounts: stat.triggerKeyCounts,
    pairedTriggerKeyCounts: stat.pairedTriggerKeyCounts,
  }));
  const comboDefinition = layerDefinitions.find((definition) => definition.kind === 'combo');
  const hasCombo = comboDefinition !== undefined || metrics.comboPresses > 0;
  return {
    layers,
    combo: hasCombo
      ? {
        id: COMBO_LAYER_ID,
        label: definitions.get(COMBO_LAYER_ID)?.label ?? COMBO_LAYER_ID,
        presses: metrics.comboPresses,
        keyCounts: metrics.comboKeyCounts,
      }
      : undefined,
  };
}
