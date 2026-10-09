import type { ReactNode } from 'react';
import './figure-settings.css';

/**
 * 図1つにしか効かない表示の調整を、その図のそばで開く部品（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * ボタンは図の見出し行の右端に置き、押すと見出しの直下へ欄が展開する（小窓にしない）。
 * 開閉の状態は呼び出し側が持ち、保存しない。
 */

/** 図の見出し行の右に置く、その図の表示を調整するボタン。ペインの解析設定のボタンとは別の目のアイコンにする。 */
export function FigureSettingsToggle({ name, open, onToggle }: {
  /** 図の名前。読み上げ名は「<名前>の表示」になる */
  readonly name: string;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="figure-settings-toggle"
      aria-label={`${name}の表示`}
      title={`${name}の表示を調整する`}
      aria-expanded={open}
      onClick={onToggle}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path
          d="M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  );
}

/** ボタンから展開する欄の外枠。読み上げ名は「<名前>の表示」で、ボタンと揃える。 */
export function FigureSettingsBox({ name, children }: { readonly name: string; readonly children: ReactNode }) {
  return (
    <div className="figure-settings" role="group" aria-label={`${name}の表示`}>
      {children}
    </div>
  );
}
