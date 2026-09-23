import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import type {
  WorkspacePanelDefinition,
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

export interface WorkspaceRuntime {
  state: WorkspaceStateV1;
  dispatch: Dispatch<WorkspaceAction>;
}

const WorkspaceContext = createContext<WorkspaceRuntime | null>(null);

export function useWorkspace(
  definitions: readonly WorkspacePanelDefinition[],
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

  return useMemo(() => ({ state, dispatch }), [dispatch, state]);
}

export function WorkspaceProvider({
  runtime,
  children,
}: {
  runtime: WorkspaceRuntime;
  children: ReactNode;
}) {
  return (
    <WorkspaceContext.Provider value={runtime}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceRuntime(): WorkspaceRuntime {
  const runtime = useContext(WorkspaceContext);
  if (runtime === null) {
    throw new Error('Workspace runtime is unavailable outside WorkspaceProvider');
  }
  return runtime;
}
