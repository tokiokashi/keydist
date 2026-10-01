import type { ReactNode } from 'react';
import { layoutPaneIds, type WorkspaceLayoutNode } from '#engine/workspace-layout.ts';
import './workspace-stack.css';

/**
 * スマホ幅でペインを縦に積む面。Dockviewは使わない（Dockviewの領域は親の高さで決まり、
 * ペインを積んでページをスクロールする形に向かない）。
 *
 * 並びは資産の配置（`layout`）を左→右・上→下に読んだ順で、Dockviewの並びと同じ読み順になる。
 * タブでまとめたペインは、タブの順に全部を積む（スマホ幅ではタブを使わず、どのペインも見える）。
 * 配置は読むだけで書かない。境目をまたいでも、Dockviewの並び・大きさは資産に残ったまま戻る。
 *
 * ペインの本体は、ここでは高さが中身で決まる。`workspace-dock.css` の「ペインの残りの高さ」を持たせる
 * 規則は `.workspace-pane` の中にだけ効くので、ここの本体は個別画面と同じ幅だけのcontainerのままになる
 * （本体を高さも測るcontainerにすると、高さが中身で決まる面では0に潰れる）。
 */
export function WorkspaceStack({
  layout,
  renderPane,
}: {
  readonly layout: WorkspaceLayoutNode;
  readonly renderPane: (paneId: string) => ReactNode;
}) {
  return (
    <div className="workspace-stack" data-workspace-stack="true">
      {layoutPaneIds(layout).map((paneId) => (
        <section key={paneId} className="workspace-stack-pane" data-pane-id={paneId}>
          {renderPane(paneId)}
        </section>
      ))}
    </div>
  );
}
