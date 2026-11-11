import { applyComboSet, type DroppedCombo } from '#input/combo-set/overlay.ts';
import type { ComboSet } from '#input/combo-set/combo-set.ts';
import type { LayoutKind } from '#input/layouts/kind.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { Setup } from '#input/setup/index.ts';

/**
 * Setupが選んだコンボの組を、Setupの配列へ重ねる（仕様 §4.3「利用者が定義したコンボ」）。
 * 計算（`resolveEngineInput`）とSetupの画面が同じ判定を使い、画面に出す状態と計算に入るコンボを食い違わせない。
 */

export type SetupComboSetStatus =
  /** 組を選んでいない。配列のコンボだけで測る。 */
  | { readonly kind: 'none' }
  /** 選んだ組が手持ちに無い。組を重ねずに測る。 */
  | { readonly kind: 'missing'; readonly comboSetId: string }
  /** かな配列はローマ字を経ないので、組を重ねずに測る。 */
  | { readonly kind: 'kana-layout'; readonly comboSet: ComboSet }
  | {
      readonly kind: 'applied';
      readonly comboSet: ComboSet;
      /** 計算に入るコンボの数。 */
      readonly applied: number;
      /** 計算から外したコンボと理由。 */
      readonly dropped: readonly DroppedCombo[];
    };

export interface SetupComboSetOverlay {
  readonly layout: Layout;
  readonly status: SetupComboSetStatus;
}

/** Setupの配列に、選んだ組を重ねる。重ねない時（組が無い・かな配列）は、渡した配列をそのまま返す。 */
export function overlaySetupComboSet(
  setup: Pick<Setup, 'comboSetId'> | undefined,
  layout: Layout,
  kind: LayoutKind,
  comboSets: ReadonlyMap<string, ComboSet> | undefined,
): SetupComboSetOverlay {
  const comboSetId = setup?.comboSetId;
  if (comboSetId === undefined) return { layout, status: { kind: 'none' } };
  const comboSet = comboSets?.get(comboSetId);
  if (comboSet === undefined) return { layout, status: { kind: 'missing', comboSetId } };
  if (kind === 'kana') return { layout, status: { kind: 'kana-layout', comboSet } };
  const overlay = applyComboSet(layout, comboSet);
  return { layout: overlay.layout, status: { kind: 'applied', comboSet, applied: overlay.applied, dropped: overlay.dropped } };
}

/**
 * Setupの実効のローマ字規則が、組の基準の綴りと違うか。ローマ字規則が使われない打ち方（`effectiveRuleId`が`null`）では、違いを問わない。
 * 違う時は、組の出力が別の綴りで展開されているので、組を作り直す必要がある。
 */
export function comboSetSpellingDiffers(comboSet: Pick<ComboSet, 'romajiRuleId'>, effectiveRuleId: string | null): boolean {
  return effectiveRuleId !== null && effectiveRuleId !== comboSet.romajiRuleId;
}
