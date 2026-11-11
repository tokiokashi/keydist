import { LAYOUT_MISSING_REASON, MISSING_SETUP_NAME } from '#input/setup/index.ts';
import { isBuiltin, ROMAJI_RULES, type UserRomajiRule } from '#input/romaji/rules.ts';
import type { FingerAssignment } from '#input/shapes/geometry.ts';
import type { ComboSet } from '#input/combo-set/combo-set.ts';
import { buildUserCatalog } from '#input/layouts/user-catalog.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';

/** 一覧の1行。種類ごとの違いは`detail`の文に収め、行の形は配列も規則も同じにする。 */
export interface UserAssetRow {
  readonly id: string;
  readonly name: string;
  /** 名前の下に出す補足。 */
  readonly detail: string | undefined;
}

/**
 * 自作の配列の行。補足は、推奨のローマ字規則（見つからなければ全体の値の規則で打つ旨）。
 * 計算に使えない配列は、推奨の規則の代わりに使えない理由を出す。
 */
export function userLayoutRows(userLayouts: readonly UserLayout[], userRomajiRules: readonly UserRomajiRule[]): readonly UserAssetRow[] {
  const ruleNames = new Map(userRomajiRules.map((rule) => [rule.id, rule.name] as const));
  const { unusableLayouts } = buildUserCatalog(userLayouts, userRomajiRules);
  return userLayouts.map((layout, index) => {
    const unusable = unusableLayouts.get(index);
    if (unusable !== undefined) return { id: layout.id, name: layout.name, detail: unusable };
    if (layout.kind === 'kana') return { id: layout.id, name: layout.name, detail: '面で定義した、ローマ字を経ずに直接打つ配列' };
    const { romaji } = layout;
    if (romaji === undefined) {
      return { id: layout.id, name: layout.name, detail: '推奨のローマ字規則はありません。全体の値の規則で打ちます' };
    }
    const ruleName = isBuiltin(romaji) ? ROMAJI_RULES[romaji].name : ruleNames.get(romaji);
    const detail = ruleName === undefined ? '推奨のローマ字規則が見つからないため、全体の値の規則で打ちます' : `推奨のローマ字規則: ${ruleName}`;
    return { id: layout.id, name: layout.name, detail };
  });
}

/** 自作のローマ字規則の行。補足は、その規則を推奨に使っている自作の配列（削除すると全体の値の規則に変わる旨）。 */
export function userRomajiRuleRows(userLayouts: readonly UserLayout[], userRomajiRules: readonly UserRomajiRule[]): readonly UserAssetRow[] {
  return userRomajiRules.map((rule) => {
    const users = userLayouts.filter((layout) => layout.kind === 'alpha' && layout.romaji === rule.id);
    const detail =
      users.length === 0
        ? undefined
        : `推奨に使っている配列: ${users.map((layout) => layout.name).join('、')}。削除すると、その配列は全体の値の規則で打ちます`;
    return { id: rule.id, name: rule.name, detail };
  });
}

/** 自作の指の割り当ての行。削除しても選んでいる場所は残り、解決の時に既定の割り当てで測るので、その旨を補足にする。 */
export function userFingerAssignmentRows(assignments: readonly FingerAssignment[]): readonly UserAssetRow[] {
  return assignments.map((assignment) => ({
    id: assignment.id,
    name: assignment.name,
    detail: '削除すると、この割り当てを選んでいる場所は既定の割り当てで測ります',
  }));
}

/** コンボの組の行。補足は、基準の綴りとコンボの件数。 */
export function userComboSetRows(comboSets: readonly ComboSet[], userRomajiRules: readonly UserRomajiRule[]): readonly UserAssetRow[] {
  const ruleNames = new Map(userRomajiRules.map((rule) => [rule.id, rule.name] as const));
  return comboSets.map((set) => {
    const ruleName = isBuiltin(set.romajiRuleId) ? ROMAJI_RULES[set.romajiRuleId].name : ruleNames.get(set.romajiRuleId);
    return {
      id: set.id,
      name: set.name,
      detail: `${ruleName === undefined ? '基準の綴りが見つかりません' : `基準の綴り: ${ruleName}`}・コンボ${set.combos.length}件`,
    };
  });
}

/** Setupの行。名前は手持ちのSetup全部に対して付けた表示名で、補足は配列・物理配列・変えた条件を含むフルの名前。 */
export function userSetupRows(
  items: readonly { readonly setup: { readonly id: string }; readonly displayName: string; readonly fullName: string }[],
): readonly UserAssetRow[] {
  return items.map((item) => ({
    id: item.setup.id,
    name: item.displayName,
    detail: item.fullName === item.displayName ? undefined : item.fullName,
  }));
}

/** 削除の確認の対象。種類のほかに、手持ちに無いSetupへの上書きを消す確認がある。 */
export type DeleteConfirmKind = 'layout' | 'romaji-rule' | 'finger-assignment' | 'combo-set' | 'setup' | 'missing-setup-override';

const DELETE_IMPACT: Readonly<Record<DeleteConfirmKind, string>> = {
  'missing-setup-override': 'このSetupが手持ちに無いため、変更を戻した後は「元に戻す」で戻せません。',
  layout: `この配列を対象にしているペインは、「${LAYOUT_MISSING_REASON}」の表示になります。`,
  'romaji-rule': 'この規則を推奨にしている配列は、全体の値の規則で打つようになります。',
  'finger-assignment': 'この割り当てを選んでいる場所は、既定の割り当てで測るようになります。',
  'combo-set': 'この組を選んでいるSetupは、コンボの組を使わずに測るようになります。',
  setup: `このSetupを対象にしているペインは、「${MISSING_SETUP_NAME}」の表示になります。`,
};

/** 削除の確認の文。元に戻すが使える範囲と、削除が他へ及ぼす影響を書く。 */
export function deleteConfirmText(kind: DeleteConfirmKind): readonly string[] {
  if (kind === 'missing-setup-override') return [DELETE_IMPACT[kind]];
  return [DELETE_IMPACT[kind], '「元に戻す」で戻せます。再読み込みやタブを閉じた後は戻せません。'];
}
