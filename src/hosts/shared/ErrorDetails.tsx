import './error-details.css';

/**
 * エラーの詳細（不具合報告に貼るための原文）を折りたたんで出す。
 * 画面に出す文は利用者向けの1文だけにし、例外のメッセージ・キーid・stackなど
 * 開発者向けの文はここへ寄せる（AGENTS.md「画面に出る文言」）。
 */
export function ErrorDetails({ lines }: { readonly lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <details className="pane-error-details" data-pane-error-details="true">
      <summary>詳細（不具合報告用）</summary>
      <pre>{lines.join('\n')}</pre>
    </details>
  );
}
