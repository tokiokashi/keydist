import { resolveKeyId } from '../shapes/geometry.ts';
import { ActivationConflictError } from '../semantics/index.ts';
import { singleActionKeyChoicesOf, withCombos, type Layout } from '../layouts/types.ts';
import type { ComboSet, ComboSetEntry } from './combo-set.ts';

/**
 * コンボの組をSetupの配列へ重ねる（仕様 §4.3「利用者が定義したコンボ」）。
 * 重ね方は`withCombos`と同じで、キーの字はその配列でその字を1キー1アクションで出すキーへ解決する。
 */

/** コンボを計算から外した理由。 */
export type DroppedComboReason =
  /** キーの字が、配列で1キー1アクションとして出せない。 */
  | 'key-unresolved'
  /** 解決したキーが、配列で修飾や層のトリガーとして働く。 */
  | 'trigger-key'
  /** 解決したキーの組が、配列の既存の経路や組の中で前にあるコンボと同じで、出力だけが違う。 */
  | 'conflict';

export interface DroppedCombo {
  readonly combo: ComboSetEntry;
  readonly reason: DroppedComboReason;
}

export interface ComboSetOverlay {
  /** 重ねた後の配列。重ねるコンボが無ければ、渡した配列そのもの。 */
  readonly layout: Layout;
  /** 計算に入るコンボの数。 */
  readonly applied: number;
  readonly dropped: readonly DroppedCombo[];
}

const triggerKeysCache = new WeakMap<object, ReadonlySet<string>>();

/**
 * 配列のsemanticが、修飾や層のトリガーとして使うと定めるキー。
 * `KeyRole`の`modifier`に挙がるキーと、入力の既定のrealizationがトリガー側・押している間のキーに定めるキーを集める。
 * 配列が持つコンボ（`origin`が`combo`の経路）は、コンボを成立させるキーの集合なので数えない。
 */
export function layoutTriggerKeys(layout: Pick<Layout, 'canonicalInputs'>): ReadonlySet<string> {
  const cached = triggerKeysCache.get(layout.canonicalInputs);
  if (cached !== undefined) return cached;
  const keys = new Set<string>();
  for (const alternatives of layout.canonicalInputs.values()) {
    for (const alternative of alternatives) {
      if (alternative.origin === 'combo') continue;
      for (const input of alternative.semanticInputs) {
        for (const role of input.roles) {
          if (role.role === 'modifier') keys.add(resolveKeyId(role.key));
        }
      }
      for (const realization of alternative.baseRealizations) {
        for (const key of [...(realization.defaultTriggerKeys ?? []), ...(realization.defaultHoldKeys ?? [])]) keys.add(resolveKeyId(key));
        for (const view of realization.alternateParticipations ?? []) {
          for (const key of [...view.triggerKeys, ...(view.holdKeys ?? [])]) keys.add(resolveKeyId(key));
        }
      }
    }
  }
  triggerKeysCache.set(layout.canonicalInputs, keys);
  return keys;
}

/** 1件のコンボを計算から外すか。外す時は理由を返す。 */
function dropReason(layout: Layout, combo: ComboSetEntry, triggerKeys: ReadonlySet<string>): DroppedComboReason | undefined {
  const choices = combo.keys.map((key) => singleActionKeyChoicesOf(layout, key));
  if (choices.some((keyChoices) => keyChoices.length === 0)) return 'key-unresolved';
  if (choices.some((keyChoices) => keyChoices.some((choice) => triggerKeys.has(choice.key)))) return 'trigger-key';
  return undefined;
}

/**
 * コンボの組を配列へ重ねる。外すコンボと外した理由も返す。
 * 配列の識別子と名前は変えない。コンボは`romajiOnly`で、かなをローマ字へ展開した綴りの区間だけで成立する。
 */
export function applyComboSet(layout: Layout, comboSet: ComboSet): ComboSetOverlay {
  const triggerKeys = layoutTriggerKeys(layout);
  const dropped: DroppedCombo[] = [];
  let current = layout;
  let applied = 0;
  for (const combo of comboSet.combos) {
    const reason = dropReason(layout, combo, triggerKeys);
    if (reason !== undefined) {
      dropped.push({ combo, reason });
      continue;
    }
    // 1件ずつ重ね、同じキーの組に別の出力を割り当てて経路が衝突するコンボだけを外す
    try {
      current = withCombos(layout.id, layout.name, current, [[combo.output, [...combo.keys], { romajiOnly: true }]]);
      applied += 1;
    } catch (error) {
      if (!(error instanceof ActivationConflictError)) throw error;
      dropped.push({ combo, reason: 'conflict' });
    }
  }
  return { layout: current, applied, dropped };
}
