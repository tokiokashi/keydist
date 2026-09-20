import { resolveKeyId } from '../../geometry.ts';
import type {
  BaseActionRealization,
  BaseActionRealizationSequence,
  BaseParticipationView,
  InputAlternative,
  PhysicalKeyId,
  SemanticInput,
} from './types.ts';

export interface SemanticInputAction {
  readonly keys: readonly PhysicalKeyId[];
  readonly input: SemanticInput;
  readonly outputKeys: readonly PhysicalKeyId[];
  readonly triggerKeys: readonly PhysicalKeyId[];
}

/**
 * BaseActionRealizationの境界invariantを検証する。
 *
 * - realization / actionは非空
 * - action keyはinput.physicalKeysのsubset
 * - input.physicalKeysをrealization全体で過不足なく1回ずつcover
 * - alias解決後に同一physical keyへ衝突する重複をreject
 * - defaultOutputKeysは非空・physicalKeys subset
 * - defaultTriggerKeysは指定時non-empty・physicalKeys subset
 * - output / triggerは重複可
 * - defaultHoldKeysは非空・defaultTriggerKeys subset・while-held Capabilityとexact match
 */
export function validateBaseActionRealization(
  realization: BaseActionRealization,
): void {
  if (realization.actions.length === 0) {
    throw new Error('BaseActionRealizationは1 action以上必要');
  }

  const physicalKeys = realization.input.physicalKeys.map(resolveKeyId);
  const physicalKeySet = new Set(physicalKeys);
  const seen = new Set<PhysicalKeyId>();

  for (const [actionIndex, action] of realization.actions.entries()) {
    if (action.length === 0) {
      throw new Error(`BaseActionRealizationのaction ${actionIndex} は1 key以上必要`);
    }

    const actionSeen = new Set<PhysicalKeyId>();
    for (const rawKey of action) {
      const key = resolveKeyId(rawKey);
      if (!physicalKeySet.has(key)) {
        throw new Error(
          `BaseActionRealizationのkey「${rawKey}」がinput.physicalKeys外を参照している`,
        );
      }
      if (actionSeen.has(key) || seen.has(key)) {
        throw new Error(
          `BaseActionRealizationでphysical key「${key}」が重複している`,
        );
      }
      actionSeen.add(key);
      seen.add(key);
    }
  }

  const missing = physicalKeys.filter((key) => !seen.has(key));
  if (missing.length > 0) {
    throw new Error(
      `BaseActionRealizationがinput.physicalKeysを欠落している: ${missing.join(', ')}`,
    );
  }

  const validateParticipationKeys = (
    label: string,
    keys: readonly PhysicalKeyId[],
    allowEmpty: boolean,
  ): PhysicalKeyId[] => {
    if (!allowEmpty && keys.length === 0) {
      throw new Error(`BaseActionRealization.${label}は非空である必要がある`);
    }
    const normalized = keys.map(resolveKeyId);
    if (new Set(normalized).size !== normalized.length) {
      throw new Error(`BaseActionRealization.${label}にphysical key重複がある`);
    }
    if (normalized.some((key) => !physicalKeySet.has(key))) {
      throw new Error(
        `BaseActionRealization.${label}がinput.physicalKeys外を参照している`,
      );
    }
    return normalized;
  };

  const validateView = (
    label: string,
    view: BaseParticipationView,
  ): { triggerKeys: PhysicalKeyId[]; holdKeys?: PhysicalKeyId[] } => {
    validateParticipationKeys(
      `${label}.outputKeys`,
      view.outputKeys,
      false,
    );
    const triggerKeys = view.triggerKeys.length === 0
      ? []
      : validateParticipationKeys(
          `${label}.triggerKeys` as 'defaultTriggerKeys',
          view.triggerKeys,
          false,
        );
    if (view.holdKeys === undefined) return { triggerKeys };

    if (view.holdKeys.length === 0) {
      throw new Error(`BaseActionRealization.${label}.holdKeysは非空である必要がある`);
    }
    const holdKeys = view.holdKeys.map(resolveKeyId);
    if (new Set(holdKeys).size !== holdKeys.length) {
      throw new Error(`BaseActionRealization.${label}.holdKeysにphysical key重複がある`);
    }
    if (holdKeys.some((key) => !physicalKeySet.has(key))) {
      throw new Error(`BaseActionRealization.${label}.holdKeysがinput.physicalKeys外を参照している`);
    }
    if (holdKeys.some((key) => !triggerKeys.includes(key))) {
      throw new Error(
        `BaseActionRealization.${label}.holdKeysはtriggerKeysのsubsetである必要がある`,
      );
    }
    const matchesCapability = realization.input.capabilities.some((capability) => {
      if (capability.kind !== 'while-held') return false;
      const capabilityKeys = capability.keys.map(resolveKeyId);
      return capabilityKeys.length === holdKeys.length
        && capabilityKeys.every((key) => holdKeys.includes(key));
    });
    if (!matchesCapability) {
      throw new Error(
        `BaseActionRealization.${label}.holdKeysはwhile-held Capabilityと一致する必要がある`,
      );
    }
    const containedInOneAction = realization.actions.some((action) => {
      const actionKeys = action.map(resolveKeyId);
      return holdKeys.every((key) => actionKeys.includes(key));
    });
    if (!containedInOneAction) {
      throw new Error(
        `BaseActionRealization.${label}.holdKeysはdefault realization上の1 actionに収まる必要がある`,
      );
    }
    return { triggerKeys, holdKeys };
  };

  validateParticipationKeys('defaultOutputKeys', realization.defaultOutputKeys, false);
  const defaultTriggerKeys = realization.defaultTriggerKeys === undefined
    ? []
    : validateParticipationKeys('defaultTriggerKeys', realization.defaultTriggerKeys, false);

  if (realization.defaultHoldKeys !== undefined) {
    if (realization.defaultHoldKeys.length === 0) {
      throw new Error('BaseActionRealization.defaultHoldKeysは非空である必要がある');
    }
    const normalized = realization.defaultHoldKeys.map(resolveKeyId);
    if (new Set(normalized).size !== normalized.length) {
      throw new Error('BaseActionRealization.defaultHoldKeysにphysical key重複がある');
    }
    if (normalized.some((key) => !physicalKeySet.has(key))) {
      throw new Error('BaseActionRealization.defaultHoldKeysがinput.physicalKeys外を参照している');
    }
    if (normalized.some((key) => !defaultTriggerKeys.includes(key))) {
      throw new Error(
        'BaseActionRealization.defaultHoldKeysはdefaultTriggerKeysのsubsetである必要がある',
      );
    }
    const matchesCapability = realization.input.capabilities.some((capability) => {
      if (capability.kind !== 'while-held') return false;
      const capabilityKeys = capability.keys.map(resolveKeyId);
      return capabilityKeys.length === normalized.length
        && capabilityKeys.every((key) => normalized.includes(key));
    });
    if (!matchesCapability) {
      throw new Error(
        'BaseActionRealization.defaultHoldKeysはwhile-held Capabilityと一致する必要がある',
      );
    }
    const containedInOneAction = realization.actions.some((action) => {
      const actionKeys = action.map(resolveKeyId);
      return normalized.every((key) => actionKeys.includes(key));
    });
    if (!containedInOneAction) {
      throw new Error(
        'BaseActionRealization.defaultHoldKeysはdefault realization上の1 actionに収まる必要がある',
      );
    }
  }

  const seenHoldGroups = new Set<string>();
  if (realization.defaultHoldKeys !== undefined) {
    seenHoldGroups.add([...realization.defaultHoldKeys.map(resolveKeyId)].sort().join('\u0000'));
  }
  for (const [index, view] of (realization.alternateParticipations ?? []).entries()) {
    const validated = validateView(`alternateParticipations[${index}]`, view);
    if (validated.holdKeys === undefined) continue;
    const signature = [...validated.holdKeys].sort().join('\u0000');
    if (seenHoldGroups.has(signature)) {
      throw new Error(
        'BaseActionRealizationのparticipation viewでhold groupが重複している',
      );
    }
    seenHoldGroups.add(signature);
  }
}

export function validateBaseActionRealizations(
  sequence: BaseActionRealizationSequence,
): void {
  for (const realization of sequence) validateBaseActionRealization(realization);
}

/**
 * authoring sourceが明示したBaseActionRealizationをflat action streamへ展開する。
 *
 * Requirementからaction groupingを推測しない。
 * combined / separate等のpolicy変換は後段ActionRealizationPolicyの責務。
 */
export function flattenBaseActionRealizations(
  sequence: BaseActionRealizationSequence,
): readonly SemanticInputAction[] {
  validateBaseActionRealizations(sequence);
  return sequence.flatMap((realization) => {
    const outputs = new Set(realization.defaultOutputKeys.map(resolveKeyId));
    const triggers = new Set((realization.defaultTriggerKeys ?? []).map(resolveKeyId));
    return realization.actions.map((keys) => {
      const canonical = keys.map(resolveKeyId);
      return {
        keys: canonical,
        input: realization.input,
        outputKeys: canonical.filter((key) => outputs.has(key)),
        triggerKeys: canonical.filter((key) => triggers.has(key)),
      };
    });
  });
}


/**
 * 具体canonical pathのphysical key参照を同じ写像で置換する。
 *
 * authoring-timeの派生path生成用。FaceMembershipはauthoring provenanceなので
 * runtime/physical key変換では書き換えない。
 */
export function mapInputAlternativePhysicalKeys(
  alternative: InputAlternative,
  mapKey: (key: PhysicalKeyId) => PhysicalKeyId,
): InputAlternative {
  const mappedInputs = new Map<SemanticInput, SemanticInput>();
  const mapKeys = (keys: readonly PhysicalKeyId[]) =>
    keys.map((key) => mapKey(resolveKeyId(key)));

  const mapInput = (input: SemanticInput): SemanticInput => {
    const existing = mappedInputs.get(input);
    if (existing) return existing;
    const mapped: SemanticInput = {
      ...input,
      physicalKeys: mapKeys(input.physicalKeys),
      requirements: input.requirements.map((requirement) =>
        requirement.kind === 'overlap'
          ? { ...requirement, keys: mapKeys(requirement.keys) }
          : {
              ...requirement,
              before: mapKeys(requirement.before),
              after: mapKeys(requirement.after),
            }),
      capabilities: input.capabilities.map((capability) => ({
        ...capability,
        keys: mapKeys(capability.keys),
      })),
      roles: input.roles.map((role) => ({
        ...role,
        key: mapKey(resolveKeyId(role.key)),
      })),
      // presentation provenanceはauthoring sourceのまま保持する。
      faceMemberships: input.faceMemberships,
    };
    mappedInputs.set(input, mapped);
    return mapped;
  };

  const semanticInputs = alternative.semanticInputs.map(mapInput);
  const baseRealizations = alternative.baseRealizations.map((realization) => {
    const mapped: BaseActionRealization = {
      ...realization,
      input: mapInput(realization.input),
      actions: realization.actions.map(mapKeys),
      defaultOutputKeys: mapKeys(realization.defaultOutputKeys),
      ...(realization.defaultTriggerKeys === undefined
        ? {}
        : { defaultTriggerKeys: mapKeys(realization.defaultTriggerKeys) }),
      ...(realization.defaultHoldKeys === undefined
        ? {}
        : { defaultHoldKeys: mapKeys(realization.defaultHoldKeys) }),
      ...(realization.alternateParticipations === undefined
        ? {}
        : {
            alternateParticipations: realization.alternateParticipations.map((view) => ({
              outputKeys: mapKeys(view.outputKeys),
              triggerKeys: mapKeys(view.triggerKeys),
              ...(view.holdKeys === undefined ? {} : { holdKeys: mapKeys(view.holdKeys) }),
            })),
          }),
    };
    validateBaseActionRealization(mapped);
    return mapped;
  });

  return {
    semanticInputs,
    baseRealizations,
    contextRequirements: alternative.contextRequirements,
  };
}
