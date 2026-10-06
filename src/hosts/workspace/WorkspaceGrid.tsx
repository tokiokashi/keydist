import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import ReactGridLayout, { verticalCompactor, type Compactor, type Layout, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { compactGrid, GRID_COLS, gridPaneIds, resolveOverlaps, type GridItem, type WorkspaceGrid } from '#engine/workspace-grid.ts';
import { PaneHeaderLeadContext, PaneNameInLeadContext } from '#hosts/shared/pane-name-in-lead.ts';
import { InfoButton, type InfoHelp } from '#ui/primitives/info-button.tsx';
import { GRID_MARGIN_PX, GRID_PADDING_PX, GRID_ROW_HEIGHT_PX, minGridSize } from './grid-metrics.ts';
import './workspace-grid.css';

export interface WorkspaceGridProps {
  readonly grid: WorkspaceGrid;
  /** ペインのidから、Analyzerのid（大きさの下限を引く）。 */
  readonly analyzerIdOf: (paneId: string) => string;
  readonly titleOf: (paneId: string) => string;
  /** ⓘに出す短い説明。空ならⓘを出さない。 */
  readonly descriptionOf: (paneId: string) => string;
  readonly helpOf: (paneId: string) => InfoHelp | undefined;
  readonly renderPane: (paneId: string) => ReactNode;
  /**
   * 拡大表示しているペイン。保存しない見た目だけの状態で、格子の並び（x・y・w・h）は書き換えない。
   * 拡大している間は、そのペインを面いっぱいに見せ、ドラッグ・大きさの変更を止め、他のペインを操作できなくする。
   */
  readonly maximizedId?: string | undefined;
  /**
   * 空いた所へペインを上に詰めるか。詰めない時も、ペインを動かして重なった相手は下へ押す
   * （ライブラリの押しのけは`compactor`の種類と別に働く）。
   * 詰める設定にした直後は、保存した並びに空きが残っていても、描く時にライブラリが詰める。保存した並びは書き換えない。
   */
  readonly compact: boolean;
  /** 人がドラッグ・大きさの変更を終えた。 */
  readonly onGridChange: (grid: WorkspaceGrid) => void;
}

/**
 * 格子を置く面の幅。測るまで`null`で、その間は格子を描かない（ライブラリの既定は幅1280で最初の1コマを描き、
 * 測った後に幅が変わるので、開いた直後にペインが縮んで見える）。
 *
 * 描くたびに、描画の前（layout effect）にも測り直す。縦のスクロールバーが幅を取る環境では、格子を描いて
 * ページが伸びるとスクロールバーが出て面が狭くなる。この測り直しなら、その幅を最初の描画の前に取り込める
 * （`scrollbar-gutter`で右を空けておく方法は、スクロールバーが出ない時にも右が空き、他の配置の幅も変えるので採らない）。
 * 幅が同じなら状態は変わらず、再描画は起きない。
 */
function useGridAreaWidth(): { readonly width: number | null; readonly containerRef: RefObject<HTMLDivElement | null> } {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (node === null) return;
    const next = Math.round(node.clientWidth);
    setWidth((prev) => (prev === next ? prev : next));
  });
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (node === null) return undefined;
    const observer = new ResizeObserver(() => {
      const next = Math.round(node.clientWidth);
      setWidth((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { width, containerRef };
}

/**
 * 格子を描いて最初の1コマが出た後に`true`。それまでは配置の動き（200ms）を止める（`workspace-grid.css`）。
 * 幅を測り直すために描画の前に配置を測ると、ライブラリの動きがその時点の幅から始まってしまい、
 * 測り直した後の幅へ縮む動きが見える。最初の1コマを出すまでは動かさず、実際の幅のまま現れさせる。
 */
function useAfterFirstPaint(ready: boolean): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!ready) return undefined;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setDone(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [ready]);
  return done;
}

function toLayoutItem(item: GridItem, analyzerId: string, containerWidth: number): LayoutItem {
  const min = minGridSize(analyzerId, containerWidth);
  // 保存済みの幅・高さが下限より小さくても、他の辺を引いた時に広がらないよう、下限は今の幅・高さまでに留める
  return { i: item.id, x: item.x, y: item.y, w: item.w, h: item.h, minW: Math.min(min.w, item.w), minH: Math.min(min.h, item.h) };
}

/**
 * 詰めない時の整え方。上へは動かさず、重なりだけを下へ解く。ライブラリの`noCompactor`は何も整えないので、
 * 大きさを変える・動かす操作の途中でペインが重なって描かれる（押しのけの検査は、動かした向きによって抜ける）。
 * 規則は指を離した後に資産へ書く時の重なりの解き方（`resolveOverlaps`）と同じにして、離した瞬間に位置が飛ばないようにする。
 */
const resolveOverlapsCompactor: Compactor = {
  type: null,
  allowOverlap: false,
  compact(layout) {
    const resolved = new Map(resolveOverlaps(fromLayout(layout)).map((item) => [item.id, item.y] as const));
    return layout.map((item) => ({ ...item, y: resolved.get(item.i) ?? item.y }));
  },
};

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
export function WorkspaceGrid({ grid, analyzerIdOf, titleOf, descriptionOf, helpOf, renderPane, maximizedId, compact, onGridChange }: WorkspaceGridProps) {
  const { width, containerRef } = useGridAreaWidth();
  const mounted = width !== null;
  const animated = useAfterFirstPaint(mounted);
  const maximized = maximizedId !== undefined;
  useMaximizedBounds(containerRef, maximized);
  useCloseFloatingOfOthers(containerRef, maximizedId);
  // 詰める時は、ライブラリへ渡す並びも詰めた形にする。ライブラリは渡された並びが変わった時だけ内部の並びを作り直すので、
  // 詰める→詰めないへ戻した時に、詰めた形が内部に残らないよう、渡す並び自体を切り替える（保存した並びは書き換えない）
  const displayGrid = useMemo(() => (compact ? compactGrid(grid) : grid), [compact, grid]);
  const layout = useMemo(
    () => displayGrid.map((item) => toLayoutItem(item, analyzerIdOf(item.id), width ?? 0)),
    [displayGrid, analyzerIdOf, width],
  );
  // 拡大中は、有効・無効だけを切り替える（部品の木が変わらず、ペインが作り直されない）
  const dragConfig = useMemo(
    () => ({ enabled: !maximized, handle: '.workspace-drag-handle', cancel: 'button, a, input, select, textarea' }),
    [maximized],
  );
  const resizeConfig = useMemo(() => ({ enabled: !maximized, handles: ['s', 'e', 'w', 'se'] as const }), [maximized]);
  return (
    <div ref={containerRef} className="workspace-grid-area" data-maximized={maximized || undefined} data-animated={animated || undefined}>
      {mounted ? (
        <ReactGridLayout
          width={width ?? 0}
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
          compactor={compact ? verticalCompactor : resolveOverlapsCompactor}
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
              <PaneShell paneId={id} title={titleOf(id)} description={descriptionOf(id)} help={helpOf(id)} draggable>
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
 * 拡大した時に、他のペインが開いている浮いた部品（解析設定の小窓・対象の選択・ⓘ・メニューなど）を閉じる。
 * 小窓などはbodyへportalで出るので、背面のペインの`inert`が届かず、拡大したペインの上に残って操作できてしまう。
 * 各部品の持ち主は自分の開閉ボタンなので、そのボタンを押して持ち主自身に閉じさせる。
 * 押すのは、押すと閉じることが確かなものだけ。`aria-expanded`の全部を押すと、ⓘのマウスを乗せて出ているだけの説明
 * （`aria-expanded`は真だが、押すと「出したまま」になる）が逆に残る。図の表示などペインの中に開く部品は、`inert`が届くので押さない。
 */
const CLOSABLE_BY_CLICK = '[aria-haspopup][aria-expanded="true"], .pane-settings-button[aria-expanded="true"], .info-button[data-pinned]';
function useCloseFloatingOfOthers(areaRef: { readonly current: HTMLElement | null }, maximizedId: string | undefined): void {
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (maximizedId === undefined || area === null) return;
    for (const item of area.querySelectorAll<HTMLElement>('.workspace-grid-item')) {
      if (item.getAttribute('data-pane-id') === maximizedId) continue;
      for (const button of item.querySelectorAll<HTMLElement>(CLOSABLE_BY_CLICK)) button.click();
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
  help,
  draggable,
  children,
}: {
  readonly paneId: string;
  readonly title: string;
  readonly description: string;
  readonly help?: InfoHelp;
  readonly draggable: boolean;
  readonly children: ReactNode;
}) {
  const lead = (
    <div className="workspace-pane-lead">
      <div className={`workspace-pane-grab ${draggable ? 'workspace-drag-handle' : 'workspace-drag-static'}`} title={draggable ? `${title}（つかんで動かす）` : title}>
        {draggable ? <GripIcon /> : null}
        <span className="workspace-pane-lead-name">{title}</span>
      </div>
      {description === '' ? null : <InfoButton name={title} description={description} help={help} floating />}
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
