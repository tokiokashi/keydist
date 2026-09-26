import type { GeometryKind } from '#input/shapes/geometry.ts';
import type { ChainPolicy } from '#interpretation/structure/chain.ts';
import type { ArpeggioPolicy } from '#interpretation/structure/arpeggio.ts';
import type { Options } from '#trace/generate.ts';
import type {
  ActionRealizationPolicy,
  TriggerRealizationPolicy,
} from '#input/semantics/index.ts';
import type { ConditionDefaults, LayoutConditionOverrides } from './conditions.ts';

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
  defaults: ConditionDefaults,
  override: LayoutConditionOverrides | undefined,
): ResolvedConditions {
  const values = { ...defaults, ...override };
  const actionRealizationPolicy: ActionRealizationPolicy = {
    triggerActivation: values.actionRealization.triggerActivation,
    triggerActivationClassOverrides: {
      ...(values.actionRealization.triggerActivationClassOverrides ?? {}),
    },
    triggerActivationOverrides: (values.actionRealization.triggerActivationOverrides ?? []).map((item) => ({
      selector: {
        ...(item.selector.modifierGroupIds === undefined
          ? {}
          : { modifierGroupIds: [...item.selector.modifierGroupIds] }),
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
  perLayout: Record<string, LayoutConditionOverrides>,
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
