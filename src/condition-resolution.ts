import type { GeometryKind } from './geometry.ts';
import type { ChainPolicy } from './analysis-chain.ts';
import type { ArpeggioPolicy } from './analysis-arpeggio.ts';
import type { Options } from './evaluate.ts';
import type {
  ActionRealizationPolicy,
  TriggerRealizationPolicy,
} from './core/semantic-input/index.ts';
import type { UiStateConditionsDefaults, UiStateLayoutConditions } from './ui-state.ts';

export interface ResolvedConditions {
  geometry: GeometryKind;
  options: Options;
  chainPolicy: ChainPolicy;
  arpeggioPolicy: ArpeggioPolicy;
  triggerRealizationPolicy: TriggerRealizationPolicy;
  actionRealizationPolicy: ActionRealizationPolicy;
}

/** 全体の既定値へ配列ごとの差分を重ね、評価へ渡す条件を一つに決める。 */
export function resolveConditions(
  defaults: UiStateConditionsDefaults,
  override: Partial<UiStateConditionsDefaults> | undefined,
): ResolvedConditions {
  const values = { ...defaults, ...override };
  const actionRealizationPolicy: ActionRealizationPolicy = {
    triggerActivation: values.actionRealization.triggerActivation,
    triggerActivationOverrides: (values.actionRealization.triggerActivationOverrides ?? []).map((item) => ({
      selector: {
        ...(item.selector.layerId === undefined ? {} : { layerId: item.selector.layerId }),
        ...(item.selector.triggerKeys === undefined ? {} : { triggerKeys: [...item.selector.triggerKeys] }),
      },
      grouping: item.grouping,
    })),
  };
  return {
    geometry: values.geometry,
    chainPolicy: { ...values.chain },
    arpeggioPolicy: { ...values.arpeggioPolicy },
    triggerRealizationPolicy: { ...values.triggerRealization },
    actionRealizationPolicy,
    options: {
      windowSize: values.windowSize,
      sfbHomeCost: values.sfbHomeCost,
      preferOppositeThumb: values.preferOppositeThumb,
      triggerRealizationPolicy: { ...values.triggerRealization },
      actionRealizationPolicy: { ...actionRealizationPolicy },
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
