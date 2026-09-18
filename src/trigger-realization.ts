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

function unique(keys: readonly string[]): string[] {
  return [...new Set(keys)];
}

function sameKeys(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const set = new Set(left);
  return right.every((key) => set.has(key));
}

function overlaps(left: readonly string[], right: readonly string[]): boolean {
  const set = new Set(left);
  return right.some((key) => set.has(key));
}

function withoutTriggerKeys(
  stepKeys: readonly string[],
  triggerKeys: readonly string[],
): string[] {
  const triggers = new Set(triggerKeys);
  return stepKeys.filter((key) => !triggers.has(key));
}

/**
 * base semantic normalization後の1stepを、hold policyに従ってrealizeする。
 *
 * hold継続keyはlayerではなく、その対象入力へsemantic normalizationが付与した
 * associatedTriggerKeysの完全一致。prefix / suffixのstep順序から推測しない。
 *
 * release/end専用Strokeは作らない。現在stepのassociationがactive holdと一致しなければ
 * そのstepの直前で保持区間が終了したものとして扱う。
 */
export function realizeTriggerStep(
  stepKeys: readonly string[],
  semantic: StepSemantic,
  policy: TriggerRealizationPolicy,
  previous: TriggerHoldState | undefined,
): TriggerRealizationDecision {
  const declaredTriggers = unique(semantic.triggerKeys);
  const associatedTriggers = unique(semantic.associatedTriggerKeys ?? semantic.triggerKeys);
  const sameDeclaredSet = previous !== undefined
    && sameKeys(previous.triggerKeys, declaredTriggers);
  const sameAssociatedSet = previous !== undefined
    && associatedTriggers.length > 0
    && sameKeys(previous.triggerKeys, associatedTriggers);
  const outputOverlapsActiveHold = previous !== undefined
    && overlaps(previous.triggerKeys, semantic.outputKeys);

  const canActivateHold = policy.useHold
    && semantic.triggerPersistence === 'hold-capable'
    && declaredTriggers.length > 0;

  if (canActivateHold && sameDeclaredSet && !outputOverlapsActiveHold) {
    const physicalKeys = withoutTriggerKeys(stepKeys, declaredTriggers);
    return {
      holdState: previous,
      heldTriggerKeys: previous.triggerKeys,
      holdPhase: 'continue',
      triggerKeys: [],
      stepKeys: physicalKeys,
      omitStroke: physicalKeys.length === 0 && semantic.outputKeys.length === 0,
    };
  }

  if (canActivateHold) {
    // outputとtriggerが同じキーなら保持継続のまま再押下できないため、
    // 既存holdを終了し、このstepの新規Pressでholdをrestartする。
    const holdState = Object.freeze({
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

  if (
    policy.useHold
    && previous !== undefined
    && declaredTriggers.length === 0
    && semantic.associatedTriggerPersistence === 'hold-capable'
    && sameAssociatedSet
    && !outputOverlapsActiveHold
  ) {
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
