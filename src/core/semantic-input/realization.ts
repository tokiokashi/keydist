import type {
  BaseActionRealizationSequence,
  PhysicalKeyId,
  SemanticInput,
} from './types.ts';

export interface SemanticInputAction {
  readonly keys: readonly PhysicalKeyId[];
  readonly input: SemanticInput;
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
  return sequence.flatMap((realization) =>
    realization.actions.map((keys) => ({
      keys: [...keys],
      input: realization.input,
    })),
  );
}
