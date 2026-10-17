import type { CodecDiagnostic } from '../codec/index.ts';
import { droppedDuplicateId } from '#input/codec/index.ts';
import { isBuiltin, type UserRomajiRule } from '../romaji/rules.ts';
import { LAYOUT_BY_ID } from './index.ts';
import type { Layout } from './types.ts';
import { toJapaneseLayout, toLayout, validate, type UserLayout } from './user-layouts.ts';

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
  /**
   * 計算に使えない配列の理由（入力の`userLayouts`の添字 → 利用者に見せる文）。
   * 保存データには残っている配列に付けるので、捨てた旨ではなく、使えない状態と理由を書く。
   */
  readonly unusableLayouts: ReadonlyMap<number, string>;
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
 *   `romaji`が指す規則が組み込みにも自作にも無い時と、`romaji`が無い時は配列は残し、
 *   規則の推奨だけ持たせない（全体の値の規則で打つ）。診断を積むのは前者だけ。`direct`の配列はローマ字を経ないので`romaji`を見ない
 */
export function buildUserCatalog(userLayouts: readonly UserLayout[], userRomajiRules: readonly UserRomajiRule[]): UserCatalog {
  const diagnostics: CodecDiagnostic[] = [];

  const romajiRules: UserRomajiRule[] = [];
  const ruleIds = new Set<string>();
  userRomajiRules.forEach((rule, index) => {
    const path = `userRomajiRules[${index}]`;
    if (isBuiltin(rule.id)) {
      diagnostics.push({ path, message: `id「${rule.id}」が組み込みの規則と同じため捨てました` });
    } else if (ruleIds.has(rule.id)) {
      diagnostics.push({ path, message: droppedDuplicateId(rule.id) });
    } else {
      ruleIds.add(rule.id);
      romajiRules.push(rule);
    }
  });

  const unusableLayouts = new Map<number, string>();
  const layouts = new Map<string, Layout>();
  const definitions = new Map<string, UserLayout>();
  userLayouts.forEach((definition, index) => {
    const path = `userLayouts[${index}]`;
    if (LAYOUT_BY_ID.has(definition.id)) {
      diagnostics.push({ path, message: `id「${definition.id}」が組み込みの配列と同じため捨てました` });
      unusableLayouts.set(index, '組み込みの配列と識別子が同じため、計算には使えません');
      return;
    }
    if (definitions.has(definition.id)) {
      diagnostics.push({ path, message: droppedDuplicateId(definition.id) });
      unusableLayouts.set(index, '同じ識別子の配列が先にあるため、計算には使えません');
      return;
    }
    const errors = validate(definition.rows);
    if (errors.length > 0) {
      diagnostics.push({ path, message: `配列として組めないため捨てました（${errors.join('、')}）` });
      unusableLayouts.set(index, `配列として組めないため、計算には使えません（${errors.join('、')}）`);
      return;
    }
    let layout: Layout;
    try {
      layout = toLayout(definition);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      diagnostics.push({ path, message: `配列として組めないため捨てました（${reason}）` });
      // 例外の文は実装の語を含むので画面には出さない。原因は衝突・空の打鍵列など複数あり、特定しない
      unusableLayouts.set(index, '配列の定義から打鍵を組み立てられないため、計算には使えません。定義を見直してください');
      return;
    }
    const romaji = definition.romaji;
    if (definition.direct !== true && romaji !== undefined) {
      if (isBuiltin(romaji) || ruleIds.has(romaji)) {
        layout = { ...layout, recommendedRomajiRuleId: romaji };
      } else {
        diagnostics.push({ path: `${path}.romaji`, message: `ローマ字規則「${romaji}」が見つからないため、全体の値の規則で打ちます` });
      }
    }
    definitions.set(definition.id, definition);
    layouts.set(definition.id, layout);
  });

  return { layouts, userLayouts: definitions, romajiRules, unusableLayouts, diagnostics };
}

/**
 * 自作の配列を、実際に打って試す画面（Tester）が使う形にする。
 * 使える配列の選び方は`buildUserCatalog`と同じ。違うのは、`romaji`が指す規則（組み込み・自作）で
 * ローマ字の表を持たせる点。`direct`の配列と、`romaji`が無い・指す規則が見つからない配列は表を持たず、
 * 打ったキーの出力をそのまま使う。
 */
export function userInputLayouts(userLayouts: readonly UserLayout[], userRomajiRules: readonly UserRomajiRule[]): readonly Layout[] {
  const catalog = buildUserCatalog(userLayouts, userRomajiRules);
  const ruleIds = new Set(catalog.romajiRules.map((rule) => rule.id));
  return [...catalog.userLayouts.values()].map((definition) => {
    const { romaji, ...rest } = definition;
    const resolvable = romaji !== undefined && (isBuiltin(romaji) || ruleIds.has(romaji));
    return toJapaneseLayout(resolvable ? definition : rest, [...catalog.romajiRules]);
  });
}
