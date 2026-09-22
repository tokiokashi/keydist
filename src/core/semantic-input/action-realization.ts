import { resolveKeyId } from '../../geometry.ts';
import type { PhysicalKeyId, SemanticInput } from './types.ts';
import type { RealizedSemanticAction } from './trigger-realization.ts';

export type TriggerActivationGrouping = 'combined' | 'separate';
export type TriggerActivationMode = 'disabled' | 'semantic';
export type TriggerActivationClass =
  | 'prepress-required'
  | 'order-free'
  | 'postpress-required';

export const DEFAULT_TRIGGER_ACTIVATION_GROUPINGS: Readonly<
  Record<TriggerActivationClass, TriggerActivationGrouping>
> = {
  'prepress-required': 'separate',
  'order-free': 'combined',
  'postpress-required': 'combined',
};

export interface TriggerActivationSelector {
  /** authoring由来のcanonical logical trigger group。 */
  readonly triggerGroupId?: string;
  /** 同じphysical trigger集合をsemantic contextごとに分ける時のaggregation scope。 */
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
   * disabled: fresh trigger activationは常にoutputと同じactionのまま。
   * semantic: Requirementに従う既定groupingを有効化する。
   */
  readonly triggerActivation: TriggerActivationMode;
  /**
   * semantic既定値への大分類override。
   * concrete selector overrideより優先度は低い。
   */
  readonly triggerActivationClassOverrides?: Readonly<
    Partial<Record<TriggerActivationClass, TriggerActivationGrouping>>
  >;
  /** layout内のtrigger groupごとの例外。physical selectorほど優先する。 */
  readonly triggerActivationOverrides?: readonly TriggerActivationOverride[];
}

export const DEFAULT_ACTION_REALIZATION_POLICY: ActionRealizationPolicy = {
  triggerActivation: 'disabled',
  triggerActivationClassOverrides: {},
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
): boolean => left.triggerGroupId === right.triggerGroupId
  && left.layerId === right.layerId
  && sameOptionalKeys(left.triggerKeys, right.triggerKeys);

const ACTIVATION_CLASSES: readonly TriggerActivationClass[] = [
  'prepress-required',
  'order-free',
  'postpress-required',
];

function sameClassOverrides(
  left: ActionRealizationPolicy['triggerActivationClassOverrides'],
  right: ActionRealizationPolicy['triggerActivationClassOverrides'],
): boolean {
  return ACTIVATION_CLASSES.every((key) => left?.[key] === right?.[key]);
}

export function sameActionRealizationPolicy(
  left: ActionRealizationPolicy,
  right: ActionRealizationPolicy,
): boolean {
  if (left.triggerActivation !== right.triggerActivation) return false;
  if (!sameClassOverrides(
    left.triggerActivationClassOverrides,
    right.triggerActivationClassOverrides,
  )) return false;
  const leftOverrides = left.triggerActivationOverrides ?? [];
  const rightOverrides = right.triggerActivationOverrides ?? [];
  if (leftOverrides.length !== rightOverrides.length) return false;
  return leftOverrides.every((override, index) => {
    const candidate = rightOverrides[index];
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

/**
 * trigger/output間のcanonical orderだけを分類する。
 * release側の将来分離とは別概念で、postpress-requiredはtrigger-first split不可を表す。
 */
export function classifyTriggerActivation(
  input: SemanticInput,
  triggerKeys: readonly PhysicalKeyId[],
  outputKeys: readonly PhysicalKeyId[],
): TriggerActivationClass {
  const trigger = new Set(canonicalKeys(triggerKeys));
  const output = new Set(canonicalKeys(outputKeys));
  let triggerBeforeOutput = false;
  let outputBeforeTrigger = false;

  for (const requirement of input.requirements) {
    if (requirement.kind !== 'order') continue;
    if (intersects(requirement.before, trigger) && intersects(requirement.after, output)) {
      triggerBeforeOutput = true;
    }
    if (intersects(requirement.before, output) && intersects(requirement.after, trigger)) {
      outputBeforeTrigger = true;
    }
  }

  if (outputBeforeTrigger) return 'postpress-required';
  if (triggerBeforeOutput) return 'prepress-required';
  return 'order-free';
}

const selectorMatches = (
  selector: TriggerActivationSelector,
  action: RealizedSemanticAction,
): boolean => {
  if (selector.triggerGroupId !== undefined
    && selector.triggerGroupId !== action.input.triggerGroupId) return false;
  if (selector.layerId !== undefined && selector.layerId !== action.input.layerId) return false;
  if (selector.triggerKeys !== undefined
    && canonicalKeyIdentity(selector.triggerKeys) !== canonicalKeyIdentity(action.triggerKeys)) {
    return false;
  }
  return selector.triggerGroupId !== undefined
    || selector.layerId !== undefined
    || selector.triggerKeys !== undefined;
};

function concreteOverrideFor(
  action: RealizedSemanticAction,
  policy: ActionRealizationPolicy,
): TriggerActivationGrouping | undefined {
  const matches = (policy.triggerActivationOverrides ?? [])
    .filter((override) => selectorMatches(override.selector, action));
  return matches.find((override) => override.selector.triggerKeys !== undefined)?.grouping
    ?? matches.find((override) => override.selector.triggerGroupId !== undefined)?.grouping
    ?? matches.find((override) => override.selector.layerId !== undefined)?.grouping;
}

const groupingFor = (
  action: RealizedSemanticAction,
  policy: ActionRealizationPolicy,
): TriggerActivationGrouping => {
  if (policy.triggerActivation === 'disabled') return 'combined';
  if (action.input.classifications.includes('composition')) return 'combined';

  const concrete = concreteOverrideFor(action, policy);
  if (concrete !== undefined) return concrete;

  const activationClass = classifyTriggerActivation(
    action.input,
    action.triggerKeys,
    action.outputKeys,
  );
  return policy.triggerActivationClassOverrides?.[activationClass]
    ?? DEFAULT_TRIGGER_ACTIVATION_GROUPINGS[activationClass];
};

/**
 * trigger groupをremaining groupより先のanalytic actionへ分けても、
 * canonical order Requirementを壊さない場合だけtrue。
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
 * hold状態は別軸。hold startなら後続outputへcontinueを引き継ぐ。
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
 * semantic modeではRequirementからactivation classを決め、
 * prepress-requiredだけを既定で分離する。
 */
export function applyActionRealizationPolicy(
  actions: readonly RealizedSemanticAction[],
  policy: ActionRealizationPolicy = DEFAULT_ACTION_REALIZATION_POLICY,
): readonly RealizedSemanticAction[] {
  if (policy.triggerActivation === 'disabled') return actions;
  return actions.flatMap((action) =>
    groupingFor(action, policy) === 'separate'
      ? separateTriggerActivation(action)
      : [action]);
}
