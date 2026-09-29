import { useEffect, useId, useRef, useState } from 'react';

/**
 * ペインの見出しに置く小さな部品（⋯のメニュー）。
 * ⓘの説明はペインの外（Analyzerの図の横）でも使うので `ui/primitives/info-button.tsx` に置く。
 */

export interface PaneMenuItem {
  readonly id: string;
  readonly label: string;
  /** 押すと何が変わり、何が変わらないかの短い説明。 */
  readonly description?: string;
  readonly onSelect: () => void;
}

/** ペインへの操作（⋯）。 */
export function PaneMenu({ paneName, items }: { readonly paneName: string; readonly items: readonly PaneMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    // 開いたら先頭の項目へフォーカスを移す（キーボードでそのまま選べるように）。
    rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (items.length === 0) return null;

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={rootRef}
      className="pane-menu"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="pane-icon-button pane-menu-button"
        aria-label={`${paneName}の操作`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="3.5" cy="8" r="1.3" fill="currentColor" />
          <circle cx="8" cy="8" r="1.3" fill="currentColor" />
          <circle cx="12.5" cy="8" r="1.3" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div className="pane-menu-list" role="menu" id={menuId} aria-label={`${paneName}の操作`}>
          {items.map((item) => (
            <button
              type="button"
              role="menuitem"
              key={item.id}
              className="pane-menu-item"
              onClick={() => {
                item.onSelect();
                close();
              }}
            >
              <span className="pane-menu-item-label">{item.label}</span>
              {item.description === undefined ? null : (
                <span className="pane-menu-item-description">{item.description}</span>
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** 解析設定を開くボタンのアイコン（狭いペインではアイコンだけにする）。 */
export function SettingsIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10" cy="4.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="6" cy="11.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
