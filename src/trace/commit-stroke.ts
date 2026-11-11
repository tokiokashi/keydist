import type { Geometry, Key } from '#input/shapes/geometry.ts';
import { SINGLE_LAYER_ID } from '#input/layouts/types.ts';
import type { RealizedSemanticAction, SemanticInput } from '#input/semantics/index.ts';

/** 確定の打鍵の入力と、打つキー。継ぎ目の規則は `#input/semantics/commit-stroke.ts`（仕様 §4.7）。 */

/** 確定の打鍵が持つ入力の意味。出力もトリガーも持たず、単打の層に帰属する。 */
function commitSemanticInput(keyId: string): SemanticInput {
  return {
    output: '',
    physicalKeys: [keyId],
    requirements: [],
    capabilities: [],
    aggregationGroupId: SINGLE_LAYER_ID,
    classifications: [],
    roles: [],
    faceMemberships: [],
  };
}

/** 確定の打鍵を打つキー。右親指のホームの親指キーに固定する。 */
export function commitKeyOf(geometry: Geometry): Key {
  return geometry.thumbs.RT;
}

/** 確定の打鍵の1 action。 */
export function commitAction(key: Key): RealizedSemanticAction {
  return {
    keys: [key.id],
    input: commitSemanticInput(key.id),
    outputKeys: [],
    triggerKeys: [],
    heldKeys: [],
  };
}
