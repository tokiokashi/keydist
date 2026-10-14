import type { Workspace } from '#engine/workspace.ts';
import { createSampleWorkspaceCommand, createWorkspaceCommand, restoreWorkspaceCommand } from '#engine/workspace-commands.ts';
import type { Command } from '#input/commands/index.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { getAssetStore } from '../standalone/asset-store.ts';

/**
 * 履歴を持たない所（サイドバー・削除の知らせ・トップ）からの書き込み。資産の値はタブに1つのストアが持つので、
 * 開いている画面も同じ値を見る。書き込みはどの画面の履歴にも積まない（積んだ項目が無いので、
 * 他の画面の項目は、触れた資産が変わった分だけ戻せなくなる）。変わった資産だけを保存し、他タブには通知で伝わる。
 * 書き込めたら`true`。
 */
function commitWithoutHistory(command: Command<KeydistAssets>): boolean {
  return getAssetStore().dispatch(undefined, command).kind === 'applied';
}

/**
 * 空のWorkspaceを作って保存する（サイドバーの「＋ 新しいWorkspace」）。
 * 作った直後に新しいWorkspaceの画面へ移るので、この書き込みはどの画面の履歴にも入らない。
 *
 * 作ったら`true`。保存できなかった（既に同じidがある等）時は`false`。
 */
export function createWorkspaceInStorage(id: string): boolean {
  return commitWithoutHistory(createWorkspaceCommand(id));
}

/**
 * 削除したWorkspaceを元の位置へ戻して保存する。削除した画面の履歴は捨てられているので、
 * 移った先の画面から使う書き込みとして、履歴に積まない。
 * 戻せたら`true`。同じidが既にある時は`false`。
 */
export function restoreWorkspaceInStorage(workspace: Workspace, index: number): boolean {
  return commitWithoutHistory(restoreWorkspaceCommand(workspace, index));
}

/**
 * 中身入りのサンプルのWorkspaceを作って保存する（トップの「サンプルのWorkspaceを作る」。空のWorkspaceの「サンプルの並びで始める」は新しく作らず、画面の履歴に乗る別のコマンドで今のWorkspaceへ入れる）。
 * 全体の条件は書かない（サンプルの条件はWorkspaceのレベルに入る）。作ったら`true`。
 */
export function createSampleWorkspaceInStorage(id: string, generatePaneId: () => string): boolean {
  return commitWithoutHistory(createSampleWorkspaceCommand(id, generatePaneId));
}
