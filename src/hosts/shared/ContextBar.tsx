import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import './context-bar.css';

/**
 * 文脈バー（docs/architecture.md「画面の構成」「文脈バー」）。本体の上端に置き、
 * Workspaceの時はWorkspace名、使うテキストのチップ、常時出す操作（Undo/Redo。個別画面は共有も）を持つ。
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
  /** Undo/Redoの状態と操作。 */
  readonly history: ContextBarHistory;
  /**
   * 共有（URLのコピー）。渡した時だけボタンを出す。Workspaceは渡さない
   * （URLのidはこのブラウザの保存先を指すので、受け取った側では開けない）。
   */
  readonly share?: ContextBarShare;
  /**
   * 資産の読み込みが済むまで、バーの操作を効かせない（プリレンダーのHTMLは読み込み前から押せるため）。
   * シェルが差し込むサイドバーのボタンは資産と関係ないので、ここに含めない。
   */
  readonly disabled?: boolean;
}

/**
 * Undo/Redoと共有（渡された時）はどの幅でも常時出す。バーが狭い時は共有の文字を見た目から省き、アイコンだけにする
 * （1行に収めるため。読み上げには残す）。
 */
export function ContextBar({ children, history, share, disabled = false }: ContextBarProps) {
  const leading = useContext(ContextBarLeadingSlot);
  const barRef = useRef<HTMLElement>(null);

  // バーの高さが変わる場合がある。その下に固定するペインの見出しが位置を合わせられるよう、
  // 実際の高さをCSS変数で公開する（値が無い間はCSS側の既定＝1行分）。
  useEffect(() => {
    const bar = barRef.current;
    if (bar === null) return undefined;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--context-bar-height', `${bar.getBoundingClientRect().height}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--context-bar-height');
    };
  }, []);

  const { state, copy } = useShareCopy(share?.query);
  return (
    <section ref={barRef} className="context-bar" aria-label="テキストと画面の操作">
      {leading}
      <fieldset className="context-bar-fieldset" disabled={disabled}>
        <div className="context-bar-items">{children}</div>
        <div className="context-bar-actions">
          <UndoRedoButtons history={history} />
          {share === undefined ? null : (
            <>
              <ShareButton description={share.description} onCopy={copy} />
              <span className="context-share-status" role="status">
                {state.kind === 'copied' ? 'コピーしました' : state.kind === 'failed' ? 'コピーできませんでした' : ''}
                {state.kind === 'idle'
                  ? null
                  : state.notices.map((line) => <span key={line} className="context-share-notice" data-share-notice="true">{line}</span>)}
              </span>
            </>
          )}
        </div>
      </fieldset>
    </section>
  );
}

/** Undo / Redo の状態と操作。資産のコマンド履歴をホストの組み立てから受け取る。 */
export interface ContextBarHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undo: () => void;
  readonly redo: () => void;
}

function UndoRedoButtons({ history }: { readonly history: ContextBarHistory }) {
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

export interface ContextBarShare {
  /**
   * URLに載せる値（解析設定など）。無ければ今の画面のURLをそのままコピーする。
   * URLとクリップボードに触るのはホストだけ（Analyzerの本体・解析設定は触らない）。
   */
  readonly query?: () => ShareQuery;
  /** 何を含むURLをコピーするかの説明（ボタンのtitle・メニュー項目の説明）。 */
  readonly description: string;
}

/** URLに載せる値と、載らなかった対象などコピーの時に添えて示す文。 */
export interface ShareQuery {
  readonly params: URLSearchParams;
  readonly notices?: readonly string[];
}

interface ShareState {
  readonly kind: 'idle' | 'copied' | 'failed';
  readonly notices: readonly string[];
}

const IDLE: ShareState = { kind: 'idle', notices: [] };
/** 添える文がある時は、読み終える時間が要るので長く出す。 */
const STATUS_MS = 1800;
const STATUS_WITH_NOTICES_MS = 10_000;

/** URLのコピーと、その結果の表示状態（しばらくして消える）。 */
function useShareCopy(query: ContextBarShare['query']): { readonly state: ShareState; readonly copy: () => void } {
  const [state, setState] = useState<ShareState>(IDLE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const show = (kind: ShareState['kind'], notices: readonly string[]) => {
    setState({ kind, notices });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState(IDLE), notices.length > 0 ? STATUS_WITH_NOTICES_MS : STATUS_MS);
  };

  const copy = () => {
    const shared = query?.();
    const params = shared?.params.toString() ?? '';
    const notices = shared?.notices ?? [];
    const url = `${window.location.origin}${window.location.pathname}${params ? `?${params}` : ''}`;
    // 安全でない接続ではclipboardが無い。失敗は黙らずに知らせる。
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (clipboard === undefined) {
      show('failed', []);
      return;
    }
    clipboard.writeText(url).then(() => show('copied', notices), () => show('failed', []));
  };

  return { state, copy };
}

function ShareButton({ description, onCopy }: { readonly description: string; readonly onCopy: () => void }) {
  return (
    <span className="context-share">
      <button type="button" className="context-share-button" aria-label="共有" title={`共有: ${description}`} onClick={onCopy}>
        <ShareIcon />
        <span className="context-share-label">共有</span>
      </button>
    </span>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M8 10V2.5M5 5.25 8 2.25l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 7.5H3.75A1.25 1.25 0 0 0 2.5 8.75v4.5c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25v-4.5c0-.69-.56-1.25-1.25-1.25H11.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
