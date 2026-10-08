import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { MOBILE_QUERY } from '#ui/theme/breakpoints.ts';

/**
 * 解析設定の小窓（docs/architecture.md「ペイン」の「解析設定は小窓で開く」）。
 *
 * - 非モーダル。背後を暗くせず、開いている間も図や他のペインを操作できる
 * - 見出しをドラッグして動かせる（図を見ながら値を変えられるように）
 * - Workspaceでは、どのペインの設定か分かるよう`paneName`を見出しに出す
 *
 * 個別画面とWorkspaceの両方で使うので`hosts/shared`に置き、ペインを並べる面のライブラリの
 * 部品では作らない（ライブラリは`hosts/workspace`だけが使う。依存の規則）。
 *
 * スマホ幅（`SHEET_QUERY`）では、画面の下から出るシートにする（`pane-frame.css`）。高さは画面の半分まで。
 * 上端の掴みとヘッダー行を下へドラッグすると閉じる（×とEscapeでも閉じる。掴みはタッチ専用の見た目で、Tabや読み上げの対象にしない）。ドラッグを掴みとヘッダー行に
 * 限るのは、本文のスクロールとドラッグが喧嘩しないようにするため。シートが「解析設定」ボタンを覆っても、
 * ドラッグで閉じられるので、ボタンを押し直して閉じる必要はない。
 */
export interface SettingsWindowProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Workspaceのペイン名（読み上げ用の名前と同じもの）。個別画面ではページに1枚なので出さない。 */
  readonly paneName?: string;
  /** 開いた時に小窓を寄せる基準（見出しの「解析設定」ボタン）。 */
  readonly anchor: HTMLElement | null;
  /** 解析設定をすべて初期値へ戻す。あればヘッダー行（タイトルと閉じるボタンの間）に文字ボタンを出す。 */
  readonly onReset?: () => void;
  /** 「すべて初期値に戻す」のtitle。省略は「対象と条件は変わらない」。 */
  readonly resetTitle?: string;
  readonly children: ReactNode;
}

interface Position {
  readonly x: number;
  readonly y: number;
}

/** シートにする幅。縦積み・見出し1行と同じスマホ幅の境目（`ui/theme/breakpoints.ts`）。 */
const SHEET_QUERY = MOBILE_QUERY;
/** シートの高さのこの割合を超えて引き下ろしたら閉じる。 */
const CLOSE_RATIO = 1 / 3;
/** これより速い下向きのフリック（px/ms）なら、距離が足りなくても閉じる。 */
const FLICK_SPEED = 0.6;
/** 最後のmoveからこれ以上経って離したら、指は止まっていたとみなす（ms）。 */
const STALE_MS = 100;

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** 画面の端から最低限これだけ内側に残す（見出しを掴めなくならないように）。 */
const EDGE = 8;

function clamp(position: Position, element: HTMLElement | null): Position {
  const width = element?.offsetWidth ?? 320;
  const height = element?.offsetHeight ?? 200;
  const maxX = Math.max(EDGE, window.innerWidth - width - EDGE);
  // 下端は見出しが残る範囲まで許す（本文が長い時に上へ寄せすぎない）。
  const maxY = Math.max(EDGE, window.innerHeight - Math.min(height, 48) - EDGE);
  return {
    x: Math.min(Math.max(position.x, EDGE), maxX),
    y: Math.min(Math.max(position.y, EDGE), maxY),
  };
}

function initialPosition(anchor: HTMLElement | null, element: HTMLElement | null): Position {
  const width = element?.offsetWidth ?? 320;
  if (anchor === null) return clamp({ x: window.innerWidth - width - 24, y: 80 }, element);
  const rect = anchor.getBoundingClientRect();
  // ボタンの右端に小窓の右端を揃え、ボタンのすぐ下に出す。
  return clamp({ x: rect.right - width, y: rect.bottom + 6 }, element);
}

export function SettingsWindow({ open, onClose, paneName, anchor, onReset, resetTitle = '対象と条件は変わりません', children }: SettingsWindowProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | undefined>(undefined);
  const focusPendingRef = useRef(false);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | undefined>(undefined);
  const isSheet = useMediaQuery(SHEET_QUERY);
  // シートを引き下ろしている量（px）。undefinedは触っていない状態。
  const [sheetY, setSheetY] = useState<number | undefined>(undefined);
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetDragRef = useRef<{ pointerId: number; startY: number; lastY: number; lastTime: number; speed: number } | undefined>(undefined);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | undefined>(undefined);

  // 開くたびにボタンの近くへ出し直す（前回ドラッグした位置は、閉じたら意味を失う）。
  useLayoutEffect(() => {
    // 閉じ終わる前に開き直した時、遅れて来る閉じる処理が新しいシートを閉じないようにする。
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = undefined;
    if (!open) {
      setPosition(undefined);
      setSheetY(undefined);
      setSheetDragging(false);
      sheetDragRef.current = undefined;
      closingRef.current = false;
      return;
    }
    setPosition(initialPosition(anchor, windowRef.current));
    focusPendingRef.current = true;
  }, [open, anchor]);

  // フォーカスは位置が決まって見えるようになってから移す。測る間の`visibility: hidden`の要素へは
  // フォーカスが入らず、開いた直後のEscapeで閉じられなくなるため。
  useEffect(() => {
    if (position === undefined || !focusPendingRef.current) return;
    focusPendingRef.current = false;
    windowRef.current?.focus();
  }, [position]);

  // 画面の大きさが変わっても見出しを掴める範囲に留める。
  useEffect(() => {
    if (!open) return undefined;
    const onResize = () => setPosition((current) => (current === undefined ? current : clamp(current, windowRef.current)));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  if (!open) return null;

  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const closeSheet = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const height = windowRef.current?.offsetHeight ?? 0;
    if (prefersReducedMotion() || height === 0) {
      onClose();
      return;
    }
    // 下へ出し切ってから閉じる。transitionendが来ない場合（非表示など）に備えて時間でも閉じる。
    setSheetY(height);
    closeTimerRef.current = window.setTimeout(onClose, 250);
  };

  const onSheetPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || closingRef.current) return;
    if ((event.target as Element).closest('button')) return;
    sheetDragRef.current = { pointerId: event.pointerId, startY: event.clientY, lastY: event.clientY, lastTime: event.timeStamp, speed: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSheetDragging(true);
  };
  const onSheetPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = sheetDragRef.current;
    if (drag === undefined || drag.pointerId !== event.pointerId) return;
    const dt = event.timeStamp - drag.lastTime;
    if (dt > 0) drag.speed = (event.clientY - drag.lastY) / dt;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;
    // 上へは動かさない（元の位置より上にはシートの居場所が無い）。
    setSheetY(Math.max(0, event.clientY - drag.startY));
  };
  const onSheetPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = sheetDragRef.current;
    if (drag === undefined || drag.pointerId !== event.pointerId) return;
    sheetDragRef.current = undefined;
    setSheetDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    // 引いたあと指を止めていたなら、フリックではない（最後のmoveの速さを持ち越さない）。
    const speed = event.timeStamp - drag.lastTime > STALE_MS ? 0 : drag.speed;
    const distance = Math.max(0, event.clientY - drag.startY);
    const height = windowRef.current?.offsetHeight ?? 0;
    const cancelled = event.type === 'pointercancel';
    if (!cancelled && (distance > height * CLOSE_RATIO || (distance > 0 && speed > FLICK_SPEED))) closeSheet();
    else setSheetY(undefined);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || position === undefined) return;
    // 閉じるボタンを押した時はドラッグにしない。
    if ((event.target as Element).closest('button')) return;
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - position.x, offsetY: event.clientY - position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === undefined || drag.pointerId !== event.pointerId) return;
    setPosition(clamp({ x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY }, windowRef.current));
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const title = paneName === undefined ? '解析設定' : `解析設定 — ${paneName}`;

  // bodyへ出す。ペインの枠はcontainer（レイアウト封じ込め）なので、中に置くと
  // position: fixedが画面ではなくペインを基準にしてしまう。
  return createPortal(
    <div
      ref={windowRef}
      className="settings-window"
      role="dialog"
      aria-modal="false"
      aria-label={title}
      tabIndex={-1}
      data-settings-window="true"
      data-sheet={isSheet || undefined}
      data-sheet-dragging={sheetDragging || undefined}
      style={position === undefined
        ? { visibility: 'hidden' }
        : {
            ['--settings-window-x' as string]: `${position.x}px`,
            ['--settings-window-y' as string]: `${position.y}px`,
            ...(isSheet && sheetY !== undefined ? { ['--settings-sheet-y' as string]: `${sheetY}px` } : {}),
          }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {isSheet ? (
        <div
          className="settings-sheet-grabber"
          aria-hidden="true"
          onPointerDown={onSheetPointerDown}
          onPointerMove={onSheetPointerMove}
          onPointerUp={onSheetPointerEnd}
          onPointerCancel={onSheetPointerEnd}
        >
          <span className="settings-sheet-grabber-bar" />
        </div>
      ) : null}
      <div
        className="settings-window-handle"
        onPointerDown={isSheet ? onSheetPointerDown : onPointerDown}
        onPointerMove={isSheet ? onSheetPointerMove : onPointerMove}
        onPointerUp={isSheet ? onSheetPointerEnd : endDrag}
        onPointerCancel={isSheet ? onSheetPointerEnd : endDrag}
      >
        <span className="settings-window-title">
          解析設定
          {paneName === undefined ? null : <span className="settings-window-pane">{paneName}</span>}
        </span>
        {onReset === undefined ? null : (
          <button
            type="button"
            className="settings-window-reset-all"
            title={resetTitle}
            onClick={onReset}
          >
            すべて初期値に戻す
          </button>
        )}
        <button type="button" className="settings-window-close" aria-label="解析設定を閉じる" onClick={onClose}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="settings-window-body">{children}</div>
    </div>,
    document.body,
  );
}
