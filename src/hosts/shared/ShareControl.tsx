import { useEffect, useRef, useState } from 'react';
import './context-bar.css';

/**
 * 共有（今の画面のURLをコピーする）のボタンと、コピーの結果の表示。
 * 個別画面の文脈バーとTesterの見出しで同じ見た目・同じ知らせにするために、文脈バーから切り出してある。
 * URLとクリップボードに触るのはこの部品だけで、載せる値は呼び出し側が `query` で渡す。
 */

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

/** ボタンと結果の表示。結果の表示は絶対配置なので、置く側が位置の基準（position: relative）を用意する。 */
export function ShareControl({ share }: { readonly share: ContextBarShare }) {
  const { state, copy } = useShareCopy(share.query);
  return (
    <>
      <ShareButton description={share.description} onCopy={copy} />
      <span className="context-share-status" role="status">
        {state.kind === 'copied' ? 'URLをコピーしました' : state.kind === 'failed' ? 'コピーできませんでした' : ''}
        {state.kind === 'idle'
          ? null
          : state.notices.map((line) => (
              <span key={line} className="context-share-notice" data-share-notice="true">
                {line}
              </span>
            ))}
      </span>
    </>
  );
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
    clipboard.writeText(url).then(
      () => show('copied', notices),
      () => show('failed', []),
    );
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
      <path
        d="M4.5 7.5H3.75A1.25 1.25 0 0 0 2.5 8.75v4.5c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25v-4.5c0-.69-.56-1.25-1.25-1.25H11.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
