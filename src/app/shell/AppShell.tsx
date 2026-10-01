import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ContextBarLeadingSlot } from '#hosts/shared/ContextBar.tsx';
import { PresetFileIoContext, type PresetFileIo } from '#hosts/shared/preset-file-io.ts';
import { downloadJson } from '#platform/browser-download.ts';
import { readTextFile } from '#platform/browser-file.ts';
import { AddedToWorkspaceNotice } from '../workspace/AddedToWorkspaceNotice.tsx';
import { DeletedWorkspaceNotice } from '../workspace/DeletedWorkspaceNotice.tsx';
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

/** プリセットの書き出し・読み込みのブラウザ実装。条件のモーダルがどの画面でも使えるよう、シェルで渡す。 */
const PRESET_FILE_IO: PresetFileIo = { saveJson: downloadJson, readText: readTextFile };

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

/**
 * 重ねて出したきっかけ。左端に触れて出した時（`hover`）は、本体で入力中のフォーカスを奪わない
 * よう本体を操作不能にしない。ボタンやスマホの引き出し（`button`）では、フォーカスをサイドバーに
 * 閉じ込めるため本体を操作不能（inert）にする。
 */
type OpenedBy = 'hover' | 'button';

export function AppShell({ children, hasContextBar }: AppShellProps) {
  const pinnedPreference = useSyncExternalStore(subscribeSidebarPinned, getSidebarPinnedSnapshot, getServerSidebarPinnedSnapshot);
  const mobile = useSyncExternalStore(subscribeMobile, getMobileSnapshot, () => false);
  const pinned = pinnedPreference && !mobile;
  const [openedBy, setOpenedBy] = useState<OpenedBy | undefined>(undefined);
  const open = openedBy !== undefined;
  const visible = pinned || open;
  const asideRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const focusAsideRef = useRef(false);
  const focusToggleRef = useRef(false);

  /** 閉じる。サイドバーの中にフォーカスがあったら、閉じた後に開くボタンへ戻す（inertで落ちるため）。 */
  const close = useCallback(() => {
    if (asideRef.current?.contains(document.activeElement)) focusToggleRef.current = true;
    setOpenedBy(undefined);
  }, []);

  // 幅が変わって固定に戻ったら、重ねて出していた状態は捨てる。
  useEffect(() => {
    if (pinned) setOpenedBy(undefined);
  }, [pinned]);

  // 閉じた後・固定を外した後のフォーカスの戻し先。ボタンはCSSで出し入れするので、描画の後に移す。
  useEffect(() => {
    if (!focusToggleRef.current || open || pinned) return;
    focusToggleRef.current = false;
    toggleRef.current?.focus();
  }, [open, pinned]);

  useEffect(() => {
    if (!open) return undefined;
    if (focusAsideRef.current) {
      focusAsideRef.current = false;
      const aside = asideRef.current;
      (aside?.querySelector<HTMLElement>('a[aria-current="page"]') ?? aside?.querySelector<HTMLElement>('a'))?.focus();
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // 暗幕は自分のclickで閉じる（下の暗幕の説明）。
      if (asideRef.current?.contains(target) || toggleRef.current?.contains(target)) return;
      if ((target as Element).closest?.('.shell-scrim')) return;
      close();
    };
    // パソコン幅で重ねて出している間は、ポインタがサイドバーの外へ出たら引っ込める。
    // asideのpointerleaveに頼ると、滑り出しの途中で一度も中に入らずに離れた時に閉じない。
    // 幅は変形（滑り出し）の影響を受けないoffsetWidthで見る。
    const onPointerMove = (event: PointerEvent) => {
      if (mobile || event.pointerType !== 'mouse') return;
      const aside = asideRef.current;
      if (aside === null) return;
      if (event.clientX > aside.offsetWidth + 16) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, mobile, close]);

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
        if (open) {
          close();
          return;
        }
        focusAsideRef.current = true;
        setOpenedBy('button');
      }}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
        <path d="M6 2.75v10.5" />
      </svg>
    </button>
  );

  // スマホの引き出しとボタンで重ねて出した時は、本体を操作不能にしてTabでも本体へ抜けないようにする。
  const bodyInert = open && (mobile || openedBy === 'button');

  return (
    <div className="shell" data-sidebar-open={open ? 'true' : undefined}>
      {/* 固定を外している時、左端に触れると重ねて出す。 */}
      <div
        className="shell-edge"
        aria-hidden="true"
        onPointerEnter={() => {
          if (!mobile && !open) setOpenedBy('hover');
        }}
      />
      <aside
        ref={asideRef}
        id="app-sidebar"
        className="app-sidebar"
        aria-label="サイドバー"
        inert={!visible}
        onBlur={(event) => {
          // 左端に触れて出した時は本体が操作できるので、フォーカスが外へ出たら引っ込める。
          if (pinned) return;
          const next = event.relatedTarget as Node | null;
          if (next !== null && !asideRef.current?.contains(next)) setOpenedBy(undefined);
        }}
      >
        <Sidebar
          pinned={pinned}
          onPinnedChange={(next) => {
            // 固定を外すとサイドバーは隠れて操作できなくなるので、フォーカスを開くボタンへ移す。
            if (!next) focusToggleRef.current = true;
            setSidebarPinned(next);
            setOpenedBy(undefined);
          }}
          onNavigate={() => {
            if (!pinned) close();
          }}
        />
      </aside>
      {/* pointerdownで閉じると、暗幕が消えた後にmousedownの既定動作がフォーカスをBODYへ落とし、
          開くボタンへ戻したフォーカスを上書きする。そのため暗幕はclickで閉じ、mousedownでは
          フォーカスを動かさない（サイドバー内にあったフォーカスがcloseで開くボタンへ戻る）。 */}
      {mobile && open ? (
        <div className="shell-scrim" aria-hidden="true" onMouseDown={(event) => event.preventDefault()} onClick={close} />
      ) : null}

      <ContextBarLeadingSlot.Provider value={toggle}>
        <PresetFileIoContext.Provider value={PRESET_FILE_IO}>
          <div className="shell-body" inert={bodyInert}>
            {hasContextBar ? null : <div className="shell-bar">{toggle}</div>}
            <main className="app-shell">{children}</main>
          </div>
        </PresetFileIoContext.Provider>
      </ContextBarLeadingSlot.Provider>
      <div className="shell-notices">
        <DeletedWorkspaceNotice />
        <AddedToWorkspaceNotice />
      </div>
    </div>
  );
}
