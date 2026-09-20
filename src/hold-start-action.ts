import type { ActionRealizationPolicy } from './core/semantic-input/index.ts';

/**
 * UI / persisted conditions compatibility for the pre-#261 hold-start setting.
 *
 * Analysis coreでは直接使用せず、condition resolution境界で
 * ActionRealizationPolicyへ変換する。
 */
export interface HoldStartActionPolicy {
  countAsSeparateStep: boolean;
}

export const DEFAULT_HOLD_START_ACTION_POLICY: HoldStartActionPolicy = {
  countAsSeparateStep: false,
};

export function sameHoldStartActionPolicy(
  left: HoldStartActionPolicy,
  right: HoldStartActionPolicy,
): boolean {
  return left.countAsSeparateStep === right.countAsSeparateStep;
}

export function toActionRealizationPolicy(
  policy: HoldStartActionPolicy,
): ActionRealizationPolicy {
  return {
    holdStart: policy.countAsSeparateStep ? 'separate' : 'combined',
  };
}
