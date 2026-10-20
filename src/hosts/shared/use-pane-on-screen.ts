import { useEffect, useRef, useState, type RefObject } from 'react';

/** `IntersectionObserverEntry`のうち判定に読む部分。 */
export interface OnScreenEntry {
  readonly isIntersecting: boolean;
  readonly intersectionRect: { readonly width: number; readonly height: number };
}

/**
 * 観察した要素の一部が、表示領域に面積を持って入っているか。
 * 辺や点だけが触れている場合（幅や高さが0）と、`display: none`の中にある場合は、見えていないので入っていないと数える。
 */
export function isShownOnScreen(entry: OnScreenEntry): boolean {
  return entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0;
}

export interface PaneOnScreen<Element extends HTMLElement> {
  /** 観察する要素に付ける。 */
  readonly ref: RefObject<Element | null>;
  /** 要素の一部が表示領域に入っているか。`enabled`が偽の間は常に真。 */
  readonly onScreen: boolean;
}

/**
 * 要素が画面に入っているかを知る。ページのスクロールのほか、祖先のスクロール領域で隠れている間も、入っていないと数える
 * （`IntersectionObserver`が祖先の切り取りを含めて判定する）。
 * `enabled`が偽の間は観察せず、入っているものとして扱う。`IntersectionObserver`が無い環境でも入っているものとして扱う。
 */
export function usePaneOnScreen<Element extends HTMLElement>(enabled: boolean): PaneOnScreen<Element> {
  const ref = useRef<Element>(null);
  const [observed, setObserved] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || element === null) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setObserved(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      const latest = entries.at(-1);
      if (latest !== undefined) setObserved(isShownOnScreen(latest));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled]);

  return { ref, onScreen: !enabled || observed };
}
