import { isBuiltin, ROMAJI_RULES, type UserRomajiRule } from '#input/romaji/rules.ts';
import type { FingerAssignment } from '#input/shapes/geometry.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';

/** 一覧の1行。種類ごとの違いは`detail`の文に収め、行の形は配列も規則も同じにする。 */
export interface UserAssetRow {
  readonly id: string;
  readonly name: string;
  /** 名前の下に出す補足。 */
  readonly detail: string | undefined;
}

/** 自作の配列の行。補足は、推奨のローマ字規則（見つからなければ全体の値の規則で打つ旨）。 */
export function userLayoutRows(
  userLayouts: readonly UserLayout[],
  userRomajiRules: readonly UserRomajiRule[],
): readonly UserAssetRow[] {
  const ruleNames = new Map(userRomajiRules.map((rule) => [rule.id, rule.name] as const));
  return userLayouts.map((layout) => {
    if (layout.direct === true) return { id: layout.id, name: layout.name, detail: 'ローマ字を経ずに直接打つ配列' };
    const { romaji } = layout;
    if (romaji === undefined) {
      return { id: layout.id, name: layout.name, detail: '推奨のローマ字規則はありません。全体の値の規則で打ちます' };
    }
    const ruleName = isBuiltin(romaji) ? ROMAJI_RULES[romaji].name : ruleNames.get(romaji);
    const detail = ruleName === undefined
      ? '推奨のローマ字規則が見つからないため、全体の値の規則で打ちます'
      : `推奨のローマ字規則: ${ruleName}`;
    return { id: layout.id, name: layout.name, detail };
  });
}

/** 自作のローマ字規則の行。補足は、その規則を推奨に使っている自作の配列（削除すると全体の値の規則に変わる旨）。 */
export function userRomajiRuleRows(
  userLayouts: readonly UserLayout[],
  userRomajiRules: readonly UserRomajiRule[],
): readonly UserAssetRow[] {
  return userRomajiRules.map((rule) => {
    const users = userLayouts.filter((layout) => layout.direct !== true && layout.romaji === rule.id);
    const detail = users.length === 0
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
