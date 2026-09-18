import type { HoldPhase, StepSemantic } from './layouts/types.ts';

export interface TriggerRealizationPolicy {
  /** hold-capable triggerを実際の連続保持として使う。既定falseはbase Strokeと互換。 */
  useHold: boolean;
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
  readonly layerId: string;
  readonly triggerKeys: readonly string[];
}

export interface TriggerRealizationDecision {
  readonly holdState?: TriggerHoldState;
  readonly heldTriggerKeys: readonly string[];
  readonly holdPhase?: HoldPhase;
  /** 今回新規に押すtrigger。continue時は空。 */
  readonly triggerKeys: readonly string[];
  /** base stepから今回物理的に押すキー。continueでは保持中triggerを除く。 */
  readonly stepKeys: readonly string[];
  /** trigger-onlyの再押下が保持に置換され、物理step自体が不要になった。 */
  readonly omitStroke: boolean;
  /** realized Strokeへ残すcapability。新規triggerが無いcontinueでは未指定。 */
  readonly triggerPersistence?: StepSemantic['triggerPersistence'];
}

function sameKeys(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const set = new Set(left);
  return right.every((key) => set.has(key));
}

function withoutHeldTriggerKeys(
  stepKeys: readonly string[],
  triggerKeys: readonly string[],
  outputKeys: readonly string[],
): string[] {
  const triggers = new Set(triggerKeys);
  const outputs = new Set(outputKeys);
  return stepKeys.filter((key) => !triggers.has(key) || outputs.has(key));
}

/**
 * base semantic normalization後の1stepを、hold policyに従ってrealizeする。
 *
 * release/end専用Strokeは作らない。hold区間は、別layerへ移る・single triggerへ移る・
 * trigger集合が変わる時点で終了し、次のStrokeにheld-triggerが無いこと自体をrelease境界とする。
 * これにより、将来の明示Press/Release event形式はここで固定しない。
 */
export function realizeTriggerStep(
  stepKeys: readonly string[],
  semantic: StepSemantic,
  layerId: string,
  policy: TriggerRealizationPolicy,
  previous: TriggerHoldState | undefined,
): TriggerRealizationDecision {
  const declaredTriggers = [...new Set(semantic.triggerKeys)];
  const canStartOrContinue = policy.useHold
    && semantic.triggerPersistence === 'hold-capable'
    && declaredTriggers.length > 0;

  const sameLayer = previous?.layerId === layerId;
  const sameTriggerSet = previous !== undefined && sameKeys(previous.triggerKeys, declaredTriggers);

  if (canStartOrContinue && sameLayer && sameTriggerSet) {
    const physicalKeys = withoutHeldTriggerKeys(
      stepKeys,
      declaredTriggers,
      semantic.outputKeys,
    );
    return {
      holdState: previous,
      heldTriggerKeys: previous.triggerKeys,
      holdPhase: 'continue',
      triggerKeys: [],
      stepKeys: physicalKeys,
      omitStroke: physicalKeys.length === 0 && semantic.outputKeys.length === 0,
    };
  }

  if (canStartOrContinue) {
    const holdState = Object.freeze({
      layerId,
      triggerKeys: Object.freeze([...declaredTriggers]),
    });
    return {
      holdState,
      heldTriggerKeys: holdState.triggerKeys,
      holdPhase: 'start',
      triggerKeys: declaredTriggers,
      stepKeys: [...stepKeys],
      omitStroke: false,
      triggerPersistence: semantic.triggerPersistence,
    };
  }

  if (policy.useHold && previous !== undefined && sameLayer && declaredTriggers.length === 0) {
    return {
      holdState: previous,
      heldTriggerKeys: previous.triggerKeys,
      holdPhase: 'continue',
      triggerKeys: [],
      stepKeys: [...stepKeys],
      omitStroke: false,
    };
  }

  return {
    heldTriggerKeys: [],
    triggerKeys: declaredTriggers,
    stepKeys: [...stepKeys],
    omitStroke: false,
    triggerPersistence: semantic.triggerPersistence,
  };
}
