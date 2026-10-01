import { useSyncExternalStore } from 'react';
import { MOBILE_QUERY } from '#ui/theme/breakpoints.ts';

/**
 * Workspaceがペインを縦に積む幅の境目。CSSには複製せず、積む時に付ける属性（`data-stacked`）で切り替える。
 *
 * 境目は、見出しを1行にする・サイドバーを引き出しにする・解析設定と対象の選択をシートにするのと同じ
 * （`ui/theme/breakpoints.ts`）。サイドバーが引き出しになる幅では、ペインを横に並べても読めないので、
 * ペインの並べ方もここで切り替える。
 */
export const STACK_QUERY = MOBILE_QUERY;

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
