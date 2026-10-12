import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import './figure-settings.css';

/**
 * 図1つにしか効かない表示の調整を、その図のそばのボタンから開く部品（docs/architecture.md「Analyzerがペインに渡すもの」）。
 * 打鍵再生は、表示だけが変わる項目をまとめて配列図の調整に置く。ChainとArpeggioの2項目は速度グラフの帯も切り替えるが、
 * どちらの図でも同じ構造の表示を切り替える項目なので、配列図の調整に置く。
 * ボタンは図の見出し行の中身のすぐ後ろに置き、押すと浮かぶ小窓で項目を開く。小窓の器（位置・ドラッグ・Escape・
 * スマホ幅のシート・Workspaceでのペイン名）はペインを描くホストが持つので、ここはホストが渡す描き方（`FigureSettingsWindowContext`）を
 * 通して小窓を出す。開閉の状態は呼び出し側のcomponentが持ち、保存しない。
 */

export interface FigureSettingsWindowProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** 小窓の見出し */
  readonly title: string;
  /** 閉じるボタンの読み上げ名 */
  readonly closeLabel: string;
  /** 小窓を寄せる基準（図の表示のボタン） */
  readonly anchor: Element | null;
  readonly children: ReactNode;
}

/** ホストが置く。小窓を描く関数で、無い面（ペインの外）では小窓を出さない。 */
export const FigureSettingsWindowContext = createContext<((props: FigureSettingsWindowProps) => ReactNode) | undefined>(undefined);

/** 図の見出し行の右に置く、その図の表示を調整するボタン。ペインの解析設定のボタンとは別の目のアイコンにする。 */
function FigureSettingsToggle({ name, open, onToggle, buttonRef }: {
  /** 図の名前。読み上げ名は「<名前>の表示」になる */
  readonly name: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly buttonRef: (element: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="figure-settings-toggle"
      aria-label={`${name}の表示`}
      title={`${name}の表示を調整する`}
      aria-expanded={open}
      aria-haspopup="dialog"
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

export interface FigureSettings {
  /** 見出し行に置くボタン */
  readonly toggle: ReactNode;
  /** 小窓。見出しが作り直されても閉じたり動いたりしないよう、見出しの外（作り直されない所）に置く */
  readonly renderWindow: (children: ReactNode) => ReactNode;
}

/**
 * 図1つ分の「ボタンと小窓」。`name`は図の名前で、ボタンの読み上げ名は「<名前>の表示」、小窓の見出しも同じ。
 * 閉じた後のフォーカスはボタンへ戻す（解析設定の小窓と同じ）。
 */
export function useFigureSettings(name: string): FigureSettings {
  const [open, setOpen] = useState(false);
  const renderWindow = useContext(FigureSettingsWindowContext);
  // 見出しが作り直される間は古いボタンと新しいボタンが同時にあるので、外れた時にrefを空にしない
  // （後から付いた新しいボタンの参照を、古いボタンが外れる時に消してしまう）
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const setButton = useCallback((element: HTMLButtonElement | null) => {
    if (element !== null) buttonRef.current = element;
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    const button = buttonRef.current;
    if (button?.isConnected) button.focus({ preventScroll: true });
  }, []);
  return {
    toggle: <FigureSettingsToggle name={name} open={open} onToggle={() => (open ? close() : setOpen(true))} buttonRef={setButton} />,
    renderWindow: (children) => renderWindow?.({
      open,
      onClose: close,
      title: `${name}の表示`,
      closeLabel: `${name}の表示を閉じる`,
      anchor: buttonRef.current,
      children,
    }) ?? null,
  };
}
