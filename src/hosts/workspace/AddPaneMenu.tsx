import { useEffect, useId, useRef, useState } from 'react';
import { BLANK_PANE_META, WORKSPACE_ANALYZERS, type WorkspaceAnalyzerEntry } from './analyzer-registry.ts';

/**
 * ペインの追加。押すとAnalyzerと余白のペインの一覧が開き、選んだペインを足す。
 * 見た目はペインの⋯のメニューと同じ部品のCSS（`pane-frame.css`）を使う。
 * `toolbar`は文脈バーの中に置く（バーが狭い時は文字を見た目から省き、＋だけにする。`context-bar.css`）。
 */
export function AddPaneMenu({
  onAdd,
  onAddBlank,
  variant = 'toolbar',
}: {
  readonly onAdd: (entry: WorkspaceAnalyzerEntry) => void;
  readonly onAddBlank: () => void;
  /** `empty`は、ペインが1つも無い時に中央へ大きく出す。 */
  readonly variant?: 'toolbar' | 'empty';
}) {
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

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={rootRef}
      className="pane-menu workspace-add-pane"
      data-variant={variant}
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
        className="workspace-add-pane-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="ペインを追加"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="workspace-add-pane-plus" aria-hidden="true">＋</span>
        <span className="workspace-add-pane-label">ペインを追加</span>
      </button>
      {open ? (
        <div className="pane-menu-list" role="menu" id={menuId} aria-label="追加するペイン">
          {WORKSPACE_ANALYZERS.map((entry) => (
            <button
              type="button"
              role="menuitem"
              key={entry.id}
              className="pane-menu-item"
              onClick={() => {
                onAdd(entry);
                close();
              }}
            >
              <span className="pane-menu-item-label">{entry.name}</span>
              <span className="pane-menu-item-description">{entry.description}</span>
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className="pane-menu-item"
            onClick={() => {
              onAddBlank();
              close();
            }}
          >
            <span className="pane-menu-item-label">{BLANK_PANE_META.name}</span>
            <span className="pane-menu-item-description">{BLANK_PANE_META.description}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
