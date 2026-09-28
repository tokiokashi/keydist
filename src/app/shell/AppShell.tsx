import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ContextBarLeadingSlot } from '#hosts/shared/ContextBar.tsx';
import { Sidebar } from './Sidebar.tsx';
import {
  getServerSidebarPinnedSnapshot,
  getSidebarPinnedSnapshot,
  setSidebarPinned,
  subscribeSidebarPinned,
} from './sidebar-preference.ts';

/**
 * 全画面を載せる器（docs/architecture.md「画面の構成」）。サイドバーと本体を持つ。
 *
 * - パソコン幅: サイドバーは固定（常時表示）と固定解除を切り替えられる。固定解除の時は完全に隠し、
 *   左端に触れるか文脈バーのボタンで本体の上に重ねて出し、離れると引っ込む
 * - スマホ幅: 常に引き出し（固定は選べない）
 *
 * 見た目の切り替えは `<html data-sidebar>`（固定）とこのcomponentの `data-sidebar-open`（重ねて
 * 出しているか）でCSSが行う。固定の状態はプリレンダーの前から効くようhead scriptが付ける。
 */

/** スマホ幅の境目。CSS（shell.css・context-bar.css）の `@media (max-width: 760px)` と揃える。 */
const MOBILE_QUERY = '(max-width: 760px)';

function subscribeMobile(listener: () => void): () => void {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

function getMobileSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

export interface AppShellProps {
  readonly children: ReactNode;
  /** ページが自分で文脈バーを描くか（routeの `staticData.contextBar`）。 */
  readonly hasContextBar: boolean;
}

export function AppShell({ children, hasContextBar }: AppShellProps) {
  const pinnedPreference = useSyncExternalStore(subscribeSidebarPinned, getSidebarPinnedSnapshot, getServerSidebarPinnedSnapshot);
  const mobile = useSyncExternalStore(subscribeMobile, getMobileSnapshot, () => false);
  const pinned = pinnedPreference && !mobile;
  const [open, setOpen] = useState(false);
  const visible = pinned || open;
  const asideRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const focusOnOpenRef = useRef(false);

  // 幅が変わって固定に戻ったら、重ねて出していた状態は捨てる。
  useEffect(() => {
    if (pinned) setOpen(false);
  }, [pinned]);

  useEffect(() => {
    if (!open) return undefined;
    if (focusOnOpenRef.current) {
      focusOnOpenRef.current = false;
      asideRef.current?.querySelector<HTMLElement>('a[aria-current="page"], a')?.focus();
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (asideRef.current?.contains(target) || toggleRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = (
    <button
      ref={(element) => { toggleRef.current = element; }}
      type="button"
      className="shell-sidebar-toggle"
      aria-label="サイドバーを開く"
      title="サイドバーを開く"
      aria-controls="app-sidebar"
      aria-expanded={open}
      onClick={() => {
        focusOnOpenRef.current = !open;
        setOpen((current) => !current);
      }}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
        <path d="M6 2.75v10.5" />
      </svg>
    </button>
  );

  return (
    <div className="shell" data-sidebar-open={open ? 'true' : undefined}>
      {/* 固定を外している時、左端に触れると重ねて出す。 */}
      <div className="shell-edge" aria-hidden="true" onPointerEnter={() => { if (!mobile) setOpen(true); }} />
      <aside
        ref={asideRef}
        id="app-sidebar"
        className="app-sidebar"
        aria-label="サイドバー"
        inert={!visible}
        onPointerLeave={(event) => {
          if (!pinned && !mobile && event.pointerType === 'mouse') setOpen(false);
        }}
        onBlur={(event) => {
          // キーボードでサイドバーの外へ出たら引っ込める。
          if (pinned) return;
          const next = event.relatedTarget as Node | null;
          if (next !== null && !asideRef.current?.contains(next) && !toggleRef.current?.contains(next)) setOpen(false);
        }}
      >
        <Sidebar
          pinned={pinned}
          onPinnedChange={(next) => {
            setSidebarPinned(next);
            setOpen(false);
          }}
          onNavigate={() => { if (!pinned) setOpen(false); }}
        />
      </aside>
      {mobile && open ? <div className="shell-scrim" aria-hidden="true" onClick={() => setOpen(false)} /> : null}

      <ContextBarLeadingSlot.Provider value={toggle}>
        <div className="shell-body">
          {hasContextBar ? null : <div className="shell-bar">{toggle}</div>}
          <main className="app-shell">{children}</main>
        </div>
      </ContextBarLeadingSlot.Provider>
    </div>
  );
}
