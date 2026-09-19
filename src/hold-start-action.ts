import type { Stroke } from './evaluate.ts';

export interface HoldStartActionPolicy {
  /**
   * simultaneous hold開始をoutputと同じStrokeの1 actionとして扱うか、
   * 追加の独立actionとして数えるか。
   */
  countAsSeparateStep: boolean;
}

export const DEFAULT_HOLD_START_ACTION_POLICY: HoldStartActionPolicy = {
  countAsSeparateStep: false,
};

export function sameHoldStartActionPolicy(
  left: HoldStartActionPolicy,
  right: HoldStartActionPolicy,
): boolean {
  return left.countAsSeparateStep === right.countAsSeparateStep;
}

function hasOutput(stroke: Stroke): boolean {
  return stroke.participations.some((participation) => participation.roles.includes('output'));
}

function hasHeldTriggerStart(stroke: Stroke): boolean {
  return stroke.participations.some((participation) =>
    participation.roles.includes('held-trigger') && participation.holdPhase === 'start');
}

/** Policy上、同一physical Stroke内のhold開始を独立actionとして扱うStrokeか。 */
export function hasSeparateHoldStartAction(
  stroke: Stroke,
  policy: HoldStartActionPolicy = DEFAULT_HOLD_START_ACTION_POLICY,
): boolean {
  return policy.countAsSeparateStep
    && stroke.inputRole !== 'composition'
    && hasOutput(stroke)
    && hasHeldTriggerStart(stroke);
}

/**
 * #220 の計上Policy。
 *
 * prefix等のtrigger-only Strokeは既に物理的な独立Strokeなので追加しない。
 * compositionは#220の対象外。
 * layer/modifierのoutputと同一Strokeにrealizeされた held-trigger/start だけを+1 action候補にする。
 * realized Stroke列自体は変更せず、構造解析・距離へ評価都合を逆流させない。\n * 再生Timingだけは同じPolicyを可視化するためvirtual actionとして反映してよい。
 */
export function additionalHoldStartSteps(
  strokes: readonly Stroke[],
  policy: HoldStartActionPolicy = DEFAULT_HOLD_START_ACTION_POLICY,
): number {
  if (!policy.countAsSeparateStep) return 0;
  return strokes.reduce(
    (count, stroke) => count + (hasSeparateHoldStartAction(stroke, policy) ? 1 : 0),
    0,
  );
}
