import { useLayoutEffect, useState, type RefObject } from 'react';

/** Workspaceのペイン（本体の領域が高さを持つ時）だけ1になる印。`band-chart-view.css` の `@container pane-body` の中で宣言する。 */
const FIT_FLAG = '--band-chart-fit';

/**
 * 図（凡例・帯・キャプション）に使える高さ [px]。まだ測っていない間と、測れない時は `undefined`。
 *
 * - Workspaceのペイン: 本体の領域が高さを持つので、`feature` がその高さを埋め、残りは見出しの行を除いた高さになる。
 * - 個別画面: 画面の高さから、上に貼り付く見出しと文脈バーの下端（凡例の貼り付く位置）と、見出しの行を除いた高さになる。
 *   画面の高さは、本体の領域に高さが無いので、見えている高さの代わりに `window.innerHeight` を使う。
 *
 * 見出しの行は図の上にあり、スクロールの先頭では図と同時に見えるので、図の高さから引く。
 */
export function useVisibleHeight(featureRef: RefObject<HTMLElement | null>, remeasureKey: unknown): number | undefined {
  const [height, setHeight] = useState<number | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: remeasureKeyは中で読まないが、見出しの行が現れる・消える時に測り直すために依存に入れる
  useLayoutEffect(() => {
    const feature = featureRef.current;
    if (feature === null) return;
    const measure = () => {
      const style = getComputedStyle(feature);
      const heading = feature.querySelector('.band-heading');
      const headingHeight = heading === null ? 0 : heading.getBoundingClientRect().height + (Number.parseFloat(style.rowGap) || 0);
      let visible: number;
      if (style.getPropertyValue(FIT_FLAG).trim() === '1') {
        visible = feature.clientHeight;
      } else {
        // 凡例の貼り付く位置（`top`）が、固定した見出しと文脈バーの下端。貼り付かない配置では0になる
        const legend = feature.querySelector('.band-legend');
        const stickyTop = legend === null ? 0 : Number.parseFloat(getComputedStyle(legend).top) || 0;
        visible = window.innerHeight - stickyTop;
      }
      const next = Math.floor(visible - headingHeight);
      setHeight(next > 0 ? next : undefined);
    };
    measure();
    window.addEventListener('resize', measure);
    if (typeof ResizeObserver === 'undefined') return () => window.removeEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    observer.observe(feature);
    for (const bar of document.querySelectorAll('.context-bar')) observer.observe(bar);
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [featureRef, remeasureKey]);
  return height;
}
