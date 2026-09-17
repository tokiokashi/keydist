import type { GeometryKind } from './geometry.ts';
import type { Options } from './evaluate.ts';
import type { UiStateConditionsDefaults } from './ui-state.ts';

export interface ResolvedConditions {
  geometry: GeometryKind;
  options: Options;
}

/** 全体の既定値へ配列ごとの差分を重ね、評価へ渡す条件を一つに決める。 */
export function resolveConditions(
  defaults: UiStateConditionsDefaults,
  override: Partial<UiStateConditionsDefaults> | undefined,
): ResolvedConditions {
  const values = { ...defaults, ...override };
  return {
    geometry: values.geometry,
    options: {
      windowSize: values.windowSize,
      sfbHomeCost: values.sfbHomeCost,
      preferOppositeThumb: values.preferOppositeThumb,
    },
  };
}
