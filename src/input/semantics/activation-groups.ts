import type { Layout } from '../layouts/index.ts';
import {
  classifyTriggerActivation,
  type SemanticInput,
  type TriggerActivationClass,
  type TriggerActivationSelector,
} from './index.ts';

export interface TriggerActivationGroup {
  readonly modifierGroupIds: readonly string[];
  readonly triggerKeys: readonly string[];
  readonly label: string;
  readonly activationClass: TriggerActivationClass;
}

export interface TriggerActivationLogicalGroup {
  readonly modifierGroupIds: readonly string[];
  readonly label: string;
  readonly activationClasses: readonly TriggerActivationClass[];
  readonly groups: readonly TriggerActivationGroup[];
}

export const TRIGGER_ACTIVATION_CLASS_LABELS: Record<TriggerActivationClass, string> = {
  'prepress-required': '先押し必須',
  'order-free': '押し順不問',
  'postpress-required': '後押し必須',
};

export function canonicalTriggerKeys(keys: readonly string[]): string[] {
  return [...new Set(keys)].sort();
}

export function canonicalModifierGroupIds(groupIds: readonly string[]): string[] {
  return [...new Set(groupIds)].sort((left, right) => left.localeCompare(right, 'ja'));
}

function modifierGroupIdsForTriggerKeys(
  input: SemanticInput,
  triggerKeys: readonly string[],
): string[] {
  const trigger = new Set(canonicalTriggerKeys(triggerKeys));
  return canonicalModifierGroupIds(input.roles.flatMap((role) =>
    role.role === 'modifier'
      && role.modifierGroupId !== undefined
      && trigger.has(role.key)
      ? [role.modifierGroupId]
      : []));
}

export function samePhysicalTriggerSelector(
  selector: TriggerActivationSelector,
  group: TriggerActivationGroup,
): boolean {
  if (selector.triggerKeys === undefined) return false;
  const left = canonicalTriggerKeys(selector.triggerKeys);
  const right = canonicalTriggerKeys(group.triggerKeys);
  if (left.length !== right.length || left.some((key, index) => key !== right[index])) return false;
  if (selector.modifierGroupIds === undefined) return true;
  const leftGroups = canonicalModifierGroupIds(selector.modifierGroupIds);
  const rightGroups = canonicalModifierGroupIds(group.modifierGroupIds);
  return leftGroups.length === rightGroups.length
    && leftGroups.every((groupId, index) => groupId === rightGroups[index]);
}

export function sameModifierGroupSelector(
  selector: TriggerActivationSelector,
  groupIds: readonly string[],
): boolean {
  if (selector.triggerKeys !== undefined || selector.modifierGroupIds === undefined) return false;
  const left = canonicalModifierGroupIds(selector.modifierGroupIds);
  const right = canonicalModifierGroupIds(groupIds);
  return left.length === right.length && left.every((groupId, index) => groupId === right[index]);
}

export function triggerActivationGroups(layout: Layout): TriggerActivationGroup[] {
  const groups = new Map<string, TriggerActivationGroup>();
  for (const alternatives of layout.canonicalInputs.values()) {
    for (const alternative of alternatives) {
      for (const realization of alternative.baseRealizations) {
        if (realization.input.classifications.includes('composition')) continue;
        const candidates = [
          {
            triggerKeys: realization.defaultTriggerKeys ?? [],
            outputKeys: realization.defaultOutputKeys,
          },
          ...(realization.alternateParticipations?.map((view) => ({
            triggerKeys: view.triggerKeys,
            outputKeys: view.outputKeys,
          })) ?? []),
        ];
        for (const candidate of candidates) {
          const triggerKeys = canonicalTriggerKeys(candidate.triggerKeys);
          if (triggerKeys.length === 0 || candidate.outputKeys.length === 0) continue;
          const modifierGroupIds = modifierGroupIdsForTriggerKeys(realization.input, triggerKeys);
          const activationClass = classifyTriggerActivation(
            realization.input,
            triggerKeys,
            candidate.outputKeys,
          );
          const identity = [
            modifierGroupIds.join('\u0000'),
            activationClass,
            triggerKeys.join('\u0000'),
          ].join('\u0001');
          if (groups.has(identity)) continue;
          const logicalLabel = modifierGroupIds.length > 0
            ? modifierGroupIds.join(' + ')
            : '未分類modifier';
          groups.set(identity, {
            modifierGroupIds,
            triggerKeys,
            label: `${logicalLabel}: ${triggerKeys.join(' + ')}`,
            activationClass,
          });
        }
      }
    }
  }
  return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label, 'ja'));
}

export function triggerActivationLogicalGroups(layout: Layout): TriggerActivationLogicalGroup[] {
  const byLogical = new Map<string, TriggerActivationGroup[]>();
  for (const group of triggerActivationGroups(layout)) {
    if (group.modifierGroupIds.length === 0) continue;
    const identity = group.modifierGroupIds.join('\u0000');
    const values = byLogical.get(identity) ?? [];
    values.push(group);
    byLogical.set(identity, values);
  }
  return [...byLogical.values()].map((groups) => ({
    modifierGroupIds: groups[0].modifierGroupIds,
    label: groups[0].modifierGroupIds.join(' + '),
    activationClasses: [...new Set(groups.map((group) => group.activationClass))],
    groups,
  })).sort((left, right) => left.label.localeCompare(right.label, 'ja'));
}
