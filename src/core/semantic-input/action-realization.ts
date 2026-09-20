import { resolveKeyId } from '../../geometry.ts';
import type { PhysicalKeyId } from './types.ts';
import type { RealizedSemanticAction } from './trigger-realization.ts';

export type HoldStartActionGrouping = 'combined' | 'separate';

export interface ActionRealizationPolicy {
  /**
   * while-held開始とfresh outputが同一actionにrealizeされた場合のanalytic action grouping。
   *
   * combined: trigger/outputを1 actionのまま扱う。
   * separate: hold開始を先行actionへ分け、fresh outputをheld state下の後続actionへ分ける。
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

/**
 * 1つのhold-start actionを、必要な場合だけ
 *
 *   [held trigger + fresh output]
 *
 * から
 *
 *   [held trigger] -> [fresh output while trigger held]
 *
 * へ分ける。
 *
 * Requirementからgroupingを推測しない。Trigger realizationが確定した
 * heldKeys / holdPhase / participation factだけを使う。
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
 * defaultはidentity。semantic成立条件やhold可否はここで再判定しない。
 */
export function applyActionRealizationPolicy(
  actions: readonly RealizedSemanticAction[],
  policy: ActionRealizationPolicy = DEFAULT_ACTION_REALIZATION_POLICY,
): readonly RealizedSemanticAction[] {
  if (policy.holdStart === 'combined') return actions;
  return actions.flatMap(separateHoldStartAction);
}
