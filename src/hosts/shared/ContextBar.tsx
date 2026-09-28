import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import './context-bar.css';

/**
 * 文脈バー（docs/architecture.md「画面の構成」「文脈バー」）。本体の上端に置き、
 * Workspaceの時はWorkspace名、使うテキストのチップ、常時出す操作（Undo/Redo・共有）を持つ。
 * ペイン固有の値は持たない。
 *
 * 個別画面とWorkspaceで同じものを使うので `hosts/shared` に置く。
 */

/**
 * シェルが文脈バーの左端に差し込む部品（サイドバーを固定していない時・スマホ幅で開くボタン）。
 * サイドバーはシェル（`app`）が持ち、hostsは `app` をimportできないので、シェルがここへ渡す。
 */
export const ContextBarLeadingSlot = createContext<ReactNode>(null);

export interface ContextBarProps {
  /** テキストのチップなど、バーの左側に並べるもの。 */
  readonly children: ReactNode;
  /** 右端に寄せる常時出す操作（Undo/Redo・共有）。 */
  readonly actions?: ReactNode;
}

export function ContextBar({ children, actions }: ContextBarProps) {
  const leading = useContext(ContextBarLeadingSlot);
  return (
    <section className="context-bar" aria-label="テキストと画面の操作">
      {leading}
      <div className="context-bar-items">{children}</div>
      {actions === undefined ? null : <div className="context-bar-actions">{actions}</div>}
    </section>
  );
}

/** Undo / Redo の状態と操作。資産のコマンド履歴（#544 §8-2）をホストの組み立てから受け取る。 */
export interface ContextBarHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undo: () => void;
  readonly redo: () => void;
}

export function UndoRedoButtons({ history }: { readonly history: ContextBarHistory }) {
  return (
    <>
      <button
        type="button"
        className="context-icon-button"
        aria-label="元に戻す"
        title="元に戻す"
        disabled={!history.canUndo}
        onClick={history.undo}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M5.5 3.5 2.5 6.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 6.5h6.25a3.75 3.75 0 0 1 0 7.5H7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className="context-icon-button"
        aria-label="やり直す"
        title="やり直す"
        disabled={!history.canRedo}
        onClick={history.redo}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="m10.5 3.5 3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 6.5H6.75a3.75 3.75 0 0 0 0 7.5H9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </>
  );
}

export interface ShareButtonProps {
  /**
   * URLに載せる値（解析設定など）。無ければ今の画面のURLをそのままコピーする。
   * URLとクリップボードに触るのはホストだけ（Analyzerの本体・解析設定は触らない）。
   */
  readonly query?: () => URLSearchParams;
  /** 何を含むURLをコピーするかの説明（ボタンのtitle）。 */
  readonly description: string;
}

type ShareState = 'idle' | 'copied' | 'failed';

export function ShareButton({ query, description }: ShareButtonProps) {
  const [state, setState] = useState<ShareState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const show = (next: ShareState) => {
    setState(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState('idle'), 1800);
  };

  const copy = () => {
    const params = query?.().toString() ?? '';
    const url = `${window.location.origin}${window.location.pathname}${params ? `?${params}` : ''}`;
    // 安全でない接続ではclipboardが無い。失敗は黙らずに知らせる。
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (clipboard === undefined) {
      show('failed');
      return;
    }
    clipboard.writeText(url).then(() => show('copied'), () => show('failed'));
  };

  return (
    <span className="context-share">
      <button type="button" className="context-share-button" title={description} onClick={copy}>
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <path d="M8 10V2.5M5 5.25 8 2.25l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4.5 7.5H3.75A1.25 1.25 0 0 0 2.5 8.75v4.5c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25v-4.5c0-.69-.56-1.25-1.25-1.25H11.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="context-share-label">共有</span>
      </button>
      <span className="context-share-status" role="status">
        {state === 'copied' ? 'URLをコピーした' : state === 'failed' ? 'コピーできなかった' : ''}
      </span>
    </span>
  );
}
