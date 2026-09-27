import { resolveEngineInput, type ResolvedInputResult } from '#engine/resolved-input.ts';
import type { SettingsCascadeOverrides } from '#engine/settings-items.ts';
import type { Setup, SetupCatalog } from '#input/setup/index.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import type { FingerAssignment } from '#input/shapes/geometry.ts';
import type { UserRomajiRule } from '#input/romaji/rules.ts';
import { standaloneTextLanguage, type StandaloneTextState } from '#input/text/standalone-text.ts';

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
 * 単体ページの入力解決（#544 §1・§5）。「最後に使ったテキスト」から実際に使う言語
 * （`standaloneTextLanguage`。手動上書きがあればそちらを優先）を決めてから
 * `resolveEngineInput`へ渡す、テキストの言語判定とengineの接続点。
 */
export function resolveStandalonePaneInput(
  setup: Setup,
  catalog: StandalonePaneCatalog,
  overrides: SettingsCascadeOverrides,
  standaloneText: StandaloneTextState,
): ResolvedInputResult {
  return resolveEngineInput({
    setup,
    catalog: catalog.setupCatalog,
    userLayouts: catalog.userLayouts,
    customRomajiRules: catalog.customRomajiRules,
    customFingerAssignments: catalog.customFingerAssignments,
    overrides,
    text: standaloneText.text,
    language: standaloneTextLanguage(standaloneText),
  });
}
