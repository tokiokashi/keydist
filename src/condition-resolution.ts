import type { GeometryKind } from './geometry.ts';
import type { ChainPolicy } from './analysis-chain.ts';
import type { ArpeggioPolicy } from './analysis-arpeggio.ts';
import type { Options } from './evaluate.ts';
import type { TriggerRealizationPolicy } from './trigger-realization.ts';
import type { HoldStartActionPolicy } from './hold-start-action.ts';
import type { UiStateConditionsDefaults, UiStateLayoutConditions } from './ui-state.ts';

export interface ResolvedConditions {
  geometry: GeometryKind;
  options: Options;
  chainPolicy: ChainPolicy;
  arpeggioPolicy: ArpeggioPolicy;
  triggerRealizationPolicy: TriggerRealizationPolicy;
  holdStartActionPolicy: HoldStartActionPolicy;
}

/** 全体の既定値へ配列ごとの差分を重ね、評価へ渡す条件を一つに決める。 */
export function resolveConditions(
  defaults: UiStateConditionsDefaults,
  override: Partial<UiStateConditionsDefaults> | undefined,
): ResolvedConditions {
  const values = { ...defaults, ...override };
  return {
    geometry: values.geometry,
    chainPolicy: { ...values.chain },
    arpeggioPolicy: { ...values.arpeggioPolicy },
    triggerRealizationPolicy: { ...values.triggerRealization },
    holdStartActionPolicy: { ...values.holdStartAction },
    options: {
      windowSize: values.windowSize,
      sfbHomeCost: values.sfbHomeCost,
      preferOppositeThumb: values.preferOppositeThumb,
      triggerRealizationPolicy: { ...values.triggerRealization },
    },
  };
}

/** 詳細画面の形状変更。既存の配列別条件は geometry 以外も含めて保持する。 */
export function setLayoutGeometryOverride(
  perLayout: Record<string, UiStateLayoutConditions>,
  layoutId: string,
  geometry: GeometryKind,
  defaultGeometry: GeometryKind,
): void {
  const override = perLayout[layoutId];
  if (override === undefined) {
    if (geometry !== defaultGeometry) perLayout[layoutId] = { geometry };
    return;
  }
  if (geometry === defaultGeometry) delete override.geometry;
  else override.geometry = geometry;
}
