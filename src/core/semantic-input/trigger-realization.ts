import { resolveKeyId } from '../../geometry.ts';
import { validateBaseActionRealization } from './realization.ts';
import type {
  BaseActionRealization,
  BaseActionRealizationSequence,
  PhysicalKeyId,
  SemanticInput,
} from './types.ts';

export interface TriggerRealizationPolicy {
  /** while-held Capabilityを実際の連続保持として使う。 */
  readonly useHold: boolean;
}

export const DEFAULT_TRIGGER_REALIZATION_POLICY: TriggerRealizationPolicy = {
  useHold: false,
};

export interface TriggerHoldState {
  readonly keys: readonly PhysicalKeyId[];
}

export type TriggerHoldPhase = 'start' | 'continue';

export interface RealizedSemanticAction {
  /** 今回新たに物理Pressするkey。active hold中のkeyは含まない。 */
  readonly keys: readonly PhysicalKeyId[];
  readonly input: SemanticInput;
  /** このaction時点で保持中のkey。 */
  readonly heldKeys: readonly PhysicalKeyId[];
  readonly holdPhase?: TriggerHoldPhase;
}

export interface TriggerRealizationResult {
  readonly actions: readonly RealizedSemanticAction[];
  readonly holdState?: TriggerHoldState;
}

const canonicalKeys = (keys: readonly PhysicalKeyId[]): PhysicalKeyId[] =>
  keys.map(resolveKeyId);

const sameKeys = (
  left: readonly PhysicalKeyId[],
  right: readonly PhysicalKeyId[],
): boolean => {
  const l = canonicalKeys(left);
  const r = canonicalKeys(right);
  if (l.length !== r.length) return false;
  const set = new Set(l);
  return r.every((key) => set.has(key));
};

const acceptsHoldGroup = (
  input: SemanticInput,
  keys: readonly PhysicalKeyId[],
): boolean => input.capabilities.some((capability) =>
  capability.kind === 'while-held' && sameKeys(capability.keys, keys));

const withoutHeldKeys = (
  action: readonly PhysicalKeyId[],
  heldKeys: readonly PhysicalKeyId[],
): PhysicalKeyId[] => {
  const held = new Set(canonicalKeys(heldKeys));
  return canonicalKeys(action).filter((key) => !held.has(key));
};

const wouldEraseFreshOutputEvent = (
  realization: BaseActionRealization,
  heldKeys: readonly PhysicalKeyId[],
): boolean => realization.input.output !== ''
  && realization.actions.every((action) => withoutHeldKeys(action, heldKeys).length === 0);

const startActionIndex = (
  realization: BaseActionRealization,
  holdKeys: readonly PhysicalKeyId[],
): number => {
  const hold = canonicalKeys(holdKeys);
  return realization.actions.findIndex((action) => {
    const actionKeys = canonicalKeys(action);
    return hold.every((key) => actionKeys.includes(key));
  });
};

function realizeOne(
  realization: BaseActionRealization,
  policy: TriggerRealizationPolicy,
  previous: TriggerHoldState | undefined,
): TriggerRealizationResult {
  validateBaseActionRealization(realization);

  if (!policy.useHold) {
    return {
      actions: realization.actions.map((keys) => ({
        keys: canonicalKeys(keys),
        input: realization.input,
        heldKeys: [],
      })),
    };
  }

  const canContinue = previous !== undefined
    && acceptsHoldGroup(realization.input, previous.keys)
    && !wouldEraseFreshOutputEvent(realization, previous.keys);

  if (canContinue) {
    const actions = realization.actions.flatMap((baseAction): RealizedSemanticAction[] => {
      const keys = withoutHeldKeys(baseAction, previous.keys);
      if (keys.length === 0) return [];
      return [{
        keys,
        input: realization.input,
        heldKeys: canonicalKeys(previous.keys),
        holdPhase: 'continue',
      }];
    });
    return {
      actions,
      holdState: previous,
    };
  }

  const defaultHoldKeys = realization.defaultHoldKeys;
  if (defaultHoldKeys === undefined) {
    return {
      actions: realization.actions.map((keys) => ({
        keys: canonicalKeys(keys),
        input: realization.input,
        heldKeys: [],
      })),
    };
  }

  const holdKeys = canonicalKeys(defaultHoldKeys);
  const startAt = startActionIndex(realization, holdKeys);
  if (startAt < 0) {
    throw new Error('BaseActionRealization.defaultHoldKeysを含むactionが見つからない');
  }

  const actions = realization.actions.map((keys, index): RealizedSemanticAction => {
    if (index < startAt) {
      return {
        keys: canonicalKeys(keys),
        input: realization.input,
        heldKeys: [],
      };
    }
    return {
      keys: canonicalKeys(keys),
      input: realization.input,
      heldKeys: holdKeys,
      holdPhase: index === startAt ? 'start' : 'continue',
    };
  });
  return {
    actions,
    holdState: { keys: holdKeys },
  };
}

/**
 * ordered BaseActionRealization列へTriggerRealizationPolicyを適用する。
 *
 * release/end専用actionは生成しない。current inputがactive hold groupを受理しない
 * 境界で前holdは終了したものとして扱う。
 */
export function realizeTriggerActions(
  sequence: BaseActionRealizationSequence,
  policy: TriggerRealizationPolicy,
  previous?: TriggerHoldState,
): TriggerRealizationResult {
  const actions: RealizedSemanticAction[] = [];
  let holdState = previous;

  for (const realization of sequence) {
    const result = realizeOne(realization, policy, holdState);
    actions.push(...result.actions);
    holdState = result.holdState;
  }

  return {
    actions,
    ...(holdState === undefined ? {} : { holdState }),
  };
}
