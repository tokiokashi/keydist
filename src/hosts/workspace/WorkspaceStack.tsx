import type { ReactNode } from 'react';
import type { InfoHelp } from '#ui/primitives/info-button.tsx';
import { PaneShell } from './WorkspaceGrid.tsx';
import './workspace-stack.css';

/**
 * スマホ幅でペインを縦に積む面。格子は使わない（1列に並べるだけで、動かす・大きさを変える操作は無い）。
 *
 * 並びは資産の格子を読み順（上→下・左→右）に読んだ順。格子は読むだけで書かないので、幅を戻すと元の並びで描き直される。
 * ペインの高さは、中身で決まる。
 */
export function WorkspaceStack({
  paneIds,
  titleOf,
  descriptionOf,
  helpOf,
  renderPane,
}: {
  readonly paneIds: readonly string[];
  readonly titleOf: (paneId: string) => string;
  readonly descriptionOf: (paneId: string) => string;
  readonly helpOf: (paneId: string) => InfoHelp | undefined;
  readonly renderPane: (paneId: string) => ReactNode;
}) {
  return (
    <div className="workspace-stack" data-workspace-stack="true">
      {paneIds.map((paneId) => (
        <section key={paneId} className="workspace-stack-pane" data-pane-id={paneId}>
          <PaneShell paneId={paneId} title={titleOf(paneId)} description={descriptionOf(paneId)} help={helpOf(paneId)} draggable={false}>
            {renderPane(paneId)}
          </PaneShell>
        </section>
      ))}
    </div>
  );
}
