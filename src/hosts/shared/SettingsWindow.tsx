import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

/**
 * 解析設定の小窓（docs/architecture.md「ペイン」の「解析設定は小窓で開く」）。
 *
 * - 非モーダル。背後を暗くせず、開いている間も図や他のペインを操作できる
 * - 見出しをドラッグして動かせる（図を見ながら値を変えられるように）
 * - Workspaceでは、どのペインの設定か分かるよう`paneName`を見出しに出す
 *
 * 個別画面とWorkspaceの両方で使うので`hosts/shared`に置き、Dockviewのフローティング
 * グループでは作らない（Dockviewは`hosts/workspace`だけが使う。依存の規則）。
 *
 * スマホ幅での出し方は未決（#636）。決まるまでの暫定として、狭い画面では下端に固定した
 * シート（高さは画面の半分まで・ドラッグなし）にする（`pane-frame.css`）。
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
  readonly children: ReactNode;
}

interface Position {
  readonly x: number;
  readonly y: number;
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

export function SettingsWindow({ open, onClose, paneName, anchor, onReset, children }: SettingsWindowProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | undefined>(undefined);
  const focusPendingRef = useRef(false);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | undefined>(undefined);

  // 開くたびにボタンの近くへ出し直す（前回ドラッグした位置は、閉じたら意味を失う）。
  useLayoutEffect(() => {
    if (!open) {
      setPosition(undefined);
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
      style={position === undefined
        ? { visibility: 'hidden' }
        : { ['--settings-window-x' as string]: `${position.x}px`, ['--settings-window-y' as string]: `${position.y}px` }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        className="settings-window-handle"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="settings-window-title">
          解析設定
          {paneName === undefined ? null : <span className="settings-window-pane">{paneName}</span>}
        </span>
        {onReset === undefined ? null : (
          <button
            type="button"
            className="settings-window-reset-all"
            title="対象と条件は変わらない"
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
