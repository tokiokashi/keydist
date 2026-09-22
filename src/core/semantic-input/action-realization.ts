import { resolveKeyId } from '../../geometry.ts';
import type { PhysicalKeyId } from './types.ts';
import type { RealizedSemanticAction } from './trigger-realization.ts';

export type TriggerActivationGrouping = 'combined' | 'separate';

export interface TriggerActivationSelector {
  /** 同じphysical trigger集合をsemantic contextごとに分ける時のscope。 */
  readonly layerId?: string;
  /** fresh trigger pressのcanonical key集合。順序はidentityに含めない。 */
  readonly triggerKeys?: readonly PhysicalKeyId[];
}

export interface TriggerActivationOverride {
  readonly selector: TriggerActivationSelector;
  readonly grouping: TriggerActivationGrouping;
}

export interface ActionRealizationPolicy {
  /**
   * fresh trigger activationとfresh outputが同一actionにrealizeされた場合のgrouping既定値。
   *
   * combined: trigger/outputを1 actionのまま扱う。
   * separate: semantic orderを保てる場合だけtrigger activationを先行actionへ分ける。
   */
  readonly triggerActivation: TriggerActivationGrouping;
  /** layout内のtrigger groupごとの例外。先頭一致を採用する。 */
  readonly triggerActivationOverrides: readonly TriggerActivationOverride[];
}

export const DEFAULT_ACTION_REALIZATION_POLICY: ActionRealizationPolicy = {
  triggerActivation: 'combined',
  triggerActivationOverrides: [],
};

const canonicalKeys = (keys: readonly PhysicalKeyId[]): PhysicalKeyId[] =>
  [...new Set(keys.map(resolveKeyId))];

const canonicalKeyIdentity = (keys: readonly PhysicalKeyId[]): string =>
  [...canonicalKeys(keys)].sort().join('\u0000');

const sameOptionalKeys = (
  left: readonly PhysicalKeyId[] | undefined,
  right: readonly PhysicalKeyId[] | undefined,
): boolean => left === undefined
  ? right === undefined
  : right !== undefined && canonicalKeyIdentity(left) === canonicalKeyIdentity(right);

const sameSelector = (
  left: TriggerActivationSelector,
  right: TriggerActivationSelector,
): boolean => left.layerId === right.layerId
  && sameOptionalKeys(left.triggerKeys, right.triggerKeys);

export function sameActionRealizationPolicy(
  left: ActionRealizationPolicy,
  right: ActionRealizationPolicy,
): boolean {
  if (left.triggerActivation !== right.triggerActivation) return false;
  if (left.triggerActivationOverrides.length !== right.triggerActivationOverrides.length) return false;
  return left.triggerActivationOverrides.every((override, index) => {
    const candidate = right.triggerActivationOverrides[index];
    return candidate !== undefined
      && override.grouping === candidate.grouping
      && sameSelector(override.selector, candidate.selector);
  });
}

const selectKeys = (
  keys: readonly PhysicalKeyId[],
  selected: ReadonlySet<PhysicalKeyId>,
): PhysicalKeyId[] =>
  canonicalKeys(keys).filter((key) => selected.has(key));

const intersects = (
  keys: readonly PhysicalKeyId[],
  selected: ReadonlySet<PhysicalKeyId>,
): boolean => canonicalKeys(keys).some((key) => selected.has(key));

const selectorMatches = (
  selector: TriggerActivationSelector,
  action: RealizedSemanticAction,
): boolean => {
  if (selector.layerId !== undefined && selector.layerId !== action.input.layerId) return false;
  if (selector.triggerKeys !== undefined
    && canonicalKeyIdentity(selector.triggerKeys) !== canonicalKeyIdentity(action.triggerKeys)) {
    return false;
  }
  return selector.layerId !== undefined || selector.triggerKeys !== undefined;
};

const groupingFor = (
  action: RealizedSemanticAction,
  policy: ActionRealizationPolicy,
): TriggerActivationGrouping =>
  policy.triggerActivationOverrides.find((override) => selectorMatches(override.selector, action))
    ?.grouping
  ?? policy.triggerActivation;

/**
 * trigger groupをremaining groupより先のanalytic actionへ分けても、
 * canonical order Requirementを壊さない場合だけtrue。
 *
 * Requirementからdefault groupingを推測するのではなく、Policy変換後の
 * streamがsemanticに反しないことだけを検証する。
 */
function allowsTriggerFirstSplit(
  action: RealizedSemanticAction,
  trigger: ReadonlySet<PhysicalKeyId>,
  remaining: ReadonlySet<PhysicalKeyId>,
): boolean {
  return action.input.requirements.every((requirement) => {
    if (requirement.kind !== 'order') return true;

    const beforeTrigger = intersects(requirement.before, trigger);
    const afterTrigger = intersects(requirement.after, trigger);
    const beforeRemaining = intersects(requirement.before, remaining);
    const afterRemaining = intersects(requirement.after, remaining);

    if ((beforeTrigger && afterTrigger) || (beforeRemaining && afterRemaining)) return false;
    if (beforeRemaining && afterTrigger) return false;
    return true;
  });
}

/**
 * fresh trigger + fresh outputを、semantic orderを保てる場合だけ
 *
 *   [fresh trigger + fresh output]
 *
 * から
 *
 *   [fresh trigger] -> [fresh output]
 *
 * へ分ける。
 *
 * hold状態は別軸。hold startなら後続outputへcontinueを引き継ぐが、
 * useHold=falseの通常triggerでも同じ分割規則を適用する。
 */
function separateTriggerActivation(
  action: RealizedSemanticAction,
): readonly RealizedSemanticAction[] {
  if (action.input.classifications.includes('composition')) return [action];

  const pressed = new Set(canonicalKeys(action.keys));
  const triggerKeys = canonicalKeys(action.triggerKeys).filter((key) => pressed.has(key));
  if (triggerKeys.length === 0) return [action];

  const triggerSet = new Set(triggerKeys);
  const outputKeys = canonicalKeys(action.outputKeys).filter((key) => pressed.has(key));
  if (outputKeys.length === 0) return [action];

  // 1つのphysical pressがtrigger/output両roleを兼ねる場合は分離不能。
  if (outputKeys.some((key) => triggerSet.has(key))) return [action];

  const remainingKeys = canonicalKeys(action.keys).filter((key) => !triggerSet.has(key));
  if (remainingKeys.length === 0) return [action];

  const remainingSet = new Set(remainingKeys);
  if (!allowsTriggerFirstSplit(action, triggerSet, remainingSet)) return [action];

  const triggerAction: RealizedSemanticAction = {
    ...action,
    keys: triggerKeys,
    outputKeys: [],
    triggerKeys,
    heldKeys: canonicalKeys(action.heldKeys),
  };

  const outputAction: RealizedSemanticAction = {
    ...action,
    keys: remainingKeys,
    outputKeys: selectKeys(action.outputKeys, remainingSet),
    triggerKeys: selectKeys(action.triggerKeys, remainingSet),
    heldKeys: canonicalKeys(action.heldKeys),
    ...(action.holdPhase === 'start' ? { holdPhase: 'continue' as const } : {}),
  };

  return [triggerAction, outputAction];
}

/**
 * Trigger realization済みのaction streamへanalytic grouping policyを適用する。
 *
 * continuous holdとtrigger activation groupingは直交する。
 * Requirementはgroupingの推測には使わず、policy変換がcanonical semanticを
 * 壊さないためのvalidity gateにだけ使う。
 */
export function applyActionRealizationPolicy(
  actions: readonly RealizedSemanticAction[],
  policy: ActionRealizationPolicy = DEFAULT_ACTION_REALIZATION_POLICY,
): readonly RealizedSemanticAction[] {
  return actions.flatMap((action) =>
    groupingFor(action, policy) === 'separate'
      ? separateTriggerActivation(action)
      : [action]);
}
