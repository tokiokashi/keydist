import { resolveKeyId } from '../shapes/geometry.ts';
import type { CanonicalInputMap, InputAlternative } from './types.ts';

/**
 * 確定の打鍵（仕様 §4.7）。単打で文字を出すキーが前置・後置のトリガーも兼ねる配列で、
 * 隣り合う2つの入力が1つの面の入力として読まれてしまう継ぎ目に、右親指の1打を入れる。
 * 継ぎ目の判定は面の定義（トリガーと出力キー）だけから決める。
 * 距離の測定（Trace）とTesterが同じ判定を使うので、層の下のinputに置く。
 */

/** 面の1打。1キーの打鍵ならそのキーのid、同時押し（2キー以上）の打鍵は規則の対象にしないので `null` */
export type FaceStroke = string | null;

/** 継ぎ目の規則。配列の面の定義から1回だけ作る。 */
export interface CommitStrokeRules {
  /** 後置トリガー → 後置トリガーより前の打鍵列（2打の面なら出力キー1つ、3打の面なら前置と出力キー）の候補 */
  readonly suffixHeads: ReadonlyMap<string, readonly (readonly string[])[]>;
  /** 前置トリガー → そのトリガーを前置に持つ面（2打の前置の面と3打の面）の出力キー */
  readonly prefixOutputs: ReadonlyMap<string, ReadonlySet<string>>;
}

const rulesCache = new WeakMap<CanonicalInputMap, CommitStrokeRules>();

/** 1打のキーから面の1打を作る。同時押しの打鍵は `null` にする。 */
export function faceStrokeOf(keys: readonly string[]): FaceStroke {
  const resolved = [...new Set(keys.map(resolveKeyId))];
  return resolved.length === 1 ? resolved[0] : null;
}

/** pathの全打鍵。同時押しの打鍵は `null` にする。 */
function strokesOf(alternative: InputAlternative): readonly FaceStroke[] {
  return alternative.baseRealizations.flatMap((realization) => realization.actions.map(faceStrokeOf));
}

/** `before` の末尾が `head` と一致するか。 */
function endsWith(before: readonly FaceStroke[], head: readonly string[]): boolean {
  if (before.length < head.length) return false;
  const tail = before.slice(before.length - head.length);
  return tail.every((stroke, index) => stroke === head[index]);
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
    if (heads.some((head) => endsWith(before, head))) return true;
  }

  // 前置の側: Aが前置トリガーの単打だけで、Bの最初の打鍵が、そのトリガーを前置に持つ面の出力キーと一致する
  if (before.length === 1 && before[0] !== null && after.length > 0 && after[0] !== null) {
    if (rules.prefixOutputs.get(before[0])?.has(after[0])) return true;
  }
  return false;
}

/**
 * 入力Aの打鍵列 `before` が、続くBによっては確定の打鍵が要る形か（仕様 §4.7）。
 * Bを知らずに、Aの側の条件だけで見る。Testerが、確定の打鍵として押された `thumb-r` を、文字を出さない確定として扱うかの判定に使う。
 */
export function mayNeedCommitStroke(rules: CommitStrokeRules, before: readonly FaceStroke[]): boolean {
  for (const heads of rules.suffixHeads.values()) {
    if (heads.some((head) => endsWith(before, head))) return true;
  }
  return before.length === 1 && before[0] !== null && rules.prefixOutputs.has(before[0]);
}

/** 規則が1つも無い（確定の打鍵が要る継ぎ目を持てない）配列か。 */
export function commitStrokeRulesEmpty(rules: CommitStrokeRules): boolean {
  return rules.suffixHeads.size === 0 && rules.prefixOutputs.size === 0;
}
