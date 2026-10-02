import { useContext } from 'react';
import type { WorkspacePane } from '#engine/workspace.ts';
import { PaneMenu } from '#hosts/shared/PaneHeaderParts.tsx';
import { PaneNameInTabContext } from '#hosts/shared/pane-name-in-tab.ts';
import { BLANK_PANE_META } from '../analyzer-registry.ts';
import { blankPaneMenuItems, type WorkspacePaneRuntime } from '../pane-runtime.ts';

/**
 * 余白のペイン。何も表示せず、並びの空きを埋めるだけ。
 * 見出しは他のペインと同じ作りで、名前はタブが持つ時は出さず（タブを隠した表示・縦積みでは枠の中に出す）、
 * 拡大表示・複製・閉じるを⋯に置く。
 */
export function BlankWorkspacePane({
  pane,
  runtime,
}: {
  readonly pane: WorkspacePane;
  readonly runtime: WorkspacePaneRuntime;
}) {
  const nameInTab = useContext(PaneNameInTabContext);
  return (
    <section className="pane-blank" aria-label={BLANK_PANE_META.name} data-blank-pane="true">
      <header className="pane-blank-header">
        <h2 className={nameInTab ? 'pane-visually-hidden' : 'pane-blank-title'}>{BLANK_PANE_META.name}</h2>
        <PaneMenu paneName={BLANK_PANE_META.name} items={blankPaneMenuItems(runtime, pane.id)} />
      </header>
    </section>
  );
}
