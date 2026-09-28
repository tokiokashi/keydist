import { useEffect, useId, useRef, useState } from 'react';

/**
 * ペインの見出しに置く小さな部品（ⓘの説明と⋯のメニュー）。
 */

/**
 * Analyzerの短い説明を出すⓘ。hoverとフォーカスで出し、タップ（クリック）で出したままにする。
 * タップで開けるのは、タッチの端末にhoverが無いため。
 */
export function PaneInfoButton({ name, description }: { readonly name: string; readonly description: string }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const tooltipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const visible = hovered || pinned;

  // 出したままの説明は、外を押すかEscapeで閉じる（開いたままだと見出しの下の図に被るため）。
  useEffect(() => {
    if (!pinned) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPinned(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPinned(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pinned]);

  return (
    <span
      ref={rootRef}
      className="pane-info"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className="pane-icon-button pane-info-button"
        aria-label={`${name}の説明`}
        aria-expanded={visible}
        aria-describedby={visible ? tooltipId : undefined}
        onClick={() => setPinned((current) => !current)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onKeyDown={(event) => {
          // フォーカスで出した説明も、Escapeで閉じられるようにする（WCAG 1.4.13）。
          if (event.key === 'Escape') {
            setHovered(false);
            setPinned(false);
          }
        }}
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
        </svg>
      </button>
      {visible ? (
        <span className="pane-info-popover" role="tooltip" id={tooltipId} data-pane-description="true">
          {description}
        </span>
      ) : null}
    </span>
  );
}

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
    buttonRef.current?.focus();
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
