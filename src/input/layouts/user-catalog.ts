import type { CodecDiagnostic } from '../codec/index.ts';
import { isBuiltin, type UserRomajiRule } from '../romaji/rules.ts';
import { LAYOUT_BY_ID } from './index.ts';
import type { Layout } from './types.ts';
import { toLayout, validate, type UserLayout } from './user-layouts.ts';

/**
 * 資産に入っている自作の配列・ローマ字規則を、組み込みと並べて引ける形にしたもの。
 */
export interface UserCatalog {
  /** 解決に使える自作の配列（`UserLayout.id` → 組み込みの配列と同じ形の実体）。 */
  readonly layouts: ReadonlyMap<string, Layout>;
  /** `layouts`の元の定義。配列の種類（`direct`）の判定に使う。 */
  readonly userLayouts: ReadonlyMap<string, UserLayout>;
  /** 組み込みと衝突しない自作のローマ字規則。 */
  readonly romajiRules: readonly UserRomajiRule[];
  /** 捨てた・読み替えた項目の診断。経路は`userLayouts[i]` / `userRomajiRules[i]`。 */
  readonly diagnostics: readonly CodecDiagnostic[];
}

/**
 * 自作の配列・ローマ字規則を、組み込みと合わせて解決できる形にする。
 * 組み込みと自作のidが衝突する時は組み込みを優先して自作を捨てる（引いた結果がどちらか
 * 分からなくなるため）。捨てた旨は診断に積む。
 *
 * - 自作のローマ字規則: 組み込みのidと同じもの・id重複を捨てる
 * - 自作の配列: 組み込みの配列と同じid・id重複・段の列数オーバー・配列として組めないものを捨てる。
 *   `romaji`が指す規則が組み込みにも自作にも無い時は配列は残し、規則の推奨だけ持たせない
 *   （全体の値の規則で打つ）。`direct`の配列はローマ字を経ないので`romaji`を見ない
 */
export function buildUserCatalog(
  userLayouts: readonly UserLayout[],
  userRomajiRules: readonly UserRomajiRule[],
): UserCatalog {
  const diagnostics: CodecDiagnostic[] = [];

  const romajiRules: UserRomajiRule[] = [];
  const ruleIds = new Set<string>();
  userRomajiRules.forEach((rule, index) => {
    const path = `userRomajiRules[${index}]`;
    if (isBuiltin(rule.id)) {
      diagnostics.push({ path, message: `id「${rule.id}」が組み込みの規則と同じため捨てました` });
    } else if (ruleIds.has(rule.id)) {
      diagnostics.push({ path, message: `id「${rule.id}」が重複しているため捨てました` });
    } else {
      ruleIds.add(rule.id);
      romajiRules.push(rule);
    }
  });

  const layouts = new Map<string, Layout>();
  const definitions = new Map<string, UserLayout>();
  userLayouts.forEach((definition, index) => {
    const path = `userLayouts[${index}]`;
    if (LAYOUT_BY_ID.has(definition.id)) {
      diagnostics.push({ path, message: `id「${definition.id}」が組み込みの配列と同じため捨てました` });
      return;
    }
    if (definitions.has(definition.id)) {
      diagnostics.push({ path, message: `id「${definition.id}」が重複しているため捨てました` });
      return;
    }
    const errors = validate(definition.rows);
    if (errors.length > 0) {
      diagnostics.push({ path, message: `配列として組めないため捨てました（${errors.join('、')}）` });
      return;
    }
    let layout: Layout;
    try {
      layout = toLayout(definition);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      diagnostics.push({ path, message: `配列として組めないため捨てました（${reason}）` });
      return;
    }
    if (definition.direct !== true) {
      if (isBuiltin(definition.romaji) || ruleIds.has(definition.romaji)) {
        layout = { ...layout, recommendedRomajiRuleId: definition.romaji };
      } else {
        diagnostics.push({ path: `${path}.romaji`, message: `ローマ字規則「${definition.romaji}」が見つからないため、全体の値の規則で打ちます` });
      }
    }
    definitions.set(definition.id, definition);
    layouts.set(definition.id, layout);
  });

  return { layouts, userLayouts: definitions, romajiRules, diagnostics };
}
