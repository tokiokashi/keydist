import { useCallback, useMemo, useRef, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import type { EngineComputer } from '#engine/computer.ts';
import {
  addWorkspacePaneCommand,
  closeWorkspacePaneCommand,
  duplicateWorkspacePaneCommand,
  renameWorkspaceCommand,
  setWorkspaceBoardHeightCommand,
  setWorkspaceLayoutCommand,
  linkWorkspacePaneToNewGroupCommand,
  setWorkspacePaneBindingCommand,
  setWorkspaceTargetCommand,
} from '#engine/workspace-commands.ts';
import {
  BLANK_PANE_ID,
  followBinding,
  findWorkspace,
  NO_BINDING,
  resolveWorkspacePaneTarget,
  type WorkspaceIdGenerator,
  type WorkspacePane,
  type WorkspacePaneTarget,
} from '#engine/workspace.ts';
import type { PresetIdGenerator } from '#input/presets/index.ts';
import type { TextIdGenerator } from '#input/text/library.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import { ContextBar, type ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { DefaultShapeChip } from '#hosts/shared/DefaultShapeChip.tsx';
import { useStableResolvedText } from '#hosts/shared/stable-resolved-text.ts';
import { useLatestCallback } from '#hosts/shared/use-latest-callback.ts';
import type { PaneEnvironment } from '#hosts/shared/panes/pane-environment.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';
import { TextChip, type TextContentCommit } from '#hosts/shared/TextChip.tsx';
import { PaneMenu } from '#hosts/shared/PaneHeaderParts.tsx';
import { AddPaneMenu } from './AddPaneMenu.tsx';
import { findWorkspaceAnalyzer, findWorkspacePaneMeta, type WorkspaceAnalyzerEntry } from './analyzer-registry.ts';
import type { PaneBindingChoice, WorkspacePaneRuntime } from './pane-runtime.ts';
import { summarizeLinkGroups } from './group-summary.ts';
import { minBoardHeightRem as minBoardHeightRemOf } from '#engine/workspace-board.ts';
import { workspaceBoardPolicy } from './board-policy.ts';
import { useFocusAfterClose } from './use-focus-after-close.ts';
import { WorkspaceDock } from './WorkspaceDock.tsx';
import { WorkspaceName } from './WorkspaceName.tsx';
import { WorkspaceStack } from './WorkspaceStack.tsx';
import { useStacked } from './use-stacked.ts';
import { WorkspacePaneView } from './WorkspacePaneView.tsx';
import { initialWorkspaceColorSlots } from '#engine/workspace-colors.ts';
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
  readonly cache: EngineComputer;
  readonly catalog: PaneCatalog;
  readonly generateTextId: TextIdGenerator;
  /** ペインのidの発行。 */
  readonly generateId: WorkspaceIdGenerator;
  /** プリセットの新しいidの発行（条件のモーダルのプリセットの節が使う）。 */
  readonly generatePresetId: PresetIdGenerator;
  readonly history: ContextBarHistory;
  readonly onTextContentCommit: TextContentCommit;
  readonly onPaneOptionsCommit: PaneOptionsCommit;
  readonly tabs?: WorkspaceTabsMode;
  /**
   * このWorkspaceを複製する・削除する。書き込みと、その後どの画面へ移るかは組み立て側（`app`）が決める
   * （削除すると画面ごとの履歴が使えなくなるため。移り先と元に戻す手段もそちらが持つ）。
   */
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
}

/**
 * 保存したWorkspaceの画面（`/workspace/<id>`）。Analyzerをペインとして並べる器で、ペインは
 * 個別画面と同じAnalyzerのcomponent（`hosts/shared/panes/`）を載せる。
 *
 * 持つのは、文脈バー（Workspace名・このWorkspace自身のテキスト・Undo/Redo）と、ペインの追加・
 * 複製・閉じる・並びの変更を資産のコマンドへ結ぶところ。書き込みはすべて`dispatch`を通す（#544 §8-2）。
 * ペインの対象は「連動の組に従う」か「固定」（ペイン自身が持つ）。従うペインは、従う組の対象を読む。組の切り替えはペインの見出し（見出しの連動のメニュー）で行い、文脈バーには置かない。
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
  generatePresetId,
  history,
  onTextContentCommit,
  onPaneOptionsCommit,
  tabs = 'show',
  onDuplicate,
  onDelete,
}: WorkspacePageProps) {
  const workspace = findWorkspace(assets.workspaces, workspaceId);
  // スマホ幅ではDockviewを外し、ペインを縦に積む。資産の配置は読むだけなので、戻ると元の並びで描き直される
  const stacked = useStacked();
  // 拡大表示しているペイン。保存しない見た目だけの状態で、リロードで元に戻る。
  // 拡大できるのはDockviewの面だけなので、縦積みへ変わったら解く（戻した時に勝手に拡大し直さない）
  const [maximizedId, setMaximizedId] = useState<string | undefined>(undefined);
  if (stacked && maximizedId !== undefined) setMaximizedId(undefined);
  // 板の高さの計算に渡す、ペインの下限と余白（ペインを足す・複製する・並びを変える時に板を伸ばす）
  const boardPolicy = useMemo(() => workspaceBoardPolicy(tabs === 'hide'), [tabs]);
  // 板の下端のつまみで縮められる下限（各ペインの下限の和 + 余白）
  const workspaceLayout = workspace?.layout;
  const workspacePanes = workspace?.panes;
  const minBoardHeightRem = useMemo(() => {
    const analyzerOf = new Map((workspacePanes ?? []).map((pane) => [pane.id, pane.analyzerId]));
    return minBoardHeightRemOf(workspaceLayout, (paneId) => boardPolicy.floorRemOfAnalyzer(analyzerOf.get(paneId) ?? ''), boardPolicy);
  }, [workspaceLayout, workspacePanes, boardPolicy]);
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
    // 戻す・やり直すで並びやペインが変わる。新しく現れるペインが隠れないよう、拡大は解く
    undo: () => {
      flushPending();
      setMaximizedId(undefined);
      history.undo();
    },
    redo: () => {
      flushPending();
      setMaximizedId(undefined);
      history.redo();
    },
  }), [history, flushPending]);

  // Workspaceの保存はどれも`workspace`を作り直す。中身が同じテキストは同じ参照のまま渡して、
  // テキストと関係の無い保存（アクティブなタブ・連動の組の対象）で全ペインが依頼を出し直さないようにする。
  const resolvedText = useStableResolvedText(useMemo(
    () => (workspace === undefined ? undefined : resolveTextSelection(workspace.text, assets.textLibrary)),
    [workspace, assets.textLibrary],
  ));

  // 条件のモーダルの元に戻すも、文脈バーと同じく待っている書き込みを先に反映してから戻す
  const undo = useLatestCallback(pageHistory.undo);

  const env: PaneEnvironment | undefined = useMemo(() => (resolvedText === undefined ? undefined : {
    setups: assets.setupLibrary.setups,
    overrides: assets.setupLibrary.overrides,
    catalog,
    resolvedText,
    cache,
    dispatch,
    presetLibrary: assets.presetLibrary,
    generatePresetId,
    undo,
    assetsReady,
  }), [assets.setupLibrary, assets.presetLibrary, catalog, resolvedText, cache, dispatch, generatePresetId, undo, assetsReady]);

  const panes = workspace?.panes;
  const panesById = useMemo(() => new Map((panes ?? []).map((pane) => [pane.id, pane] as const)), [panes]);
  const paneIds = useMemo(() => (panes ?? []).map((pane) => pane.id), [panes]);
  // ペインを閉じた後に、フォーカスをbodyへ落とさない（どの経路で閉じても同じ規則）
  const pageRef = useFocusAfterClose(paneIds);

  const groups = workspace?.groups;
  const colorSlots = workspace?.colorSlots ?? initialWorkspaceColorSlots();
  const groupSummaries = useMemo(
    () => (env === undefined || groups === undefined ? [] : summarizeLinkGroups(env, groups)),
    [env, groups],
  );

  const runtime: WorkspacePaneRuntime | undefined = useMemo(() => (env === undefined ? undefined : {
    env,
    commitPaneOptions: (paneId: string, options: unknown) => onPaneOptionsCommit(paneId, options),
    paneTarget: (pane: WorkspacePane, kind: WorkspacePaneTarget['kind']) => (
      groups === undefined ? undefined : resolveWorkspacePaneTarget(pane.binding, groups, kind)
    ),
    setPaneTarget: (paneId: string, target: WorkspacePaneTarget) => {
      // 従うペインで対象を選ぶと、その組の対象を書き換える（同じ組の他のペインも一緒に変わる）。
      const binding = panesById.get(paneId)?.binding;
      if (binding?.mode === 'follow') {
        dispatch(setWorkspaceTargetCommand(workspaceId, binding.group, target));
      } else {
        dispatch(setWorkspacePaneBindingCommand(workspaceId, paneId, { mode: 'fixed', target }));
      }
    },
    colorSlots,
    groups: groups ?? [],
    groupSummaries,
    bindPane: (paneId: string, choice: PaneBindingChoice) => {
      const pane = panesById.get(paneId);
      if (pane === undefined || groups === undefined) return;
      if (choice.kind === 'group') {
        dispatch(setWorkspacePaneBindingCommand(workspaceId, paneId, followBinding(choice.id)));
        return;
      }
      // 固定・新しい組は、今映している対象をそのまま持つ（押した瞬間に見た目が変わらないように）。
      const kind = findWorkspaceAnalyzer(pane.analyzerId)?.cardinality;
      const current = kind === undefined ? undefined : resolveWorkspacePaneTarget(pane.binding, groups, kind);
      if (current === undefined) return;
      dispatch(choice.kind === 'fixed'
        ? setWorkspacePaneBindingCommand(workspaceId, paneId, { mode: 'fixed', target: current })
        : linkWorkspacePaneToNewGroupCommand(workspaceId, paneId, generateId(), current));
    },
    duplicatePane: (paneId: string) => {
      flushPending();
      // 写したペインが隣に現れるので、拡大は解いて見えるようにする
      setMaximizedId(undefined);
      dispatch(duplicateWorkspacePaneCommand(workspaceId, paneId, generateId(), boardPolicy));
    },
    closePane: (paneId: string) => {
      flushPending();
      setMaximizedId((current) => (current === paneId ? undefined : current));
      dispatch(closeWorkspacePaneCommand(workspaceId, paneId));
    },
    // 縦積みはDockviewを使わず拡大できないので、渡さない（⋯に項目を出さない）
    ...(stacked ? {} : { maximizedPaneId: maximizedId, maximizePane: setMaximizedId }),
  }), [stacked, maximizedId, env, onPaneOptionsCommit, dispatch, workspaceId, generateId, flushPending, panesById, groups, groupSummaries, colorSlots]);

  const titleOf = useCallback(
    (paneId: string) => {
      const pane = panesById.get(paneId);
      return (pane === undefined ? undefined : findWorkspacePaneMeta(pane.analyzerId)?.name) ?? '使えないAnalyzer';
    },
    [panesById],
  );

  const descriptionOf = useCallback(
    (paneId: string) => {
      const pane = panesById.get(paneId);
      return (pane === undefined ? undefined : findWorkspacePaneMeta(pane.analyzerId)?.description) ?? '';
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
    // 足したペインが隠れないよう、拡大は解く
    setMaximizedId(undefined);
    const pane: WorkspacePane = {
      id: generateId(),
      analyzerId: entry.id,
      options: undefined,
      // 新しいペインは最初の組に従う（比較中に黙って別の対象を映さない）。
      binding: followBinding(workspace!.groups[0]!.id),
    };
    dispatch(addWorkspacePaneCommand(workspaceId, pane, boardPolicy));
  };

  const addBlankPane = () => {
    flushPending();
    setMaximizedId(undefined);
    dispatch(addWorkspacePaneCommand(workspaceId, { id: generateId(), analyzerId: BLANK_PANE_ID, options: undefined, binding: NO_BINDING }, boardPolicy));
  };

  if (workspace === undefined) {
    return (
      <div className="workspace-page">
        <ContextBar disabled history={pageHistory}>{null}</ContextBar>
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
    <div ref={pageRef} className="workspace-page" data-stacked={stacked || undefined}>
      <ContextBar
        disabled={!assetsReady}
        history={pageHistory}
      >
        <WorkspaceName
          name={workspace.name}
          onRename={(next) => dispatch(renameWorkspaceCommand(workspaceId, next))}
        />
        {/* 待っている変更（並び・解析設定）を先に書いてから複製・削除する。写す・戻す中身が古くならないように */}
        <PaneMenu
          paneName={workspace.name}
          label="Workspaceの操作"
          className="workspace-menu"
          items={[
            { id: 'duplicate', label: '複製', onSelect: () => { flushPending(); onDuplicate(); } },
            { id: 'delete', label: '削除', onSelect: () => { flushPending(); onDelete(); } },
          ]}
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
            <AddPaneMenu onAdd={addPane} onAddBlank={addBlankPane} variant="empty" />
          </div>
        ) : (
          <>
            <div className="workspace-toolbar">
              <AddPaneMenu onAdd={addPane} onAddBlank={addBlankPane} />
            </div>
            {stacked ? (
              <WorkspaceStack layout={workspace.layout} renderPane={renderPane} />
            ) : (
              <div className="workspace-stage">
                <WorkspaceDock
                  layout={workspace.layout}
                  paneIds={paneIds}
                  titleOf={titleOf}
                  descriptionOf={descriptionOf}
                  renderPane={renderPane}
                  hideTabs={tabs === 'hide'}
                  onLayoutChange={(layout) => dispatch(setWorkspaceLayoutCommand(workspaceId, layout, boardPolicy))}
                  maximizedPaneId={maximizedId !== undefined && panesById.has(maximizedId) ? maximizedId : undefined}
                  onMaximizedChange={setMaximizedId}
                  onPaneClosed={(paneId) => {
                    onPaneOptionsCommit.flush();
                    setMaximizedId((current) => (current === paneId ? undefined : current));
                    dispatch(closeWorkspacePaneCommand(workspaceId, paneId));
                  }}
                  registerFlush={registerFlush}
                  boardHeightRem={workspace.boardHeightRem}
                  minBoardHeightRem={minBoardHeightRem}
                  onBoardHeightChange={(rem) => dispatch(setWorkspaceBoardHeightCommand(workspaceId, rem))}
                />
              </div>
            )}
          </>
        )}
      </fieldset>
    </div>
  );
}
