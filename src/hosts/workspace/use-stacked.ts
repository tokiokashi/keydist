import { useSyncExternalStore } from 'react';

/**
 * Workspaceがペインを縦に積む幅の境目。CSSには複製せず、積む時に付ける属性（`data-stacked`）で切り替える。
 *
 * 760pxは、見出しを1行にする・サイドバーを引き出しにする境目（`app/shell/AppShell.tsx`・`shell.css`）と同じ。
 * サイドバーが引き出しになる幅では、ペインを横に並べても読めないので、ペインの並べ方もここで切り替える。
 * 解析設定・対象の選択をシートにする境目（640px）とはまだ別で、1つの定義へ寄せるのは別の課題
 * （641〜760pxではペインは縦に積まれ、解析設定と対象の選択はフローティングの小窓・ポップオーバーで開く）。
 */
export const STACK_QUERY = '(max-width: 760px)';

function subscribe(listener: () => void): () => void {
  const query = window.matchMedia(STACK_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

function getSnapshot(): boolean {
  return window.matchMedia(STACK_QUERY).matches;
}

/** ペインを縦に積む幅か。事前描画（window無し）では横に並べる側を返す。 */
export function useStacked(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
