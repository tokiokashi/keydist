import type { PhysicalKeyId, SemanticInput, SemanticInputSequence } from './types.ts';

export interface SemanticInputAction {
  readonly keys: readonly PhysicalKeyId[];
  readonly input: SemanticInput;
}

class DisjointSet {
  private readonly parent = new Map<PhysicalKeyId, PhysicalKeyId>();

  constructor(keys: readonly PhysicalKeyId[]) {
    for (const key of keys) this.parent.set(key, key);
  }

  find(key: PhysicalKeyId): PhysicalKeyId {
    const parent = this.parent.get(key);
    if (parent === undefined) throw new Error(`unknown PhysicalKeyId: ${key}`);
    if (parent === key) return key;
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }

  union(left: PhysicalKeyId, right: PhysicalKeyId): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    // canonical physicalKeysは既に決定的にsort済みなので、
    // rootも文字列順で固定してauthoring順へ依存させない。
    if (leftRoot < rightRoot) this.parent.set(rightRoot, leftRoot);
    else this.parent.set(leftRoot, rightRoot);
  }
}

function overlapComponents(input: SemanticInput): Map<PhysicalKeyId, PhysicalKeyId> {
  const sets = new DisjointSet(input.physicalKeys);

  for (const requirement of input.requirements) {
    if (requirement.kind !== 'overlap' || requirement.keys.length < 2) continue;
    const [first, ...rest] = requirement.keys;
    for (const key of rest) sets.union(first, key);
  }

  return new Map(input.physicalKeys.map((key) => [key, sets.find(key)]));
}

/**
 * 1 SemanticInputを、hold等を適用する前のbase physical action列へ展開する。
 *
 * overlap componentは同一actionへまとめ、component間orderをtopological levelへ展開する。
 * overlap component内部のorder（SandS等）は同一action内のkeydown順なのでsplitしない。
 */
export function planSemanticInputActions(input: SemanticInput): readonly SemanticInputAction[] {
  if (input.physicalKeys.length === 0) {
    throw new Error('SemanticInputは1 key以上のphysicalKeysを必要とする');
  }

  const componentByKey = overlapComponents(input);
  const roots = [...new Set(componentByKey.values())];
  const outgoing = new Map<PhysicalKeyId, Set<PhysicalKeyId>>(
    roots.map((root) => [root, new Set()]),
  );
  const indegree = new Map<PhysicalKeyId, number>(
    roots.map((root) => [root, 0]),
  );

  for (const requirement of input.requirements) {
    if (requirement.kind !== 'order') continue;
    for (const before of requirement.before) {
      for (const after of requirement.after) {
        const from = componentByKey.get(before);
        const to = componentByKey.get(after);
        if (from === undefined || to === undefined) {
          throw new Error('order RequirementがphysicalKeys外のkeyを参照している');
        }
        if (from === to) continue;
        const targets = outgoing.get(from)!;
        if (targets.has(to)) continue;
        targets.add(to);
        indegree.set(to, (indegree.get(to) ?? 0) + 1);
      }
    }
  }

  const remaining = new Set(roots);
  const actions: SemanticInputAction[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining].filter((root) => (indegree.get(root) ?? 0) === 0);
    if (ready.length === 0) {
      throw new Error('SemanticInputのorder Requirementが循環している');
    }

    const readySet = new Set(ready);
    const keys = input.physicalKeys.filter((key) => readySet.has(componentByKey.get(key)!));
    actions.push({ keys, input });

    for (const root of ready) {
      remaining.delete(root);
      for (const next of outgoing.get(root) ?? []) {
        indegree.set(next, (indegree.get(next) ?? 0) - 1);
      }
    }
  }

  return actions;
}

/** ordered SemanticInput列をbase physical action列へflattenする。 */
export function planSemanticInputSequenceActions(
  sequence: SemanticInputSequence,
): readonly SemanticInputAction[] {
  return sequence.flatMap((input) => planSemanticInputActions(input));
}
