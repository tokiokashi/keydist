import { useContext } from 'react';
import { createPortal } from 'react-dom';
import type { WorkspacePane } from '#engine/workspace.ts';
import { PaneMenu } from '#hosts/shared/PaneHeaderParts.tsx';
import { PaneHeaderLeadContext, PaneMenuSlotContext } from '#hosts/shared/pane-name-in-tab.ts';
import { BLANK_PANE_META } from '../analyzer-registry.ts';
import { blankPaneMenuItems, type WorkspacePaneRuntime } from '../pane-runtime.ts';

/**
 * 余白のペイン。何も表示せず、並びの空きを埋めるだけ。
 * 名前とつかみ所は、他のペインと同じく器（`PaneShell`）が出す。⋯は器が題の行を持つ時はそこへ、無ければ見出しの右端に置く。
 * 複製・閉じるを⋯に置く。
 */
export function BlankWorkspacePane({
  pane,
  runtime,
}: {
  readonly pane: WorkspacePane;
  readonly runtime: WorkspacePaneRuntime;
}) {
  const lead = useContext(PaneHeaderLeadContext);
  const menuSlot = useContext(PaneMenuSlotContext);
  const menu = <PaneMenu paneName={BLANK_PANE_META.name} items={blankPaneMenuItems(runtime, pane.id)} />;
  return (
    <section className="pane-blank" aria-label={BLANK_PANE_META.name} data-blank-pane="true">
      <header className="pane-blank-header">
        <h2 className="pane-frame-title pane-visually-hidden">{BLANK_PANE_META.name}</h2>
        {lead}
        {menuSlot === null ? menu : createPortal(menu, menuSlot)}
      </header>
    </section>
  );
}
