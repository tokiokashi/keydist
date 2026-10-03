import type { Workspace } from '#engine/workspace.ts';
import { emptyCommandHistory } from '#input/commands/index.ts';
import { createSampleWorkspaceCommand, createWorkspaceCommand, restoreWorkspaceCommand } from '#engine/workspace-commands.ts';
import { initialAssets } from '../standalone/asset-storage-specs.ts';
import { buildAssetSyncs, commitCommand, loadAssets } from '../standalone/asset-syncs.ts';

/**
 * 空のWorkspaceを作って保存する（サイドバーの「＋ 新しいWorkspace」）。
 *
 * サイドバーは画面をまたいで常に出ていて、どの画面の`useKeydistAssets`（資産の手持ちと履歴）にも
 * 属さない。そこで、書き込みの入口は他と同じコマンド（`createWorkspaceCommand`）を通し、
 * 手持ちはこの場でstorageから読んで組み立てる。変わった資産（`workspaces`）だけを書き、他タブ・
 * 開いている画面には通知で伝わる。作った直後に新しいWorkspaceの画面へ移るので、この書き込みは
 * その画面のUndo履歴には入らない（履歴は画面ごとのメモリ上のもの）。
 *
 * 作ったら`true`。保存できなかった（既に同じidがある等）時は`false`。
 */
export function createWorkspaceInStorage(id: string): boolean {
  const syncs = buildAssetSyncs({ onExternalChange: () => {} });
  const assets = { ...initialAssets(), ...loadAssets(syncs) };
  const result = commitCommand(syncs, () => ({ assets, history: emptyCommandHistory() }), createWorkspaceCommand(id));
  return result.outcome.kind === 'applied';
}

/**
 * 削除したWorkspaceを元の位置へ戻して保存する。削除した画面の履歴が残らない所（移った先の画面）から使うので、
 * `createWorkspaceInStorage`と同じく手持ちをこの場でstorageから読んで組み立てる。
 * 戻せたら`true`。同じidが既にある時は`false`。
 */
export function restoreWorkspaceInStorage(workspace: Workspace, index: number): boolean {
  const syncs = buildAssetSyncs({ onExternalChange: () => {} });
  const assets = { ...initialAssets(), ...loadAssets(syncs) };
  const result = commitCommand(
    syncs,
    () => ({ assets, history: emptyCommandHistory() }),
    restoreWorkspaceCommand(workspace, index),
  );
  return result.outcome.kind === 'applied';
}

/**
 * 中身入りのサンプルのWorkspaceを作って保存する（トップと空のWorkspaceの「サンプルのWorkspaceを作る」）。
 * 書き込みの入口は`createWorkspaceInStorage`と同じ理由で、手持ちをこの場でstorageから読んで組み立てる。
 * 全体の条件は書かない（サンプルの条件はWorkspaceのレベルに入る）。作ったら`true`。
 */
export function createSampleWorkspaceInStorage(id: string, generatePaneId: () => string): boolean {
  const syncs = buildAssetSyncs({ onExternalChange: () => {} });
  const assets = { ...initialAssets(), ...loadAssets(syncs) };
  const result = commitCommand(
    syncs,
    () => ({ assets, history: emptyCommandHistory() }),
    createSampleWorkspaceCommand(id, generatePaneId),
  );
  return result.outcome.kind === 'applied';
}
