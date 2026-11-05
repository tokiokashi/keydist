import type { TextLanguage } from '#input/text/language.ts';
import type { InfoHelp } from '#ui/primitives/info-button.tsx';

/**
 * 見出しのⓘから開く説明。名前や単位の呼び名がテキストの言語で変わる説明は、言語を受けて作る関数で持つ。
 * `pane-meta.ts` はReactに依存させないので、型と解決をこのファイルに分けて置く。
 */
export type PaneHelp = InfoHelp | ((language: TextLanguage) => InfoHelp);

export function resolvePaneHelp(help: PaneHelp | undefined, language: TextLanguage): InfoHelp | undefined {
  return typeof help === 'function' ? help(language) : help;
}
