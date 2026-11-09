import { useCallback, useLayoutEffect, useState, type MutableRefObject } from 'react';

/**
 * 要素の幅 [px]と、測る要素に付けるrefを返す。まだ測っていない間の幅は `undefined`。
 * 測る要素は、対象が無い間は描かれず、後から現れることがある。要素の取り付けと取り外しに追従するため、要素をstateで持つ。
 * 返すrefは `target` にも同じ要素を入れるので、呼び出し側は `target.current` で要素を読める。
 */
export function useElementWidth<T extends HTMLElement>(target: MutableRefObject<T | null>): readonly [number | undefined, (element: T | null) => void] {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);
  const attach = useCallback(
    (next: T | null) => {
      target.current = next;
      setElement(next);
    },
    [target],
  );
  useLayoutEffect(() => {
    if (element === null) {
      setWidth(undefined);
      return;
    }
    const measure = () => setWidth(Math.floor(element.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [width, attach];
}
