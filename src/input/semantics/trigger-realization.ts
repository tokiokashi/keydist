import { resolveKeyId } from '../shapes/geometry.ts';
import { validateBaseActionRealization } from './realization.ts';
import type {
  BaseActionRealization,
  BaseActionRealizationSequence,
  BaseParticipationView,
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

export function sameTriggerRealizationPolicy(
  left: TriggerRealizationPolicy,
  right: TriggerRealizationPolicy,
): boolean {
  return left.useHold === right.useHold;
}

export interface TriggerHoldState {
  readonly keys: readonly PhysicalKeyId[];
}

export type TriggerHoldPhase = 'start' | 'continue';

export interface RealizedSemanticAction {
  /** 今回新たに物理Pressするkey。active hold中のkeyは含まない。 */
  readonly keys: readonly PhysicalKeyId[];
  readonly input: SemanticInput;
  /** 今回の新規Pressのうちauthoring source上のoutput参加key。 */
  readonly outputKeys: readonly PhysicalKeyId[];
  /** 今回の新規Pressのうちauthoring source上のtrigger参加key。 */
  readonly triggerKeys: readonly PhysicalKeyId[];
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

/**
 * active hold keyはcurrent inputのfresh keyより前からdownしている。
 *
 * order(before, after) に対して after側がheldなのに before側へfresh Pressが必要なら、
 * current inputでは before < after を満たせないためcontinue不可。
 *
 * held before + fresh after は成立可能。
 * held before + held after はhold開始時の成立順序を維持しているものとして許容する。
 */
const holdContinuationSatisfiesRequirements = (
  input: SemanticInput,
  heldKeys: readonly PhysicalKeyId[],
): boolean => {
  const held = new Set(canonicalKeys(heldKeys));

  return input.requirements.every((requirement) => {
    if (requirement.kind !== 'order') return true;

    const afterHasHeld = requirement.after
      .map(resolveKeyId)
      .some((key) => held.has(key));
    if (!afterHasHeld) return true;

    const beforeNeedsFreshPress = requirement.before
      .map(resolveKeyId)
      .some((key) => !held.has(key));
    return !beforeNeedsFreshPress;
  });
};

const withoutHeldKeys = (
  action: readonly PhysicalKeyId[],
  heldKeys: readonly PhysicalKeyId[],
): PhysicalKeyId[] => {
  const held = new Set(canonicalKeys(heldKeys));
  return canonicalKeys(action).filter((key) => !held.has(key));
};

const intersectKeys = (
  keys: readonly PhysicalKeyId[],
  selected: readonly PhysicalKeyId[] | undefined,
): PhysicalKeyId[] => {
  if (selected === undefined) return [];
  const set = new Set(canonicalKeys(selected));
  return canonicalKeys(keys).filter((key) => set.has(key));
};

const defaultParticipationView = (
  realization: BaseActionRealization,
): BaseParticipationView => ({
  outputKeys: realization.defaultOutputKeys,
  triggerKeys: realization.defaultTriggerKeys ?? [],
  ...(realization.defaultHoldKeys === undefined
    ? {}
    : { holdKeys: realization.defaultHoldKeys }),
});

const participationViewForHold = (
  realization: BaseActionRealization,
  heldKeys: readonly PhysicalKeyId[],
): BaseParticipationView | undefined => {
  const defaultView = defaultParticipationView(realization);
  if (defaultView.holdKeys !== undefined && sameKeys(defaultView.holdKeys, heldKeys)) {
    return defaultView;
  }
  return realization.alternateParticipations?.find(
    (view) => view.holdKeys !== undefined && sameKeys(view.holdKeys, heldKeys),
  );
};

const realizedAction = (
  realization: BaseActionRealization,
  participation: BaseParticipationView,
  baseKeys: readonly PhysicalKeyId[],
  keys: readonly PhysicalKeyId[],
  heldKeys: readonly PhysicalKeyId[],
  holdPhase?: TriggerHoldPhase,
): RealizedSemanticAction => {
  const pressed = new Set(canonicalKeys(keys));
  return {
    keys: canonicalKeys(keys),
    input: realization.input,
    outputKeys: intersectKeys(baseKeys, participation.outputKeys)
      .filter((key) => pressed.has(key)),
    triggerKeys: intersectKeys(baseKeys, participation.triggerKeys)
      .filter((key) => pressed.has(key)),
    heldKeys: canonicalKeys(heldKeys),
    ...(holdPhase === undefined ? {} : { holdPhase }),
  };
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

  const defaultView = defaultParticipationView(realization);

  if (!policy.useHold) {
    return {
      actions: realization.actions.map((keys) =>
        realizedAction(realization, defaultView, keys, keys, [])),
    };
  }

  const continuationView = previous === undefined
    ? undefined
    : participationViewForHold(realization, previous.keys);
  const canContinue = previous !== undefined
    && continuationView !== undefined
    && acceptsHoldGroup(realization.input, previous.keys)
    && holdContinuationSatisfiesRequirements(realization.input, previous.keys)
    && !wouldEraseFreshOutputEvent(realization, previous.keys);

  if (canContinue && continuationView !== undefined) {
    const actions = realization.actions.flatMap((baseAction): RealizedSemanticAction[] => {
      const keys = withoutHeldKeys(baseAction, previous.keys);
      if (keys.length === 0) return [];
      return [
        realizedAction(
          realization,
          continuationView,
          baseAction,
          keys,
          previous.keys,
          'continue',
        ),
      ];
    });
    return {
      actions,
      holdState: previous,
    };
  }

  const defaultHoldKeys = realization.defaultHoldKeys;
  if (defaultHoldKeys === undefined) {
    return {
      actions: realization.actions.map((keys) =>
        realizedAction(realization, defaultView, keys, keys, [])),
    };
  }

  const holdKeys = canonicalKeys(defaultHoldKeys);
  const startAt = startActionIndex(realization, holdKeys);
  if (startAt < 0) {
    throw new Error('BaseActionRealization.defaultHoldKeysを含むactionが見つからない');
  }

  const actions = realization.actions.map((keys, index): RealizedSemanticAction => {
    if (index < startAt) {
      return realizedAction(realization, defaultView, keys, keys, []);
    }
    return realizedAction(
      realization,
      defaultView,
      keys,
      keys,
      holdKeys,
      index === startAt ? 'start' : 'continue',
    );
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
