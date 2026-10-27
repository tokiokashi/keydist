import { resolveKeyId, type Geometry, type Key } from '#input/shapes/geometry.ts';
import { SINGLE_LAYER_ID } from '#input/layouts/types.ts';
import type { CanonicalInputMap, InputAlternative, RealizedSemanticAction, SemanticInput } from '#input/semantics/index.ts';

/**
 * 確定の打鍵（仕様 §4.7）。単打で文字を出すキーが前置・後置のトリガーも兼ねる配列で、
 * 隣り合う2つの入力が1つの面の入力として読まれてしまう継ぎ目に、右親指の1打を入れる。
 * 継ぎ目の判定は面の定義（トリガーと出力キー）だけから決める。
 */

/** 面の1打。1キーの打鍵ならそのキーのid、同時押し（2キー以上）の打鍵は規則の対象にしないので `null` */
type FaceStroke = string | null;

/** 継ぎ目の規則。配列の面の定義から1回だけ作る。 */
export interface CommitStrokeRules {
  /** 後置トリガー → 後置トリガーより前の打鍵列（2打の面なら出力キー1つ、3打の面なら前置と出力キー）の候補 */
  readonly suffixHeads: ReadonlyMap<string, readonly (readonly string[])[]>;
  /** 前置トリガー → そのトリガーを前置に持つ面（2打の前置の面と3打の面）の出力キー */
  readonly prefixOutputs: ReadonlyMap<string, ReadonlySet<string>>;
}

const rulesCache = new WeakMap<CanonicalInputMap, CommitStrokeRules>();

/** pathの全打鍵。同時押しの打鍵は `null` にする。 */
function strokesOf(alternative: InputAlternative): readonly FaceStroke[] {
  return alternative.baseRealizations.flatMap((realization) =>
    realization.actions.map((keys): FaceStroke => {
      const resolved = [...new Set(keys.map(resolveKeyId))];
      return resolved.length === 1 ? resolved[0] : null;
    }),
  );
}

/**
 * 前置または後置のトリガーと出力キーを、1キーずつの順次打鍵で打つ面のpathから、規則を作る。
 * 面のpathは `origin='face'` で、triggerとoutputの役を持つ。`Sequence` で直接書いた配列は役を持たないので入らない。
 */
export function commitStrokeRulesOf(canonicalInputs: CanonicalInputMap): CommitStrokeRules {
  const cached = rulesCache.get(canonicalInputs);
  if (cached) return cached;

  const suffixHeads = new Map<string, string[][]>();
  const prefixOutputs = new Map<string, Set<string>>();
  for (const alternatives of canonicalInputs.values()) {
    for (const alternative of alternatives) {
      if (alternative.origin !== 'face' || alternative.baseRealizations.length !== 1) continue;
      const realization = alternative.baseRealizations[0];
      const strokes = strokesOf(alternative);
      if (strokes.some((stroke) => stroke === null) || realization.defaultOutputKeys.length !== 1) continue;
      const keys = strokes as string[];
      const output = resolveKeyId(realization.defaultOutputKeys[0]);
      const triggers = new Set((realization.defaultTriggerKeys ?? []).map(resolveKeyId));
      const outputAt = keys.indexOf(output);
      if (outputAt < 0 || triggers.has(output)) continue;
      const prefix = keys.slice(0, outputAt);
      const suffix = keys.slice(outputAt + 1);
      if (prefix.length + suffix.length === 0 || prefix.length > 1 || suffix.length > 1) continue;
      if (![...prefix, ...suffix].every((key) => triggers.has(key))) continue;

      if (prefix.length === 1) {
        const outputs = prefixOutputs.get(prefix[0]) ?? new Set<string>();
        outputs.add(output);
        prefixOutputs.set(prefix[0], outputs);
      }
      if (suffix.length === 1) {
        const heads = suffixHeads.get(suffix[0]) ?? [];
        const head = [...prefix, output];
        if (!heads.some((candidate) => candidate.length === head.length && candidate.every((key, index) => key === head[index]))) heads.push(head);
        suffixHeads.set(suffix[0], heads);
      }
    }
  }
  const rules = { suffixHeads, prefixOutputs };
  rulesCache.set(canonicalInputs, rules);
  return rules;
}

/**
 * 隣り合う入力 `previous`（A）と `next`（B）の間に確定の打鍵が要るか（仕様 §4.7）。
 * 呼び出し側は、AとBの間に打てずに飛ばした文字がある時は呼ばない。
 */
export function needsCommitStroke(rules: CommitStrokeRules, previous: InputAlternative, next: InputAlternative): boolean {
  const before = strokesOf(previous);
  const after = strokesOf(next);

  // 後置の側: Bが後置トリガーの単打だけで、Aの末尾が、そのトリガーを後置に持つ面の後置より前の打鍵列と一致する
  if (after.length === 1 && after[0] !== null) {
    const heads = rules.suffixHeads.get(after[0]) ?? [];
    for (const head of heads) {
      if (before.length < head.length) continue;
      const tail = before.slice(before.length - head.length);
      if (tail.every((stroke, index) => stroke === head[index])) return true;
    }
  }

  // 前置の側: Aが前置トリガーの単打だけで、Bの最初の打鍵が、そのトリガーを前置に持つ面の出力キーと一致する
  if (before.length === 1 && before[0] !== null && after.length > 0 && after[0] !== null) {
    if (rules.prefixOutputs.get(before[0])?.has(after[0])) return true;
  }
  return false;
}

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
