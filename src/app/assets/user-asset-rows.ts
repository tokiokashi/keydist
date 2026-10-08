import { isBuiltin, ROMAJI_RULES, type UserRomajiRule } from '#input/romaji/rules.ts';
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
    const ruleName = isBuiltin(layout.romaji) ? ROMAJI_RULES[layout.romaji].name : ruleNames.get(layout.romaji);
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
