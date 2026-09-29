import { useCallback, useMemo, useRef } from 'react';
import type { Command } from '#input/commands/index.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import type { EngineCache } from '#engine/cache.ts';
import {
  addWorkspacePaneCommand,
  closeWorkspacePaneCommand,
  duplicateWorkspacePaneCommand,
  renameWorkspaceCommand,
  setWorkspaceLayoutCommand,
  setWorkspacePaneTargetCommand,
} from '#engine/workspace-commands.ts';
import { findWorkspace, type WorkspaceIdGenerator, type WorkspacePane, type WorkspacePaneTarget } from '#engine/workspace.ts';
import type { TextIdGenerator } from '#input/text/library.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import { ContextBar, type ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { DefaultShapeChip } from '#hosts/shared/DefaultShapeChip.tsx';
import type { PaneEnvironment } from '#hosts/shared/panes/pane-environment.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';
import { TextChip, type TextContentCommit } from '#hosts/shared/TextChip.tsx';
import { AddPaneMenu } from './AddPaneMenu.tsx';
import { findWorkspaceAnalyzer, initialPaneTarget, type WorkspaceAnalyzerEntry } from './analyzer-registry.ts';
import type { WorkspacePaneRuntime } from './pane-runtime.ts';
import { WorkspaceDock } from './WorkspaceDock.tsx';
import { WorkspaceName } from './WorkspaceName.tsx';
import { WorkspacePaneView } from './WorkspacePaneView.tsx';
import './workspace.css';

/** ペインの解析設定を間引いて資産へ反映する関数（`app`が組み立てる。ペインごとに別の待ち行列を持つ）。 */
export type PaneOptionsCommit = ((paneId: string, options: unknown) => void) & {
  /** 待っている書き込みを今すぐ行う（ペインの複製・Undoの前に呼ぶ）。 */
  readonly flush: () => void;
};

/**
 * タブの出し方（#628で決めるまでの、見比べるための切り替え）。`show`はペインごとにタブの帯を出し、
 * `hide`はタブの帯を出さずペインの見出しだけにする。
 */
export type WorkspaceTabsMode = 'show' | 'hide';

export interface WorkspacePageProps {
  readonly workspaceId: string;
  readonly assets: KeydistAssets;
  /** 資産の初回読み込みが済んでいるか。済む前は、Workspaceが無く見えても無いとは限らない。 */
  readonly assetsReady: boolean;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  /** Workspaceの全ペインが共有する。同じ条件の計算は1回で済む。 */
  readonly cache: EngineCache;
  readonly catalog: PaneCatalog;
  readonly generateTextId: TextIdGenerator;
  /** ペインのidの発行。 */
  readonly generateId: WorkspaceIdGenerator;
  readonly history: ContextBarHistory;
  readonly onTextContentCommit: TextContentCommit;
  readonly onPaneOptionsCommit: PaneOptionsCommit;
  readonly tabs?: WorkspaceTabsMode;
}

/**
 * 保存したWorkspaceの画面（`/workspace/<id>`）。Analyzerをペインとして並べる器で、ペインは
 * 個別画面と同じAnalyzerのcomponent（`hosts/shared/panes/`）を載せる。
 *
 * 持つのは、文脈バー（Workspace名・このWorkspace自身のテキスト・Undo/Redo・共有）と、ペインの追加・
 * 複製・閉じる・並びの変更を資産のコマンドへ結ぶところ。書き込みはすべて`dispatch`を通す（#544 §8-2）。
 * ペインの対象は今は「固定」（ペイン自身が持つ）だけ。
 */
export function WorkspacePage({
  workspaceId,
  assets,
  assetsReady,
  dispatch,
  cache,
  catalog,
  generateTextId,
  generateId,
  history,
  onTextContentCommit,
  onPaneOptionsCommit,
  tabs = 'show',
}: WorkspacePageProps) {
  const workspace = findWorkspace(assets.workspaces, workspaceId);
  const flushLayoutRef = useRef<(() => void) | undefined>(undefined);
  const registerFlush = useCallback((flush: (() => void) | undefined) => {
    flushLayoutRef.current = flush;
  }, []);

  // 待っている変更（並び・解析設定）を先に資産へ書いてから、ペインを増減する・戻す。待ち中の値を
  // 残したまま操作すると、操作の後にその値が書かれて、操作の結果を上書きする。
  const flushPending = useCallback(() => {
    flushLayoutRef.current?.();
    onPaneOptionsCommit.flush();
  }, [onPaneOptionsCommit]);

  const pageHistory: ContextBarHistory = useMemo(() => ({
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undo: () => {
      history.undo();
    },
    redo: () => {
      flushPending();
      history.redo();
    },
  }), [history, flushPending]);

  const resolvedText = useMemo(
    () => (workspace === undefined ? undefined : resolveTextSelection(workspace.text, assets.textLibrary)),
    [workspace, assets.textLibrary],
  );

  const env: PaneEnvironment | undefined = useMemo(() => (resolvedText === undefined ? undefined : {
    setups: assets.setupLibrary.setups,
    overrides: assets.setupLibrary.overrides,
    catalog,
    resolvedText,
    cache,
    assetsReady,
  }), [assets.setupLibrary, catalog, resolvedText, cache, assetsReady]);

  const runtime: WorkspacePaneRuntime | undefined = useMemo(() => (env === undefined ? undefined : {
    env,
    commitPaneOptions: (paneId: string, options: unknown) => onPaneOptionsCommit(paneId, options),
    setPaneTarget: (paneId: string, target: WorkspacePaneTarget) => {
      dispatch(setWorkspacePaneTargetCommand(workspaceId, paneId, target));
    },
    duplicatePane: (paneId: string) => {
      flushPending();
      dispatch(duplicateWorkspacePaneCommand(workspaceId, paneId, generateId()));
    },
    closePane: (paneId: string) => {
      flushPending();
      dispatch(closeWorkspacePaneCommand(workspaceId, paneId));
    },
  }), [env, onPaneOptionsCommit, dispatch, workspaceId, generateId, flushPending]);

  const panes = workspace?.panes;
  const panesById = useMemo(() => new Map((panes ?? []).map((pane) => [pane.id, pane] as const)), [panes]);
  const paneIds = useMemo(() => (panes ?? []).map((pane) => pane.id), [panes]);

  const titleOf = useCallback(
    (paneId: string) => {
      const pane = panesById.get(paneId);
      return (pane === undefined ? undefined : findWorkspaceAnalyzer(pane.analyzerId)?.name) ?? '使えないAnalyzer';
    },
    [panesById],
  );

  const renderPane = useCallback((paneId: string) => {
    const pane = panesById.get(paneId);
    if (pane === undefined || runtime === undefined) return null;
    return <WorkspacePaneView pane={pane} runtime={runtime} />;
  }, [panesById, runtime]);

  const addPane = (entry: WorkspaceAnalyzerEntry) => {
    flushPending();
    const pane: WorkspacePane = {
      id: generateId(),
      analyzerId: entry.id,
      options: undefined,
      target: initialPaneTarget(entry, assets),
    };
    dispatch(addWorkspacePaneCommand(workspaceId, pane));
  };

  const shareDescription = 'このWorkspaceのURLをコピーする';

  if (workspace === undefined) {
    return (
      <div className="workspace-page">
        <ContextBar disabled history={pageHistory} share={{ description: shareDescription }}>{null}</ContextBar>
        {assetsReady ? (
          <div className="workspace-missing" data-workspace-missing="true">
            <h1>Workspaceが見つからない</h1>
            <p>削除されたか、このブラウザに保存されていないWorkspaceです。</p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="workspace-page">
      <ContextBar
        disabled={!assetsReady}
        history={pageHistory}
        share={{ description: shareDescription }}
      >
        <WorkspaceName
          name={workspace.name}
          onRename={(next) => dispatch(renameWorkspaceCommand(workspaceId, next))}
        />
        <TextChip
          holder={{ workspaceId }}
          textLibrary={assets.textLibrary}
          selection={workspace.text}
          dispatch={dispatch}
          generateTextId={generateTextId}
          onTextContentCommit={onTextContentCommit}
        />
        <DefaultShapeChip
          overrides={assets.setupLibrary.overrides}
          dispatch={dispatch}
          shapes={catalog.setupCatalog.shapes}
        />
      </ContextBar>
      {/* プリレンダーやハイドレーション前は操作を効かせない（個別画面と同じ扱い）。 */}
      <fieldset
        disabled={!assetsReady}
        style={{ display: 'contents', border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        {workspace.panes.length === 0 || workspace.layout === undefined ? (
          <div className="workspace-empty" data-workspace-empty="true">
            <p>Analyzerを追加して、並べて見る。</p>
            <AddPaneMenu onAdd={addPane} variant="empty" />
          </div>
        ) : (
          <>
            <div className="workspace-toolbar">
              <AddPaneMenu onAdd={addPane} />
            </div>
            <div className="workspace-stage">
              <WorkspaceDock
                layout={workspace.layout}
                paneIds={paneIds}
                titleOf={titleOf}
                renderPane={renderPane}
                hideTabs={tabs === 'hide'}
                onLayoutChange={(layout) => dispatch(setWorkspaceLayoutCommand(workspaceId, layout))}
                onPaneClosed={(paneId) => {
                  onPaneOptionsCommit.flush();
                  dispatch(closeWorkspacePaneCommand(workspaceId, paneId));
                }}
                registerFlush={registerFlush}
              />
            </div>
          </>
        )}
      </fieldset>
    </div>
  );
}
