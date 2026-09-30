import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
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
import { fromDockviewLayout, PANE_COMPONENT, toDockviewLayout } from './layout-adapter.ts';
import './workspace-dock.css';
import './workspace-fit.css';

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
  readonly renderPane: (paneId: string) => ReactNode;
  /** タブの帯を出さない（ペインの見出しだけにする）。 */
  readonly hideTabs: boolean;
  /** 人が並びを変えた結果。 */
  readonly onLayoutChange: (layout: WorkspaceLayoutNode) => void;
  /** 人がタブでペインを閉じた。 */
  readonly onPaneClosed: (paneId: string) => void;
  /** 待っている並びの書き込みを今すぐ行う関数を渡す（Undoの直前に呼ぶ）。 */
  readonly registerFlush: (flush: (() => void) | undefined) => void;
}

/** 並びの変更を資産へ書くまでの間引き（ミリ秒）。ドラッグ・リサイズの途中を書かない。 */
const LAYOUT_COMMIT_DELAY_MS = 250;

/** 領域の大きさが測れない時（描画の直後）の仮の大きさ。重みの比だけが意味を持つ。 */
const FALLBACK_SIZE = { width: 1000, height: 600 } as const;

const PaneRenderContext = createContext<(paneId: string) => ReactNode>(() => null);

function DockPane({ params }: IDockviewPanelProps<{ paneId: string }>) {
  const render = useContext(PaneRenderContext);
  return <div className="workspace-pane">{render(params.paneId)}</div>;
}

const COMPONENTS = { [PANE_COMPONENT]: DockPane };

/** ペインの間の余白（画素）。実物を見て決める値（#627）。面の外周の余白と角丸は`workspace-dock.css`。 */
const PANE_GAP = 8;
const WORKSPACE_THEME = { ...themeLightSpaced, gap: PANE_GAP };

/** タブ。閉じるボタンの名前を日本語にするため、既定のタブを使わずに同じ形で持つ。 */
function WorkspaceTab({
  api,
  containerApi: _containerApi,
  params: _params,
  tabLocation: _tabLocation,
  ...rest
}: IDockviewPanelHeaderProps & HTMLAttributes<HTMLDivElement>) {
  const [title, setTitle] = useState(api.title);
  useEffect(() => {
    const subscription = api.onDidTitleChange((event) => setTitle(event.title));
    return () => subscription.dispose();
  }, [api]);
  return (
    <div {...rest} className="dv-default-tab">
      <span className="dv-default-tab-content">{title}</span>
      <button
        type="button"
        className="dv-default-tab-action"
        aria-label="閉じる"
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
    divergedRef.current = false;
    applyLayout();
  });

  return (
    <PaneRenderContext.Provider value={props.renderPane}>
      <div ref={containerRef} className="workspace-dock-area" data-hide-tabs={props.hideTabs || undefined}>
        <DockviewReact
          theme={WORKSPACE_THEME}
          components={COMPONENTS}
          defaultTabComponent={WorkspaceTab}
          singleTabMode="fullwidth"
          disableFloatingGroups
          announcements={false}
          onReady={onReady}
        />
      </div>
    </PaneRenderContext.Provider>
  );
}
