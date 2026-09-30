import { useMemo } from 'react';
import type { ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { WorkspacePage, type WorkspaceTabsMode } from '#hosts/workspace/index.ts';
import { builtinPaneCatalog } from '../standalone/catalog.ts';
import { sharedEngineComputer } from '../standalone/engine-computer.ts';
import { generatePresetId, generateTextId } from '../standalone/id-generator.ts';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';
import { useTextContentCommit } from '../standalone/use-text-content-commit.ts';
import { generatePaneId } from './id-generator.ts';
import { usePaneOptionsCommit } from './use-pane-options-commit.ts';

/**
 * Workspaceの画面の組み立て（`/workspace/<id>`）。個別画面の`Standalone*App`と同じ役割で、
 * 資産の永続化・タブ間追従・コマンド履歴（`useKeydistAssets`）と、間引き書き込みを`WorkspacePage`へ結ぶ。
 *
 * 計算の窓口は個別画面と同じもの（`standalone/engine-computer.ts`。ブラウザではWorker）を使う。
 * 全ペインで共有するので、同じ条件のTrace・抽出はペインをまたいで1回だけ計算する（#544 §7）。
 *
 * 呼び出し側（route）は`workspaceId`をkeyにする。Workspaceを切り替えた時に、待っている間引き書き込みが
 * 元のWorkspaceへ書かれて確定するようにするため（切り替えでこのcomponentが作り直される）。
 */
export function WorkspaceApp({ workspaceId, tabs }: { readonly workspaceId: string; readonly tabs: WorkspaceTabsMode }) {
  const { assets, ready, dispatch, getAssets, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const catalog = useMemo(() => builtinPaneCatalog(), []);
  const holder = useMemo(() => ({ workspaceId }), [workspaceId]);

  const commitTextContent = useTextContentCommit(dispatch, getAssets, generateTextId, holder);
  const commitPaneOptions = usePaneOptionsCommit(dispatch, workspaceId);

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

  return (
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
      tabs={tabs}
    />
  );
}
