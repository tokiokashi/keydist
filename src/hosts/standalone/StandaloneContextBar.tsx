import { useState, type ReactNode } from 'react';

/**
 * 個別画面の、文脈バーができるまでの置き場（docs/architecture.md「文脈バー」）。
 *
 * 文脈バーはシェルの作業で作る（テキストのチップ・Undo/Redo・共有）。それまでは、ペインの外に
 * 置くもの（テキスト・既定の物理配列・共有）をペインの上の1か所に集め、ペインの見出しに
 * 混ぜない。ここに置いたものは文脈バーができた時にそちらへ移す。
 */
export function StandaloneContextBar({ children }: { readonly children: ReactNode }) {
  return (
    <section className="standalone-context-bar" aria-label="テキスト・物理配列の既定・共有">
      {children}
    </section>
  );
}

/**
 * 共有: 今の解析設定を載せたURLをコピーする（文脈バーの「共有」の暫定の置き場）。
 * URLとクリップボードに触るのはホストだけ（Analyzerの本体・解析設定は触らない）。
 */
export function CopySettingsLinkButton({ query }: { readonly query: () => URLSearchParams }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const params = query().toString();
    const url = `${window.location.origin}${window.location.pathname}${params ? `?${params}` : ''}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="standalone-control standalone-share">
      <span>共有</span>
      <button type="button" onClick={copy}>
        {copied ? 'コピーした' : '今の設定のURLをコピー'}
      </button>
    </div>
  );
}
