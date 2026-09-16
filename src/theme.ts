export type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'keydist:theme';

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // プライベートウィンドウなどで読めないことがある
  }
  return 'system';
}

function write(choice: ThemeChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // 保存できなくても表示は成立する
  }
}

/**
 * テーマ切替。3状態（ライト / 自動 / ダーク）。
 * 「自動」はdata-themeを外してOSの設定に従わせる。
 */
export function setupTheme(onChange: () => void) {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-theme-set]')];

  const apply = (choice: ThemeChoice) => {
    const root = document.documentElement;
    if (choice === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', choice);
    for (const b of buttons) {
      b.setAttribute('aria-pressed', String(b.dataset.themeSet === choice));
    }
    onChange();
  };

  for (const b of buttons) {
    b.addEventListener('click', () => {
      const choice = b.dataset.themeSet as ThemeChoice;
      write(choice);
      apply(choice);
    });
  }

  // 「自動」のときはOS側の変更にも追従する
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (read() === 'system') onChange();
  });

  apply(read());
}

/**
 * CSS変数の実効値を取り出す。SVGのfillにvar()を書くと
 * ツールチップの凡例などHTML側と色を揃えにくいため、値を解決して使う。
 */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
