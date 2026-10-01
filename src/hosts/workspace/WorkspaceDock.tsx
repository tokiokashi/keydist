import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type RefObject,
  type ReactNode,
} from 'react';
import {
  DockviewReact,
  themeLightSpaced,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { sameLayout, type WorkspaceLayoutNode } from '#engine/workspace-layout.ts';
import { PaneNameInTabContext } from '#hosts/shared/pane-name-in-tab.ts';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import { fromDockviewLayout, PANE_COMPONENT, toDockviewLayout } from './layout-adapter.ts';
import { BoardResizeHandle } from './BoardResizeHandle.tsx';
import './workspace-dock.css';

/**
 * ペインを並べる面。Dockviewを使うのはこのファイルだけで、資産（保存データ）とペインの中身は
 * Dockviewの型を知らない（依存の向きは`test/architecture-layers.test.ts`が検査する）。
 *
 * 正は資産の配置（`layout`）。Dockviewは、その配置を描く道具として同期させる:
 * - 資産が変わったら（ペインの追加・複製・閉じる、Undo）、Dockviewの今の並びと比べ、違う時だけ
 *   `fromJSON`で描き直す。既にあるペインの部品は作り直さない（図の状態と計算の購読を保つ）
 * - 人がドラッグ・リサイズで並びを変えたら、Dockviewの形を自前の配置へ直し、資産へ書く（間引く）
 * - 人がタブの×でペインを閉じたら、閉じたペインを通知する（資産から取り除くのは呼び出し側）
 * 描き直しの間に出る変更の通知は、資産へ書き戻さない。
 */
export interface WorkspaceDockProps {
  /** 資産の配置。ペインが1つ以上ある時だけこのcomponentを使う。 */
  readonly layout: WorkspaceLayoutNode;
  /** 資産のペインのid（配置に載るものと同じ集まり）。 */
  readonly paneIds: readonly string[];
  /** タブに出す名前。 */
  readonly titleOf: (paneId: string) => string;
  /** タブのⓘに出す短い説明。空ならⓘを出さない。 */
  readonly descriptionOf: (paneId: string) => string;
  readonly renderPane: (paneId: string) => ReactNode;
  /** タブの帯を出さない（ペインの見出しだけにする）。 */
  readonly hideTabs: boolean;
  /** 人が並びを変えた結果。 */
  readonly onLayoutChange: (layout: WorkspaceLayoutNode) => void;
  /** 人がタブでペインを閉じた。 */
  readonly onPaneClosed: (paneId: string) => void;
  /** 待っている並びの書き込みを今すぐ行う関数を渡す（Undoの直前に呼ぶ）。 */
  readonly registerFlush: (flush: (() => void) | undefined) => void;
  /** 板の高さ [rem]。板は画面の高さとこの値の大きい方になる。無ければ1画面。 */
  readonly boardHeightRem: number | undefined;
  /** 配置が要る最小の板の高さ [rem]。下端のつまみで縮める時の下限になる。 */
  readonly minBoardHeightRem: number;
  /** 人が下端のつまみで板の高さを変えた。`undefined`は1画面（自動）へ戻す。 */
  readonly onBoardHeightChange: (rem: number | undefined) => void;
}

/** 並びの変更を資産へ書くまでの間引き（ミリ秒）。ドラッグ・リサイズの途中を書かない。 */
const LAYOUT_COMMIT_DELAY_MS = 250;

/** 領域の大きさが測れない時（描画の直後）の仮の大きさ。重みの比だけが意味を持つ。 */
const FALLBACK_SIZE = { width: 1000, height: 600 } as const;

const PaneRenderContext = createContext<(paneId: string) => ReactNode>(() => null);

/** タブを出しているか（タブが名前とⓘを持つか）と、タブのⓘの説明の引き方。 */
const TabContext = createContext<{
  readonly hideTabs: boolean;
  readonly descriptionOf: (paneId: string) => string;
}>({ hideTabs: false, descriptionOf: () => '' });

function DockPane({ params }: IDockviewPanelProps<{ paneId: string }>) {
  const render = useContext(PaneRenderContext);
  const { hideTabs } = useContext(TabContext);
  // タブが名前を出す間は、ペインの中の名前の行を出さない（見出しが1行になる。`pane-frame.css`）
  return (
    <PaneNameInTabContext.Provider value={!hideTabs}>
      <div className="workspace-pane" data-pane-id={params.paneId} data-name-in-tab={!hideTabs || undefined}>{render(params.paneId)}</div>
    </PaneNameInTabContext.Provider>
  );
}

const COMPONENTS = { [PANE_COMPONENT]: DockPane };

/** ペインの間の余白（画素）。実物を見て決める値（#627）。面の外周の余白と角丸は`workspace-dock.css`。 */
const PANE_GAP = 8;
const WORKSPACE_THEME = { ...themeLightSpaced, gap: PANE_GAP };

/**
 * このタブが、タブの帯の中でTabキーの止まる場所（Dockviewのロービングtabindexの0番）か。
 * Dockviewがタブの要素へ書く`tabindex`を読む（矢印・Home/End・選択のたびに動くので、属性の変化を見る）。
 */
function useIsRovingTabStop(innerRef: RefObject<HTMLElement | null>): boolean {
  const [stop, setStop] = useState(false);
  useEffect(() => {
    const tab = innerRef.current?.closest<HTMLElement>('.dv-tab');
    if (tab === null || tab === undefined) return undefined;
    const read = () => setStop(tab.tabIndex === 0);
    read();
    const observer = new MutationObserver(read);
    observer.observe(tab, { attributes: true, attributeFilter: ['tabindex'] });
    return () => observer.disconnect();
  }, [innerRef]);
  return stop;
}

/**
 * タブ。名前とⓘ（Analyzerの短い説明）を出し、右端に閉じるボタンを置く。
 * 閉じるボタンの名前を日本語にするため、既定のタブを使わずに同じ形で持つ。
 * ⓘの説明はタブの帯の外（body直下）へ出す（帯ははみ出しを切るので、中に出すと隠れる）。
 */
function WorkspaceTab({
  api,
  containerApi: _containerApi,
  params: _params,
  tabLocation: _tabLocation,
  ...rest
}: IDockviewPanelHeaderProps & HTMLAttributes<HTMLDivElement>) {
  const { descriptionOf } = useContext(TabContext);
  const description = descriptionOf(api.id);
  const rowRef = useRef<HTMLDivElement>(null);
  const tabStop = useIsRovingTabStop(rowRef);
  // ⓘと×は、タブの帯の中のTabで止まる場所を増やさないよう、今フォーカスの取れるタブ（ロービングの0番）の分だけ
  // Tabで届かせる。他のタブの分は、そのタブを選ぶと届く
  const innerTabIndex = tabStop ? 0 : -1;
  const [title, setTitle] = useState(api.title);
  useEffect(() => {
    const subscription = api.onDidTitleChange((event) => setTitle(event.title));
    return () => subscription.dispose();
  }, [api]);
  return (
    <div {...rest} ref={rowRef} className="dv-default-tab">
      <span className="dv-default-tab-content">{title}</span>
      {title !== undefined && description !== '' ? <InfoButton name={title} description={description} floating tabIndex={innerTabIndex} /> : null}
      <button
        type="button"
        className="dv-default-tab-action"
        aria-label="閉じる"
        tabIndex={innerTabIndex}
        onPointerDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          api.close();
        }}
      >
        <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export function WorkspaceDock(props: WorkspaceDockProps) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DockviewApi | undefined>(undefined);
  // fromJSONによる描き直しの最中に出る通知（ペインの取り外し等）は、人の操作ではない
  const syncingRef = useRef(false);
  const appliedHideTabsRef = useRef<boolean | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // 並びの変更を待っている間に、資産の配置が別の理由（Undo・他タブ・ペインの出入り）で変わったかを
  // 見分けるため、待ち始めた時点の資産の配置を覚える
  const scheduledAgainstRef = useRef<WorkspaceLayoutNode | undefined>(undefined);
  // ポインタを押している間（境界のドラッグ中）は書かない。途中で止まっても、離すまでは1回の操作として待つ
  const pointerDownRef = useRef(false);
  // Dockviewの並びを資産へ書いた直後。続けて（同じ操作の中で）資産が別の値へ変わり、結果として
  // 描画時のpropsが変わらないことがある（ドラッグを書いてすぐUndoすると、資産は元の値へ戻る）。
  // その時はDockviewだけが人の操作の結果のまま残るので、propsが変わらなくても資産に合わせ直す
  const divergedRef = useRef(false);
  // 直近に資産へ書いた並び。書いた直後（資産が書き戻ってくるまでの間）に人がまた並びを変える
  // （タブを続けて選ぶ等）と、戻ってきた資産は古い並びで、Dockviewの方が新しい。その時に資産へ合わせると、
  // 新しい操作を巻き戻してしまうので、見分けるために覚える
  const lastWrittenRef = useRef<WorkspaceLayoutNode | undefined>(undefined);
  const lastSyncedPropsRef = useRef<{
    readonly layout: WorkspaceLayoutNode;
    readonly paneIds: readonly string[];
    readonly hideTabs: boolean;
  } | undefined>(undefined);
  // 最後に資産と合わせた（描き直した・確かめた）時の面の大きさ。窓の大きさが変わって、ペインの最小幅などで
  // 比が動いた分を、人が並びを変えた操作と取り違えて書かないために使う
  const syncedSizeRef = useRef<{ readonly width: number; readonly height: number } | undefined>(undefined);
  const disposablesRef = useRef<{ dispose: () => void }[]>([]);

  const areaSize = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    return rect !== undefined && rect.width > 0 && rect.height > 0
      ? { width: rect.width, height: rect.height }
      : FALLBACK_SIZE;
  }, []);

  /** Dockviewに今あるペインのidが、資産のペインの集まりと同じか。 */
  const samePaneSet = useCallback((api: DockviewApi) => {
    const expected = propsRef.current.paneIds;
    return api.panels.length === expected.length && api.panels.every((panel) => expected.includes(panel.id));
  }, []);

  /** 資産の配置をDockviewへ合わせる。既に同じなら何もしない。 */
  const applyLayout = useCallback(() => {
    const api = apiRef.current;
    if (api === undefined) return;
    const { layout, paneIds, titleOf, hideTabs } = propsRef.current;
    const same = samePaneSet(api)
      && appliedHideTabsRef.current === hideTabs
      && sameLayout(fromDockviewLayout(api.toJSON(), paneIds), layout);
    if (same) return;
    // 資産に合わせて描き直すので、人の操作として待っていた並びの変更は捨てる（書くと、Undoなどの結果を
    // 古い並びで上書きしてしまう）
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
    const size = areaSize();
    syncedSizeRef.current = size;
    syncingRef.current = true;
    try {
      api.fromJSON(toDockviewLayout(layout, { ...size, titleOf, hideTabs }), { reuseExistingPanels: true });
      appliedHideTabsRef.current = hideTabs;
    } finally {
      syncingRef.current = false;
    }
  }, [areaSize, samePaneSet]);

  /**
   * 人が変えた並びを、資産と違う時だけ書く。ペインの出入りが絡む間は、ペインの操作に任せる。
   * `force`でない時は、ポインタを押している間は書かず、離すまで待つ。
   */
  const commitLayout = useCallback((force: boolean = false) => {
    timerRef.current = undefined;
    const api = apiRef.current;
    if (api === undefined || syncingRef.current) return;
    if (!force && pointerDownRef.current) {
      timerRef.current = setTimeout(() => commitLayout(), LAYOUT_COMMIT_DELAY_MS);
      return;
    }
    try {
      if (!samePaneSet(api)) return;
      // 面の大きさが変わっていたら、並びの変化は窓の大きさの変化に伴うもの。書かない
      const size = areaSize();
      const synced = syncedSizeRef.current;
      syncedSizeRef.current = size;
      if (synced !== undefined && (Math.abs(size.width - synced.width) > 1 || Math.abs(size.height - synced.height) > 1)) return;
      const { layout, paneIds, onLayoutChange } = propsRef.current;
      // 待っている間に資産の配置が変わっていたら、その変更が正。人の操作の結果で上書きしない
      if (layout !== scheduledAgainstRef.current) return;
      const current = fromDockviewLayout(api.toJSON(), paneIds);
      if (current !== undefined && !sameLayout(current, layout)) {
        divergedRef.current = true;
        lastWrittenRef.current = current;
        onLayoutChange(current);
      }
    } catch {
      // 破棄済みのDockviewを読んだ時（画面を離れる途中）。書かなくてよい
    }
  }, [samePaneSet, areaSize]);

  const flush = useCallback(() => {
    if (timerRef.current === undefined) return;
    clearTimeout(timerRef.current);
    commitLayout(true);
  }, [commitLayout]);

  useEffect(() => {
    props.registerFlush(flush);
    return () => {
      propsRef.current.registerFlush(undefined);
      // 離れる前に、待っている並びを書く
      flush();
    };
    // 登録し直すのは`flush`が変わる時だけ（`flush`は安定した参照）。`registerFlush`は最新のpropsから読む
  }, [flush]);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    disposablesRef.current = [
      event.api.onDidLayoutChange(() => {
        if (syncingRef.current) return;
        clearTimeout(timerRef.current);
        scheduledAgainstRef.current = propsRef.current.layout;
        timerRef.current = setTimeout(() => commitLayout(), LAYOUT_COMMIT_DELAY_MS);
      }),
      event.api.onDidRemovePanel((panel) => {
        if (!syncingRef.current) propsRef.current.onPaneClosed(panel.id);
      }),
    ];
    applyLayout();
  }, [applyLayout, commitLayout]);

  useEffect(() => {
    const onDown = () => { pointerDownRef.current = true; };
    const onUp = () => { pointerDownRef.current = false; };
    const container = containerRef.current;
    container?.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return () => {
      container?.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  }, []);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    for (const disposable of disposablesRef.current) disposable.dispose();
    disposablesRef.current = [];
    apiRef.current = undefined;
  }, []);

  // 資産の配置・ペインの集まり・タブの表示が変わったら、Dockviewを合わせる。毎回の描画の後に見るのは、
  // Dockviewの並びを書いた直後に資産が元の値へ戻ると、propsが変わらないまま資産とDockviewがずれるため
  useEffect(() => {
    const last = lastSyncedPropsRef.current;
    const changed = last === undefined
      || last.layout !== props.layout
      || last.paneIds !== props.paneIds
      || last.hideTabs !== props.hideTabs;
    lastSyncedPropsRef.current = { layout: props.layout, paneIds: props.paneIds, hideTabs: props.hideTabs };
    if (!changed && !divergedRef.current) return;
    // 自分が書いた並びが戻ってきただけで、待っている新しい並びの変更がある時は、描き直さない
    // （待っている変更が、次に資産へ書かれる）。Undoなど別の理由で資産が変わった時は、書いた並びと一致しない
    const written = lastWrittenRef.current;
    lastWrittenRef.current = undefined;
    const onlyLayoutChanged = last !== undefined && last.paneIds === props.paneIds && last.hideTabs === props.hideTabs;
    if (onlyLayoutChanged && timerRef.current !== undefined && written !== undefined && sameLayout(props.layout, written)) {
      divergedRef.current = false;
      // 待っている変更は「戻ってきた資産」を基準に書く。基準が古い資産のままだと、書く時に
      // 資産が変わったと見なされて捨てられ、新しい選択が保存されないまま残る
      scheduledAgainstRef.current = props.layout;
      return;
    }
    divergedRef.current = false;
    applyLayout();
  });

  // つまみをドラッグしている間だけ、保存前の高さで見せる
  const [boardPreview, setBoardPreview] = useState<{ readonly rem: number | undefined } | null>(null);
  const shownBoardHeightRem = boardPreview === null ? props.boardHeightRem : boardPreview.rem;

  const tabContext = useMemo(
    () => ({ hideTabs: props.hideTabs, descriptionOf: props.descriptionOf }),
    [props.hideTabs, props.descriptionOf],
  );

  return (
    <PaneRenderContext.Provider value={props.renderPane}>
      <TabContext.Provider value={tabContext}>
        <div
          ref={containerRef}
          className="workspace-dock-area"
          data-hide-tabs={props.hideTabs || undefined}
          style={shownBoardHeightRem === undefined ? undefined : ({ '--workspace-board-height': `${shownBoardHeightRem}rem` } as CSSProperties)}
        >
          <DockviewReact
            theme={WORKSPACE_THEME}
            components={COMPONENTS}
            defaultTabComponent={WorkspaceTab}
            singleTabMode="fullwidth"
            disableFloatingGroups
            announcements={false}
            onReady={onReady}
          />
          <BoardResizeHandle
            areaRef={containerRef}
            minRem={props.minBoardHeightRem}
            onPreview={setBoardPreview}
            onCommit={props.onBoardHeightChange}
          />
        </div>
      </TabContext.Provider>
    </PaneRenderContext.Provider>
  );
}
