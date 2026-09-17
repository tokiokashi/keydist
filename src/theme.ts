export type ThemeChoice = 'light' | 'dark' | 'system';

/**
 * テーマ切替。3状態（ライト / 自動 / ダーク）。
 * 「自動」はdata-themeを外してOSの設定に従わせる。
 */
export function setupTheme(initialChoice: ThemeChoice, onChange: (choice: ThemeChoice) => void) {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-theme-set]')];
  let choice = initialChoice;

  const apply = () => {
    const root = document.documentElement;
    if (choice === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', choice);
    for (const b of buttons) {
      b.setAttribute('aria-pressed', String(b.dataset.themeSet === choice));
    }
    onChange(choice);
  };

  for (const b of buttons) {
    b.addEventListener('click', () => {
      choice = b.dataset.themeSet as ThemeChoice;
      apply();
    });
  }

  // 「自動」のときはOS側の変更にも追従する
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (choice === 'system') onChange(choice);
  });

  apply();
}

/**
 * CSS変数の実効値を取り出す。SVGのfillにvar()を書くと
 * ツールチップの凡例などHTML側と色を揃えにくいため、値を解決して使う。
 */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
