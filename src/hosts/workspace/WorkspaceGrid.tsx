import { useLayoutEffect, useMemo, type ReactNode } from 'react';
import ReactGridLayout, { useContainerWidth, verticalCompactor, type Layout, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { GRID_COLS, gridPaneIds, type GridItem, type WorkspaceGrid } from '#engine/workspace-grid.ts';
import { PaneHeaderLeadContext, PaneNameInLeadContext } from '#hosts/shared/pane-name-in-lead.ts';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import { GRID_MARGIN_PX, GRID_PADDING_PX, GRID_ROW_HEIGHT_PX, minGridSize } from './grid-metrics.ts';
import './workspace-grid.css';

export interface WorkspaceGridProps {
  readonly grid: WorkspaceGrid;
  /** ペインのidから、Analyzerのid（大きさの下限を引く）。 */
  readonly analyzerIdOf: (paneId: string) => string;
  readonly titleOf: (paneId: string) => string;
  /** ⓘに出す短い説明。空ならⓘを出さない。 */
  readonly descriptionOf: (paneId: string) => string;
  readonly renderPane: (paneId: string) => ReactNode;
  /**
   * 拡大表示しているペイン。保存しない見た目だけの状態で、格子の並び（x・y・w・h）は書き換えない。
   * 拡大している間は、そのペインを面いっぱいに見せ、ドラッグ・大きさの変更を止め、他のペインを操作できなくする。
   */
  readonly maximizedId?: string | undefined;
  /** 人がドラッグ・大きさの変更を終えた。 */
  readonly onGridChange: (grid: WorkspaceGrid) => void;
}

function toLayoutItem(item: GridItem, analyzerId: string): LayoutItem {
  const min = minGridSize(analyzerId);
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
export function WorkspaceGrid({ grid, analyzerIdOf, titleOf, descriptionOf, renderPane, maximizedId, onGridChange }: WorkspaceGridProps) {
  const { width, containerRef, mounted } = useContainerWidth();
  const maximized = maximizedId !== undefined;
  useMaximizedBounds(containerRef, maximized);
  useCloseFloatingOfOthers(containerRef, maximizedId);
  const layout = useMemo(
    () => grid.map((item) => toLayoutItem(item, analyzerIdOf(item.id))),
    [grid, analyzerIdOf],
  );
  // 拡大中は、有効・無効だけを切り替える（部品の木が変わらず、ペインが作り直されない）
  const dragConfig = useMemo(
    () => ({ enabled: !maximized, handle: '.workspace-drag-handle', cancel: 'button, a, input, select, textarea' }),
    [maximized],
  );
  const resizeConfig = useMemo(() => ({ enabled: !maximized, handles: ['s', 'e', 'w', 'se'] as const }), [maximized]);
  return (
    <div ref={containerRef} className="workspace-grid-area" data-maximized={maximized || undefined}>
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
          dragConfig={dragConfig}
          // 大きさを変えるつかみは下の辺（高さだけ）・右の辺と左の辺（幅だけ）・右下の角（幅と高さ）の4つ
          resizeConfig={resizeConfig}
          compactor={verticalCompactor}
          onDragStop={(next) => onGridChange(fromLayout(next))}
          onResizeStop={(next) => onGridChange(fromLayout(next))}
        >
          {/* DOMの順は画面の読み順（上→下・左→右）。Tabと読み上げの順が見た目と合う */}
          {gridPaneIds(grid).map((id) => (
            // 拡大中の他のペインは、背面に残したまま操作できなくする（フォーカスも入らない）
            <div
              key={id}
              className="workspace-grid-item"
              data-pane-id={id}
              data-maximized={id === maximizedId || undefined}
              inert={maximized && id !== maximizedId}
            >
              <PaneShell paneId={id} title={titleOf(id)} description={descriptionOf(id)} draggable>
                {renderPane(id)}
              </PaneShell>
            </div>
          ))}
        </ReactGridLayout>
      ) : null}
    </div>
  );
}

/**
 * 拡大中のペインを置く範囲（文脈バーの下から、面の左端・画面の右下まで）を、面の要素のCSS変数へ書く。
 * ライブラリはペインをtransformで配置するので、拡大したペインは`position: fixed`で面の上に重ね、
 * 範囲だけここで測る。文脈バーの高さ（狭いと2段になる）と、サイドバーを固定しているかによる左端が、画面の幅で変わるため。
 */
function useMaximizedBounds(areaRef: { readonly current: HTMLElement | null }, maximized: boolean): void {
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!maximized || area === null) return undefined;
    const bar = document.querySelector('.context-bar');
    const measure = () => {
      area.style.setProperty('--maximize-top', `${bar === null ? 0 : bar.getBoundingClientRect().bottom}px`);
      area.style.setProperty('--maximize-left', `${area.getBoundingClientRect().left}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    if (bar !== null) observer.observe(bar);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [areaRef, maximized]);
}

/**
 * 拡大した時に、他のペインが開いている浮いた部品（解析設定の小窓・対象の選択・ⓘ・メニュー・図の表示など）を閉じる。
 * 小窓などはbodyへportalで出るので、背面のペインの`inert`が届かず、拡大したペインの上に残って操作できてしまう。
 * 各部品の持ち主は自分の開閉ボタン（`aria-expanded="true"`）なので、そのボタンを押して持ち主自身に閉じさせる。
 */
function useCloseFloatingOfOthers(areaRef: { readonly current: HTMLElement | null }, maximizedId: string | undefined): void {
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (maximizedId === undefined || area === null) return;
    for (const item of area.querySelectorAll<HTMLElement>('.workspace-grid-item')) {
      if (item.getAttribute('data-pane-id') === maximizedId) continue;
      for (const button of item.querySelectorAll<HTMLElement>('[aria-expanded="true"]')) button.click();
    }
  }, [areaRef, maximizedId]);
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
 * ペイン1枚の枠。題の行は持たず、ペインの見出しの先頭に、つかみ所（絵）・Analyzer名・ⓘを置く。
 * つかんで動かせるのは絵と名前で、ⓘは押せる（つかみ所から除く）。
 * `draggable`でない面（縦積み）では、つかみ所の絵と手の形を出さない。
 */
export function PaneShell({
  paneId,
  title,
  description,
  draggable,
  children,
}: {
  readonly paneId: string;
  readonly title: string;
  readonly description: string;
  readonly draggable: boolean;
  readonly children: ReactNode;
}) {
  const lead = (
    <div className="workspace-pane-lead">
      <div className={`workspace-pane-grab ${draggable ? 'workspace-drag-handle' : 'workspace-drag-static'}`} title={draggable ? `${title}（つかんで動かす）` : title}>
        {draggable ? <GripIcon /> : null}
        <span className="workspace-pane-lead-name">{title}</span>
      </div>
      {description === '' ? null : <InfoButton name={title} description={description} floating />}
    </div>
  );
  return (
    <div className="workspace-pane" data-pane-id={paneId} data-draggable={draggable || undefined}>
      <div className="workspace-pane-scroll">
        <PaneNameInLeadContext.Provider value>
          <PaneHeaderLeadContext.Provider value={lead}>{children}</PaneHeaderLeadContext.Provider>
        </PaneNameInLeadContext.Provider>
      </div>
    </div>
  );
}
