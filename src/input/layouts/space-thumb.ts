import { THUMB_KEY, resolveKeyId } from '../shapes/geometry.ts';
import type { InputAlternative } from '#input/semantics/index.ts';
import type { Layout } from './types.ts';

const eligibility = new WeakMap<Layout, boolean>();

/** 右親指キーの単打（トリガーを伴わない1キーの押下）か。 */
export function isLoneRightThumbPress(alternative: InputAlternative): boolean {
  if (alternative.baseRealizations.length !== 1) return false;
  const [realization] = alternative.baseRealizations;
  if ((realization.defaultTriggerKeys ?? []).length > 0) return false;
  if (realization.actions.length !== 1) return false;
  const [step] = realization.actions;
  return step.length === 1 && resolveKeyId(step[0]) === THUMB_KEY.RT;
}

/**
 * 空白を左親指でも押せる配列か。空白を右親指の単打で打ち、左親指キーをどの入力にも使わない配列だけが当たる。
 * 左親指キーに別の文字や切り替えがある配列で左親指を空白に使うと、同じ押下が2つの意味を持つためである。
 */
export function canTypeSpaceWithLeftThumb(layout: Pick<Layout, 'canonicalInputs'>): boolean {
  const cached = eligibility.get(layout as Layout);
  if (cached !== undefined) return cached;
  const result = computeEligibility(layout);
  eligibility.set(layout as Layout, result);
  return result;
}

function computeEligibility(layout: Pick<Layout, 'canonicalInputs'>): boolean {
  const space = layout.canonicalInputs.get(' ') ?? [];
  if (!space.some(isLoneRightThumbPress)) return false;
  for (const alternatives of layout.canonicalInputs.values()) {
    for (const alternative of alternatives) {
      for (const input of alternative.semanticInputs) {
        if (input.physicalKeys.some((key) => resolveKeyId(key) === THUMB_KEY.LT)) return false;
      }
      for (const realization of alternative.baseRealizations) {
        if (realization.actions.some((step) => step.some((key) => resolveKeyId(key) === THUMB_KEY.LT))) return false;
      }
    }
  }
  return true;
}
