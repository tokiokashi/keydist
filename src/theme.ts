export type ThemeChoice = 'light' | 'dark' | 'system';

/** AppStateで選ばれたテーマをdocument rootへ反映する。 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/**
 * CSS変数の実効値を取り出す。SVGのfillにvar()を書くと
 * ツールチップの凡例などHTML側と色を揃えにくいため、値を解決して使う。
 */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
