import { resolveEngineInput, type ResolvedInputResult } from '#engine/resolved-input.ts';
import type { SettingsCascadeOverrides } from '#engine/settings-items.ts';
import type { AnalysisTarget, Setup, SetupCatalog } from '#input/setup/index.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import type { FingerAssignment } from '#input/shapes/geometry.ts';
import type { UserRomajiRule } from '#input/romaji/rules.ts';
import type { ResolvedText } from '#input/text/resolve.ts';

/**
 * 単体ページが`resolveEngineInput`を呼ぶのに要る、Setup以外のカタログ一式。
 * `app`が組み立て（組み込み+自作の配列・形状・ローマ字規則・指割当）、hostへ注入する
 * （`docs/architecture.md`「保存が要る層は、appが組み立てたアダプタを注入して使う」と
 * 同じ形。ここに入るのはカタログ＝読み取り専用の参照なので、storageそのものではないが
 * 「appが組み立てる」という点は揃える）。
 */
export interface StandalonePaneCatalog {
  readonly setupCatalog: SetupCatalog;
  readonly userLayouts: ReadonlyMap<string, UserLayout>;
  readonly customRomajiRules?: readonly UserRomajiRule[];
  readonly customFingerAssignments?: ReadonlyMap<string, FingerAssignment>;
}

/**
 * 単体ページの入力解決（#544 §1・§5、#578指摘1「対象を配列かSetupにする」）。
 * 呼び出し側（`hosts/standalone`の各ページ）が`resolveTextSelection`
 * （`input/text/resolve.ts`）で既に決めた「今使っているテキスト」（本文と実効言語。
 * 手動上書きがあればそちらを優先済み）を`resolveEngineInput`へ渡すだけの、
 * テキストの言語判定とengineの接続点。
 *
 * `setups`はSetup対象の解決に要る手持ち（`assets.setupLibrary.setups`をidで引ける形にした
 * もの）。配列対象では参照しない（`resolveTargetForText`参照）。
 */
export function resolveStandalonePaneInput(
  target: AnalysisTarget,
  setups: ReadonlyMap<string, Setup>,
  catalog: StandalonePaneCatalog,
  overrides: SettingsCascadeOverrides,
  resolvedText: ResolvedText,
): ResolvedInputResult {
  return resolveEngineInput({
    target,
    setups,
    catalog: catalog.setupCatalog,
    userLayouts: catalog.userLayouts,
    customRomajiRules: catalog.customRomajiRules,
    customFingerAssignments: catalog.customFingerAssignments,
    overrides,
    text: resolvedText.text,
    language: resolvedText.language,
  });
}
