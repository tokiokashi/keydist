import { resolveKeyId } from '../../geometry.ts';
import type { PhysicalKeyId } from './types.ts';
import type { RealizedSemanticAction } from './trigger-realization.ts';

export type HoldStartActionGrouping = 'combined' | 'separate';

export interface ActionRealizationPolicy {
  /**
   * while-held開始とfresh outputが同一actionにrealizeされた場合のanalytic action grouping。
   *
   * combined: trigger/outputを1 actionのまま扱う。
   * separate: semantic orderを保てる場合だけhold開始とfresh outputを別actionへ分ける。
   */
  readonly holdStart: HoldStartActionGrouping;
}

export const DEFAULT_ACTION_REALIZATION_POLICY: ActionRealizationPolicy = {
  holdStart: 'combined',
};

export function sameActionRealizationPolicy(
  left: ActionRealizationPolicy,
  right: ActionRealizationPolicy,
): boolean {
  return left.holdStart === right.holdStart;
}

const canonicalKeys = (keys: readonly PhysicalKeyId[]): PhysicalKeyId[] =>
  keys.map(resolveKeyId);

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
 * hold groupをfresh groupより先のanalytic actionへ分けても、
 * canonical order Requirementを壊さない場合だけtrue。
 *
 * Requirementからdefault groupingを推測するのではなく、Policy変換後の
 * streamがsemanticに反しないことだけを検証する。
 *
 * - held -> fresh を要求: split可能
 * - fresh -> held を要求: このPolicyのheld-first splitでは表現しない
 * - 同じgroupがorder境界の両側へ跨る: conservativeにcombined維持
 */
function allowsHeldFirstSplit(
  action: RealizedSemanticAction,
  held: ReadonlySet<PhysicalKeyId>,
  fresh: ReadonlySet<PhysicalKeyId>,
): boolean {
  return action.input.requirements.every((requirement) => {
    if (requirement.kind !== 'order') return true;

    const beforeHeld = intersects(requirement.before, held);
    const afterHeld = intersects(requirement.after, held);
    const beforeFresh = intersects(requirement.before, fresh);
    const afterFresh = intersects(requirement.after, fresh);

    if ((beforeHeld && afterHeld) || (beforeFresh && afterFresh)) return false;
    if (beforeFresh && afterHeld) return false;
    return true;
  });
}

/**
 * 1つのhold-start actionを、semantic orderを保てる場合だけ
 *
 *   [held trigger + fresh output]
 *
 * から
 *
 *   [held trigger] -> [fresh output while trigger held]
 *
 * へ分ける。
 *
 * overlap等のRequirementからgrouping自体は推測しない。
 * order RequirementはPolicy変換のsemantic validity gateとしてのみ使う。
 */
function separateHoldStartAction(
  action: RealizedSemanticAction,
): readonly RealizedSemanticAction[] {
  if (action.holdPhase !== 'start' || action.heldKeys.length === 0) return [action];
  if (action.input.classifications.includes('composition')) return [action];

  const heldSet = new Set(canonicalKeys(action.heldKeys));
  const heldPressKeys = selectKeys(action.keys, heldSet);
  if (heldPressKeys.length === 0) return [action];

  const freshKeys = canonicalKeys(action.keys).filter((key) => !heldSet.has(key));
  if (freshKeys.length === 0) return [action];

  const freshSet = new Set(freshKeys);
  const freshOutputKeys = selectKeys(action.outputKeys, freshSet);
  // prefix等、hold開始自体が既にtrigger-only actionなら分割しない。
  if (freshOutputKeys.length === 0) return [action];

  if (!allowsHeldFirstSplit(action, heldSet, freshSet)) return [action];

  const holdStart: RealizedSemanticAction = {
    ...action,
    keys: heldPressKeys,
    outputKeys: selectKeys(action.outputKeys, heldSet),
    triggerKeys: selectKeys(action.triggerKeys, heldSet),
    heldKeys: canonicalKeys(action.heldKeys),
    holdPhase: 'start',
  };

  const output: RealizedSemanticAction = {
    ...action,
    keys: freshKeys,
    outputKeys: freshOutputKeys,
    triggerKeys: selectKeys(action.triggerKeys, freshSet),
    heldKeys: canonicalKeys(action.heldKeys),
    holdPhase: 'continue',
  };

  return [holdStart, output];
}

/**
 * Trigger realization済みのaction streamへanalytic grouping policyを適用する。
 *
 * defaultはidentity。Requirementはgroupingの推測には使わず、
 * policy変換がcanonical semanticを壊さないためのvalidity gateにだけ使う。
 */
export function applyActionRealizationPolicy(
  actions: readonly RealizedSemanticAction[],
  policy: ActionRealizationPolicy = DEFAULT_ACTION_REALIZATION_POLICY,
): readonly RealizedSemanticAction[] {
  if (policy.holdStart === 'combined') return actions;
  return actions.flatMap(separateHoldStartAction);
}
