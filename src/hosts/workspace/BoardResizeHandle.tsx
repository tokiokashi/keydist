import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { boardResizeBounds, resolveBoardHeightRem, type BoardResizeBounds } from '#engine/workspace-board.ts';

/**
 * 板の下端のつまみ（#833）。ドラッグ・矢印キーで板の高さを変え、ダブルクリックで1画面（自動）へ戻す。
 * 板の高さの範囲と丸めは `engine/workspace-board.ts`（純粋な層）が持ち、ここは測って渡し、結果を返すだけ。
 *
 * 高さの単位はremで、`aria-valuenow/min/max` もremの数値。保存値とペインの下限がどちらもremなので、
 * 読み上げられる値と保存値が同じ単位で並ぶ。
 *
 * ドラッグの間は保存せず、`onPreview` で見た目だけを動かす。離した時に1回だけ `onCommit` で保存する
 * （途中を保存すると、元に戻す操作の履歴がドラッグの途中の数だけ積まれる）。
 */
export interface BoardResizeHandleProps {
  /** 板の入れ物。高さと、画面の下端までの高さを測る。 */
  readonly areaRef: RefObject<HTMLElement | null>;
  /** 配置が要る最小の高さ [rem]（ペインの下限の和 + 余白）。 */
  readonly minRem: number;
  /** ドラッグ中の見た目の高さ。`null`で終わり（保存値へ戻る）。`rem`が`undefined`なら1画面。 */
  readonly onPreview: (preview: { readonly rem: number | undefined } | null) => void;
  /** 保存する高さ。`undefined`は保存を消して1画面へ戻す。 */
  readonly onCommit: (rem: number | undefined) => void;
}

/** 矢印キーで動かす量と、PageUp/PageDownで動かす量 [rem]。 */
const ARROW_STEP_REM = 2;
const PAGE_STEP_REM = 10;

interface Measured {
  readonly currentRem: number;
  readonly oneScreenRem: number;
  readonly rootPx: number;
}

/** 板の今の高さと、1画面ぶんの高さ（板の上端から画面の下端まで）を測る。 */
function measure(area: HTMLElement): Measured {
  const rootPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const top = (area.parentElement ?? area).getBoundingClientRect().top + window.scrollY;
  return {
    currentRem: area.getBoundingClientRect().height / rootPx,
    oneScreenRem: Math.max(0, (window.innerHeight - top) / rootPx),
    rootPx,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface Drag {
  readonly pointerId: number;
  /** 掴んだ時の、ページ上のy（スクロールを含む）[px]。 */
  readonly startPageY: number;
  readonly startRem: number;
  readonly bounds: BoardResizeBounds;
  readonly rootPx: number;
  /** 離した時に保存する値。動いていなければ`'none'`。 */
  result: number | undefined | 'none';
}

export function BoardResizeHandle({ areaRef, minRem, onPreview, onCommit }: BoardResizeHandleProps) {
  const [shown, setShown] = useState<{ readonly now: number; readonly min: number; readonly max: number } | null>(null);
  const dragRef = useRef<Drag | null>(null);

  const refresh = useCallback(() => {
    const area = areaRef.current;
    if (area === null) return;
    const m = measure(area);
    const bounds = boardResizeBounds(minRem, m.oneScreenRem, m.currentRem);
    setShown({ now: round2(m.currentRem), min: round2(bounds.minRem), max: bounds.maxRem });
  }, [areaRef, minRem]);

  // 板の高さ・窓の大きさ・配置が変わるたびに測り直す（aria-valuenow/minを現状に合わせる）
  useEffect(() => {
    refresh();
    const area = areaRef.current;
    const observer = area === null ? undefined : new ResizeObserver(refresh);
    if (area !== null) observer?.observe(area);
    window.addEventListener('resize', refresh);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', refresh);
    };
  }, [areaRef, refresh]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const area = areaRef.current;
    if (area === null) return;
    const m = measure(area);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startPageY: event.clientY + window.scrollY,
      startRem: m.currentRem,
      bounds: boardResizeBounds(minRem, m.oneScreenRem, m.currentRem),
      rootPx: m.rootPx,
      result: 'none',
    };
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    // ドラッグ中にページをスクロールしても板の下端がつまみに付いてくるよう、ページ上のyで測る
    const dy = event.clientY + window.scrollY - drag.startPageY;
    drag.result = resolveBoardHeightRem(drag.startRem + dy / drag.rootPx, drag.bounds);
    onPreview({ rem: drag.result });
  };

  const finish = (event: PointerEvent<HTMLDivElement>, apply: boolean) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    onPreview(null);
    if (apply && drag.result !== 'none') onCommit(drag.result);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const area = areaRef.current;
    if (area === null) return;
    const m = measure(area);
    const bounds = boardResizeBounds(minRem, m.oneScreenRem, m.currentRem);
    // つまみは板の下端にあるので、下へ動かすと板が高くなる
    const delta: Readonly<Record<string, number>> = {
      ArrowDown: ARROW_STEP_REM,
      ArrowUp: -ARROW_STEP_REM,
      PageDown: PAGE_STEP_REM,
      PageUp: -PAGE_STEP_REM,
    };
    let requested: number | undefined;
    if (event.key in delta) requested = m.currentRem + delta[event.key]!;
    else if (event.key === 'Home') requested = bounds.minRem;
    else if (event.key === 'End') requested = bounds.maxRem;
    if (requested === undefined) return;
    event.preventDefault();
    onCommit(resolveBoardHeightRem(requested, bounds));
  };

  return (
    <div
      className="workspace-board-handle"
      role="separator"
      aria-orientation="horizontal"
      aria-label="板の高さ"
      aria-valuenow={shown?.now}
      aria-valuemin={shown?.min}
      aria-valuemax={shown?.max}
      tabIndex={0}
      title="ドラッグか上下の矢印キーで板の高さを変える。ダブルクリックで1画面に戻す"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event, true)}
      onPointerCancel={(event) => finish(event, false)}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onCommit(undefined)}
    />
  );
}
