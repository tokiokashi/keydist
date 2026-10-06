import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { deleteWorkspaceCommand, duplicateWorkspaceCommand } from '#engine/workspace-commands.ts';
import { findWorkspace } from '#engine/workspace.ts';
import type { ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { WorkspacePage } from '#hosts/workspace/index.ts';
import { builtinPaneCatalog } from '../standalone/catalog.ts';
import { sharedEngineComputer } from '../standalone/engine-computer.ts';
import { generatePresetId, generateTextId } from '../standalone/id-generator.ts';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';
import { useTextContentCommit } from '../standalone/use-text-content-commit.ts';
import { setDeletedWorkspace } from './deleted-workspace-notice.ts';
import { generatePaneId, generateWorkspaceId } from './id-generator.ts';
import { OptionsWriteLogsProvider } from '#hosts/shared/OptionsWriteLogsContext.ts';
import { createOptionsWriteLogs } from '#hosts/shared/options-write-log.ts';
import { usePaneOptionsCommit } from './use-pane-options-commit.ts';

/**
 * Workspaceの画面の組み立て（`/workspace/<id>`）。個別画面の`Standalone*App`と同じ役割で、
 * 資産の永続化・タブ間追従・コマンド履歴（`useKeydistAssets`）と、間引き書き込みを`WorkspacePage`へ結ぶ。
 *
 * 計算の窓口は個別画面と同じもの（`standalone/engine-computer.ts`。ブラウザではWorker）を使う。
 * 全ペインで共有するので、同じ条件のTrace・抽出はペインをまたいで1回だけ計算する。
 *
 * 呼び出し側（route）は`workspaceId`をkeyにする。Workspaceを切り替えた時に、待っている間引き書き込みが
 * 元のWorkspaceへ書かれて確定するようにするため（切り替えでこのcomponentが作り直される）。
 */
export function WorkspaceApp({ workspaceId }: { readonly workspaceId: string }) {
  const { assets, ready, dispatch, getAssets, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const catalog = useMemo(() => builtinPaneCatalog(), []);
  const holder = useMemo(() => ({ workspaceId }), [workspaceId]);

  const commitTextContent = useTextContentCommit(dispatch, getAssets, generateTextId, holder);
  const writeLogs = useMemo(createOptionsWriteLogs, []);
  const commitPaneOptions = usePaneOptionsCommit(dispatch, workspaceId, writeLogs);

  // 間引き待ちの変更を先に書いてから戻す。待ち中の値を残したまま戻すと、戻した後にその値が
  // 書かれて、戻したはずの変更がまた入るため（並びの間引きは`WorkspacePage`が先に書く）。
  const history: ContextBarHistory = {
    canUndo,
    canRedo,
    undo: () => {
      commitTextContent.flush();
      commitPaneOptions.flush();
      undo();
    },
    redo: () => {
      commitTextContent.flush();
      commitPaneOptions.flush();
      redo();
    },
  };

  const navigate = useNavigate();

  // 複製したら、写したWorkspaceを開く（作った時と同じ）。
  const duplicate = () => {
    commitTextContent.flush();
    const newId = generateWorkspaceId();
    dispatch(duplicateWorkspaceCommand(workspaceId, newId));
    if (findWorkspace(getAssets().workspaces, newId) === undefined) return;
    void navigate({ to: '/workspace/$id', params: { id: newId } });
  };

  // 削除したら、一覧で次のWorkspace（最後だったら1つ前）へ移る。1つも残らなければトップへ移る。
  // 空のWorkspaceを黙って作って開くことはしない。元に戻すは、移った先に出す知らせから行う。
  const remove = () => {
    commitTextContent.flush();
    const before = getAssets().workspaces;
    const index = before.findIndex((workspace) => workspace.id === workspaceId);
    const deleted = before[index];
    if (deleted === undefined) return;
    dispatch(deleteWorkspaceCommand(workspaceId));
    setDeletedWorkspace({ workspace: deleted, index });
    const rest = before.filter((workspace) => workspace.id !== workspaceId);
    const next = rest[Math.min(index, rest.length - 1)];
    void (next === undefined ? navigate({ to: '/' }) : navigate({ to: '/workspace/$id', params: { id: next.id } }));
  };

  return (
    <OptionsWriteLogsProvider logs={writeLogs}>
      <WorkspacePage
        workspaceId={workspaceId}
        assets={assets}
        assetsReady={ready}
        dispatch={dispatch}
        cache={sharedEngineComputer}
        catalog={catalog}
        generateTextId={generateTextId}
        generateId={generatePaneId}
        generatePresetId={generatePresetId}
        history={history}
        onTextContentCommit={commitTextContent}
        onPaneOptionsCommit={commitPaneOptions}
        onDuplicate={duplicate}
        onDelete={remove}
      />
    </OptionsWriteLogsProvider>
  );
}
