import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import { LayoutGroup, MotionConfig } from 'motion/react';
import type { KeyValueStorage } from '../persistence/storage.ts';
import type {
  WorkspacePanelDefinition,
  WorkspacePanelRegistry,
} from './panel-registry.ts';
import {
  createWorkspaceState,
  reconcileWorkspaceState,
  type WorkspaceStateV1,
} from './workspace-state.ts';
import {
  workspaceReducer,
  type WorkspaceAction,
} from './workspace-reducer.ts';
import {
  clampAllFloatingPanels,
  createWorkspacePersistenceScheduler,
  loadWorkspaceState,
  type WorkspacePersistenceScheduler,
} from './workspace-persistence.ts';

export interface WorkspaceRuntime {
  state: WorkspaceStateV1;
  dispatch: Dispatch<WorkspaceAction>;
  /**
   * mount後の一度きりの復元がまだ終わっていない（=このコミットの直後に一度でも終わる）間 true。
   * WorkspacePanel はこの間 Motion の layout アニメーションを止め、
   * docked既定値 → 復元後floatingへの見た目上の「飛行」を防ぐ。
   */
  restoring: boolean;
}

const WorkspaceContext = createContext<WorkspaceRuntime | null>(null);

export interface UseWorkspaceOptions {
  /** テスト用の差し替え。省略時は window.localStorage */
  storage?: KeyValueStorage;
}

export function useWorkspace(
  definitions: readonly WorkspacePanelDefinition[],
  registry: WorkspacePanelRegistry,
  options: UseWorkspaceOptions = {},
): WorkspaceRuntime {
  const [state, setState] = useState<WorkspaceStateV1>(
    () => createWorkspaceState(definitions),
  );

  const [reconciledDefinitions, setReconciledDefinitions] = useState(definitions);
  if (reconciledDefinitions !== definitions) {
    setReconciledDefinitions(definitions);
    setState((current) => reconcileWorkspaceState(current, definitions));
  }

  const dispatch = useCallback<Dispatch<WorkspaceAction>>((action) => {
    setState((current) => workspaceReducer(current, action));
  }, []);

  const storageOverride = options.storage;
  const resolveStorage = useCallback(
    (): KeyValueStorage => storageOverride ?? window.localStorage,
    [storageOverride],
  );

  // レンダー中にstorageを読まない。復元はmount後の副作用で一度だけ行う。
  const [restoring, setRestoring] = useState(true);
  const restoredRef = useRef(false);
  useEffect(() => {
    // 未整地（空）のレジストリに対して復元を試みない。definitionsが揃うまで待ち、
    // 揃った回のeffectで復元する。
    if (!restoredRef.current && definitions.length > 0) {
      restoredRef.current = true;
      const storage = resolveStorage();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const saved = loadWorkspaceState(storage, definitions, registry, viewport);
      setState(saved);
    }
    if (!restoredRef.current) return;
    // 復元を適用したコミットの直後の1フレームまでアニメーションを止め、それを過ぎたら
    // 通常のlayoutアニメーションへ戻す。開発時のeffect二重実行（cleanup→再実行）でも
    // rAFの予約自体は毎回やり直す（実際の復元処理は上のrestoredRefで一度きりに保つ）ため、
    // 最後に生き残った実行のrAFが確実に発火してrestoringを解除する。
    const frame = requestAnimationFrame(() => setRestoring(false));
    return () => cancelAnimationFrame(frame);
  }, [definitions, registry, resolveStorage]);

  // window resizeで全floatingパネルをviewport内へ再クランプする。
  useEffect(() => {
    const onResize = () => {
      setState((current) => clampAllFloatingPanels(current, registry, {
        width: window.innerWidth,
        height: window.innerHeight,
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [registry]);

  // 書き込みのcoalescing。pointermove連打やstateの細かな変化をdebounceでまとめる。
  const schedulerRef = useRef<WorkspacePersistenceScheduler | null>(null);
  const getScheduler = useCallback((): WorkspacePersistenceScheduler => {
    if (schedulerRef.current === null) {
      schedulerRef.current = createWorkspacePersistenceScheduler({ storage: resolveStorage() });
    }
    return schedulerRef.current;
  }, [resolveStorage]);

  // mountの初回コミットでは書かない。復元前のdefault stateで保存値を
  // 上書きしてしまうため（復元はこの後の別コミットで反映される）。
  const skippedInitialWriteRef = useRef(false);
  useEffect(() => {
    if (!skippedInitialWriteRef.current) {
      skippedInitialWriteRef.current = true;
      return;
    }
    getScheduler().notify(state);
  }, [state, getScheduler]);

  useEffect(() => {
    const scheduler = getScheduler();
    const flush = () => scheduler.flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      // アンマウント時（画面遷移等）も保留中の書き込みは取りこぼさず反映する
      scheduler.flush();
    };
  }, [getScheduler]);

  return useMemo(() => ({ state, dispatch, restoring }), [dispatch, state, restoring]);
}

export function WorkspaceProvider({
  runtime,
  children,
}: {
  runtime: WorkspaceRuntime;
  children: ReactNode;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="workspace">
        <WorkspaceContext.Provider value={runtime}>
          {children}
        </WorkspaceContext.Provider>
      </LayoutGroup>
    </MotionConfig>
  );
}

export function useWorkspaceRuntime(): WorkspaceRuntime {
  const runtime = useContext(WorkspaceContext);
  if (runtime === null) {
    throw new Error('Workspace runtime is unavailable outside WorkspaceProvider');
  }
  return runtime;
}
