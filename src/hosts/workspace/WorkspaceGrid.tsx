import { useMemo, useState, type ReactNode } from 'react';
import ReactGridLayout, { useContainerWidth, verticalCompactor, type Layout, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { GRID_COLS, type GridItem, type WorkspaceGrid } from '#engine/workspace-grid.ts';
import { PaneHeaderLeadContext, PaneMenuSlotContext, PaneNameInTabContext } from '#hosts/shared/pane-name-in-tab.ts';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import { GRID_MARGIN_PX, GRID_PADDING_PX, GRID_ROW_HEIGHT_PX, minGridSize } from './grid-metrics.ts';
import './workspace-grid.css';

/**
 * ペインの見出しの出し方（試作で見比べるための切り替え。`?heading=`）。
 * - `bar`: ペインの一番上に1行の題（名前・ⓘ・⋯）を置き、そこをつかんで動かす
 * - `none`: 題の行を持たず、見出しの先頭の小さなつかみ（絵と名前）で動かす
 */
export type WorkspaceHeadingMode = 'bar' | 'none';

export interface WorkspaceGridProps {
  readonly grid: WorkspaceGrid;
  /** ペインのidから、Analyzerのid（大きさの下限を引く）。 */
  readonly analyzerIdOf: (paneId: string) => string;
  readonly titleOf: (paneId: string) => string;
  /** ⓘに出す短い説明。空ならⓘを出さない。 */
  readonly descriptionOf: (paneId: string) => string;
  readonly renderPane: (paneId: string) => ReactNode;
  readonly heading: WorkspaceHeadingMode;
  /** 人がドラッグ・大きさの変更を終えた。 */
  readonly onGridChange: (grid: WorkspaceGrid) => void;
}

function toLayoutItem(item: GridItem, analyzerId: string, titleBar: boolean): LayoutItem {
  const min = minGridSize(analyzerId, titleBar);
  return { i: item.id, x: item.x, y: item.y, w: item.w, h: item.h, minW: min.w, minH: min.h };
}

function fromLayout(layout: Layout): WorkspaceGrid {
  return layout.map((item) => ({ id: item.i, x: item.x, y: item.y, w: item.w, h: item.h }));
}

/**
 * ペインを並べる面（react-grid-layout）。ライブラリを使うのはこのファイルだけで、資産とペインの中身は
 * ライブラリの型を知らない。
 *
 * 正は資産の格子（`grid`）で、ライブラリには毎回その値を渡す。人の操作は、離した時（ドラッグ・大きさの変更の終わり）に
 * 1回だけ資産へ書く。途中の位置は書かないので、Undoは1操作につき1回で戻る。
 */
export function WorkspaceGrid({ grid, analyzerIdOf, titleOf, descriptionOf, renderPane, heading, onGridChange }: WorkspaceGridProps) {
  const { width, containerRef, mounted } = useContainerWidth();
  const titleBar = heading === 'bar';
  const layout = useMemo(
    () => grid.map((item) => toLayoutItem(item, analyzerIdOf(item.id), titleBar)),
    [grid, analyzerIdOf, titleBar],
  );
  return (
    <div ref={containerRef} className="workspace-grid-area" data-heading={heading}>
      {mounted ? (
        <ReactGridLayout
          width={width}
          layout={layout}
          gridConfig={{
            cols: GRID_COLS,
            rowHeight: GRID_ROW_HEIGHT_PX,
            margin: [GRID_MARGIN_PX, GRID_MARGIN_PX],
            containerPadding: [GRID_PADDING_PX, GRID_PADDING_PX],
          }}
          dragConfig={{ enabled: true, handle: '.workspace-drag-handle', cancel: 'button, a, input, select, textarea' }}
          // 角と、下・左右の辺で大きさを変える（上の辺は見出しの操作と重なるので使わない）
          resizeConfig={{ enabled: true, handles: ['se', 'sw', 's', 'e', 'w'] }}
          compactor={verticalCompactor}
          onDragStop={(next) => onGridChange(fromLayout(next))}
          onResizeStop={(next) => onGridChange(fromLayout(next))}
        >
          {grid.map((item) => (
            <div key={item.id} className="workspace-grid-item" data-pane-id={item.id}>
              <PaneShell
                paneId={item.id}
                title={titleOf(item.id)}
                description={descriptionOf(item.id)}
                heading={heading}
                draggable
              >
                {renderPane(item.id)}
              </PaneShell>
            </div>
          ))}
        </ReactGridLayout>
      ) : null}
    </div>
  );
}

/** つかみ所の絵（6つの点）。 */
function GripIcon() {
  return (
    <svg className="workspace-grip-icon" viewBox="0 0 12 16" width="10" height="14" aria-hidden="true">
      <g fill="currentColor">
        <circle cx="3" cy="3" r="1.2" /><circle cx="9" cy="3" r="1.2" />
        <circle cx="3" cy="8" r="1.2" /><circle cx="9" cy="8" r="1.2" />
        <circle cx="3" cy="13" r="1.2" /><circle cx="9" cy="13" r="1.2" />
      </g>
    </svg>
  );
}

/**
 * ペイン1枚の枠。見出しの方式に応じて、題の行か見出しの先頭のつかみを足す。
 * `draggable`でない面（縦積み）では、つかみ所の絵と手の形を出さない。
 */
export function PaneShell({
  paneId,
  title,
  description,
  heading,
  draggable,
  children,
}: {
  readonly paneId: string;
  readonly title: string;
  readonly description: string;
  readonly heading: WorkspaceHeadingMode;
  readonly draggable: boolean;
  readonly children: ReactNode;
}) {
  // 題の行の右端に⋯を出す先。要素が付いてから`PaneFrame`が描く
  const [menuSlot, setMenuSlot] = useState<HTMLElement | null>(null);
  const handleClass = draggable ? 'workspace-drag-handle' : 'workspace-drag-static';
  const lead = heading === 'none' ? (
    <div className={`workspace-pane-lead ${handleClass}`} title={draggable ? `${title}（つかんで動かす）` : title}>
      {draggable ? <GripIcon /> : null}
      <span className="workspace-pane-lead-name">{title}</span>
    </div>
  ) : null;
  return (
    <div className="workspace-pane" data-pane-id={paneId} data-heading={heading} data-draggable={draggable || undefined}>
      {heading === 'bar' ? (
        <div className="workspace-pane-bar">
          <div className={`workspace-pane-bar-title ${handleClass}`}>
            {draggable ? <GripIcon /> : null}
            <span className="workspace-pane-bar-name">{title}</span>
          </div>
          {description === '' ? null : <InfoButton name={title} description={description} floating />}
          <div ref={setMenuSlot} className="workspace-pane-bar-menu" />
        </div>
      ) : null}
      <div className="workspace-pane-scroll">
        <PaneNameInTabContext.Provider value>
          <PaneHeaderLeadContext.Provider value={lead}>
            <PaneMenuSlotContext.Provider value={heading === 'bar' ? menuSlot : null}>
              {children}
            </PaneMenuSlotContext.Provider>
          </PaneHeaderLeadContext.Provider>
        </PaneNameInTabContext.Provider>
      </div>
    </div>
  );
}
