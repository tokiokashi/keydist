import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type ReactNode, type RefObject } from 'react';
import ReactGridLayout, { verticalCompactor, type Compactor, type Layout, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { compactGrid, gridPaneIds, gridWithMovedPane, gridWithResizedPane, resolveOverlaps, type GridColumnRange, type GridItem, type WorkspaceGrid } from '#engine/workspace-grid.ts';
import { PaneHeaderLeadContext, PaneNameInLeadContext } from '#hosts/shared/pane-name-in-lead.ts';
import { InfoButton, type InfoHelp } from '#ui/primitives/info-button.tsx';
import {
  extendedReach,
  GRID_MARGIN_PX,
  GRID_PADDING_PX,
  GRID_ROW_HEIGHT_PX,
  gridCols,
  gridWidthPx,
  minGridSize,
  rightmostCol,
  visibleColRange,
} from './grid-metrics.ts';
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
  /**
   * 面の今見えている列の範囲を読む関数の置き場。ペインを足す・複製する側が、見えている範囲に置くために読む
   * （横にスクロールした位置を知るのは面だけ）。面が無い間は`null`。
   */
  readonly visibleRangeRef?: MutableRefObject<(() => GridColumnRange) | null>;
}

/** ドラッグ・大きさの変更の間、ポインタが面の左右の端からこの距離（px）以内にあると面を横にスクロールする。 */
const EDGE_SCROLL_ZONE_PX = 48;
/** その間に1コマごとにスクロールする量（px）。 */
const EDGE_SCROLL_STEP_PX = 24;

function pointerOf(event: Event): { readonly x: number; readonly y: number } | null {
  if ('clientX' in event) return { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };
  const touch = (event as TouchEvent).touches?.[0];
  return touch === undefined ? null : { x: touch.clientX, y: touch.clientY };
}

/**
 * ドラッグ・大きさの変更の間、ポインタが面の左右の端に近ければ面を横にスクロールする（ライブラリは自動ではスクロールしない）。
 * スクロールした分だけ枠の位置も動かすため、ポインタが止まっていても動き続けるよう、同じ位置のマウスの移動を流し直す。
 */
function useEdgeScroll(areaRef: { readonly current: HTMLElement | null }, active: boolean, pointerRef: { readonly current: { readonly x: number; readonly y: number } | null }): void {
  useEffect(() => {
    if (!active) return undefined;
    let frame = 0;
    const tick = () => {
      const area = areaRef.current;
      const pointer = pointerRef.current;
      if (area !== null && pointer !== null) {
        const rect = area.getBoundingClientRect();
        const delta = pointer.x > rect.right - EDGE_SCROLL_ZONE_PX ? EDGE_SCROLL_STEP_PX : pointer.x < rect.left + EDGE_SCROLL_ZONE_PX ? -EDGE_SCROLL_STEP_PX : 0;
        if (delta !== 0) {
          const before = area.scrollLeft;
          area.scrollLeft = before + delta;
          if (area.scrollLeft !== before) {
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: pointer.x, clientY: pointer.y, bubbles: true }));
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [areaRef, active, pointerRef]);
}

/**
 * 格子を置く面の幅。測るまで`null`で、その間は格子を描かない（ライブラリの既定は幅1280で最初の1コマを描き、
 * 測った後に幅が変わるので、開いた直後にペインが動いて見える）。
 *
 * 面の幅から決まるのは、面に収まる列の数（と、横にスクロールするか）だけで、ペインの画素の幅は変わらない。
 * 縦のスクロールバーが後から出て面が狭くなった時も、観測の通知で測り直す。
 */
function useGridAreaWidth(): { readonly width: number | null; readonly containerRef: RefObject<HTMLDivElement | null> } {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (node === null) return undefined;
    const measure = () => {
      const next = Math.round(node.clientWidth);
      setWidth((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { width, containerRef };
}

/**
 * 面が横にスクロールするかどうかが切り替わる時に、縦の表示位置を引き継ぐ。
 * 横にスクロールしない間は縦のスクロールがページにあり、横にスクロールする間は面の中にある（`workspace-grid.css`）。
 * 切り替わった直後はどちらも先頭へ戻るので、直前の位置を、ページ→面、面→ページへ写す。
 * 同じ列の同じ行がポインタの下に残るので、ドラッグ・大きさの変更の途中に切り替わっても、動かしている枠は別の行へ動かない。
 * 直前の位置は、スクロールのたびに控えておく（切り替わった後には読めないため）。
 */
function useKeepVerticalView(areaRef: { readonly current: HTMLElement | null }, scrollsX: boolean): void {
  const last = useRef({ pageY: 0, areaY: 0 });
  const previous = useRef(scrollsX);
  useEffect(() => {
    const area = areaRef.current;
    const onPage = () => {
      last.current.pageY = window.scrollY;
    };
    const onArea = () => {
      last.current.areaY = area?.scrollTop ?? 0;
    };
    window.addEventListener('scroll', onPage, { passive: true });
    area?.addEventListener('scroll', onArea, { passive: true });
    return () => {
      window.removeEventListener('scroll', onPage);
      area?.removeEventListener('scroll', onArea);
    };
  }, [areaRef]);
  useLayoutEffect(() => {
    if (previous.current === scrollsX) return;
    previous.current = scrollsX;
    const area = areaRef.current;
    if (area === null) return;
    if (scrollsX) {
      area.scrollTop = last.current.pageY;
      window.scrollTo(window.scrollX, 0);
    } else {
      window.scrollTo(window.scrollX, last.current.areaY);
    }
    last.current = { pageY: window.scrollY, areaY: area.scrollTop };
  }, [areaRef, scrollsX]);
}

/**
 * 格子を描いて最初の1コマが出た後に`true`。それまでは配置の動き（200ms）を止める（`workspace-grid.css`）。
 * 最初の1コマを出すまでは動かさず、置かれた位置のまま現れさせる。
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

function toLayoutItem(item: GridItem, analyzerId: string): LayoutItem {
  const min = minGridSize(analyzerId);
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

/** つかみ所をキーボードで操作する説明。つかみ所の読み上げと、ホバーの題に使う。 */
const KEYBOARD_HINT = '矢印キーで1マスずつ動かし、Shiftを押しながら矢印キーで大きさを変えます。';

const ARROW_STEP: Readonly<Record<string, { readonly dx: number; readonly dy: number }>> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

/**
 * つかみ所にフォーカスがある時の矢印キーで、並びを1マス分変えた結果。矢印キー以外・修飾キー（Shift以外）つきは`undefined`。
 * 矢印キーは動かす、Shift+矢印キーは右下の角を動かして大きさを変える（右・下が広げる、左・上が縮める）。
 */
function gridAfterArrowKey(
  grid: WorkspaceGrid,
  paneId: string,
  event: { readonly key: string; readonly shiftKey: boolean; readonly altKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean },
  min: { readonly w: number; readonly h: number },
  compact: boolean,
): WorkspaceGrid | undefined {
  const step = ARROW_STEP[event.key];
  if (step === undefined || event.altKey || event.ctrlKey || event.metaKey) return undefined;
  return event.shiftKey ? gridWithResizedPane(grid, paneId, step.dx, step.dy, min, compact) : gridWithMovedPane(grid, paneId, step.dx, step.dy, compact);
}

/** 操作の結果を読み上げる文。列と行は1から数える。 */
function describeItem(title: string, item: GridItem): string {
  return `${title}: 左から${item.x + 1}列目、上から${item.y + 1}行目、幅${item.w}、高さ${item.h}`;
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
export function WorkspaceGrid({ grid, analyzerIdOf, titleOf, descriptionOf, helpOf, renderPane, maximizedId, compact, onGridChange, visibleRangeRef }: WorkspaceGridProps) {
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
    () => displayGrid.map((item) => toLayoutItem(item, analyzerIdOf(item.id))),
    [displayGrid, analyzerIdOf],
  );
  // 列の数は、面に収まる数と並びの右端の大きい方。操作の間は、動かしている枠が右端に届くたびに伸ばす
  const [reach, setReach] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const pointerRef = useRef<{ readonly x: number; readonly y: number } | null>(null);
  useEdgeScroll(containerRef, interacting, pointerRef);
  const cols = gridCols(width ?? 0, rightmostCol(displayGrid), reach);
  const canvasWidth = gridWidthPx(cols);
  const scrollsX = width !== null && canvasWidth > width;
  useKeepVerticalView(containerRef, scrollsX);
  useLayoutEffect(() => {
    if (visibleRangeRef === undefined) return undefined;
    visibleRangeRef.current = () => {
      const area = containerRef.current;
      return area === null ? { start: 0, end: cols } : visibleColRange(area.scrollLeft, area.clientWidth);
    };
    return () => {
      visibleRangeRef.current = null;
    };
  }, [visibleRangeRef, containerRef, cols]);
  const onMove = useCallback((_layout: Layout, _old: LayoutItem | null, item: LayoutItem | null, _placeholder: LayoutItem | null, event: Event) => {
    pointerRef.current = pointerOf(event);
    if (item !== null) setReach((current) => extendedReach(cols, item.x + item.w, current));
  }, [cols]);
  const onStart = useCallback(() => setInteracting(true), []);
  const finishInteraction = useCallback(() => {
    setInteracting(false);
    setReach(0);
    pointerRef.current = null;
  }, []);
  // 拡大中は、有効・無効だけを切り替える（部品の木が変わらず、ペインが作り直されない）
  const dragConfig = useMemo(
    () => ({ enabled: !maximized, handle: '.workspace-drag-handle', cancel: 'button, a, input, select, textarea' }),
    [maximized],
  );
  const [announcement, setAnnouncement] = useState('');
  const onPaneKeyDown = useCallback((paneId: string, event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return;
    const next = gridAfterArrowKey(grid, paneId, event, minGridSize(analyzerIdOf(paneId)), compact);
    if (next === undefined) return;
    // 矢印キーでページがスクロールしないようにする（端で動かせない時も同じ）
    event.preventDefault();
    if (next === grid) return;
    keyboardPaneRef.current = paneId;
    onGridChange(next);
    const item = next.find((candidate) => candidate.id === paneId);
    if (item !== undefined) setAnnouncement(describeItem(titleOf(paneId), item));
  }, [grid, analyzerIdOf, compact, onGridChange, titleOf]);
  const keyboardPaneRef = useRef<string | undefined>(undefined);
  // キーボードで並びを変えた直後は、ペインの並び（読み順）が入れ替わってつかみ所からフォーカスが外れることがある。外れていれば戻し、見える位置へ寄せる
  useLayoutEffect(() => {
    const paneId = keyboardPaneRef.current;
    if (paneId === undefined) return;
    keyboardPaneRef.current = undefined;
    const handle = containerRef.current?.querySelector<HTMLElement>(`.workspace-grid-item[data-pane-id="${CSS.escape(paneId)}"] .workspace-drag-handle`);
    if (handle === null || handle === undefined) return;
    if (document.activeElement !== handle) handle.focus({ preventScroll: true });
    handle.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [grid, containerRef]);
  const resizeConfig = useMemo(() => ({ enabled: !maximized, handles: ['s', 'e', 'w', 'se'] as const }), [maximized]);
  return (
    <div
      ref={containerRef}
      className="workspace-grid-area"
      data-maximized={maximized || undefined}
      data-animated={animated || undefined}
      data-scrolls-x={scrollsX || undefined}
    >
      {mounted ? (
        <div className="workspace-grid-canvas" style={{ width: canvasWidth }}>
          <ReactGridLayout
            width={canvasWidth}
            layout={layout}
            gridConfig={{
              cols,
              rowHeight: GRID_ROW_HEIGHT_PX,
              margin: [GRID_MARGIN_PX, GRID_MARGIN_PX],
              containerPadding: [GRID_PADDING_PX, GRID_PADDING_PX],
            }}
            dragConfig={dragConfig}
            // 大きさを変えるつかみは下の辺（高さだけ）・右の辺と左の辺（幅だけ）・右下の角（幅と高さ）の4つ
            resizeConfig={resizeConfig}
            compactor={compact ? verticalCompactor : resolveOverlapsCompactor}
            onDragStart={onStart}
            onResizeStart={onStart}
            onDrag={onMove}
            onResize={onMove}
            onDragStop={(next) => {
              finishInteraction();
              onGridChange(fromLayout(next));
            }}
            onResizeStop={(next) => {
              finishInteraction();
              onGridChange(fromLayout(next));
            }}
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
                <PaneShell
                  paneId={id}
                  title={titleOf(id)}
                  description={descriptionOf(id)}
                  help={helpOf(id)}
                  draggable
                  onHandleKeyDown={maximized ? undefined : onPaneKeyDown}
                >
                  {renderPane(id)}
                </PaneShell>
              </div>
            ))}
          </ReactGridLayout>
        </div>
      ) : null}
      <div className="workspace-visually-hidden" role="status" aria-live="polite">{announcement}</div>
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
 * 拡大した時に、他のペインが開いている浮いた部品（解析設定の小窓・図の表示の小窓・対象の選択・ⓘ・メニューなど）を閉じる。
 * 小窓などはbodyへportalで出るので、背面のペインの`inert`が届かず、拡大したペインの上に残って操作できてしまう。
 * 各部品の持ち主は自分の開閉ボタンなので、そのボタンを押して持ち主自身に閉じさせる。
 * 押すのは、押すと閉じることが確かなものだけ。`aria-expanded`の全部を押すと、ⓘのマウスを乗せて出ているだけの説明
 * （`aria-expanded`は真だが、押すと「出したまま」になる）が逆に残る。図の表示の小窓の開閉ボタンは`aria-haspopup`を持つので、この選択で押される。
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
  onHandleKeyDown,
  children,
}: {
  readonly paneId: string;
  readonly title: string;
  readonly description: string;
  readonly help?: InfoHelp;
  readonly draggable: boolean;
  /** つかみ所にフォーカスがある時のキー入力。渡すと、つかみ所がTabで届き、矢印キーで動かす・大きさを変える。 */
  readonly onHandleKeyDown?: (paneId: string, event: ReactKeyboardEvent<HTMLElement>) => void;
  readonly children: ReactNode;
}) {
  const hintId = useId();
  const lead = (
    <div className="workspace-pane-lead">
      <div
        className={`workspace-pane-grab ${draggable ? 'workspace-drag-handle' : 'workspace-drag-static'}`}
        title={draggable ? `${title}（つかんで動かす）${onHandleKeyDown === undefined ? '' : `。${KEYBOARD_HINT}`}` : title}
        {...(draggable && onHandleKeyDown !== undefined
          ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': `${title}の位置と大きさ`,
            'aria-describedby': hintId,
            onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => onHandleKeyDown(paneId, event),
          }
          : {})}
      >
        {draggable ? <GripIcon /> : null}
        <span className="workspace-pane-lead-name">{title}</span>
        {draggable && onHandleKeyDown !== undefined ? <span id={hintId} className="workspace-visually-hidden">{KEYBOARD_HINT}</span> : null}
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
