import type { Command } from '#input/commands/index.ts';
import type { KeydistAssets } from './commands.ts';
import {
  addWorkspacePane,
  closeWorkspacePane,
  createWorkspace,
  deleteWorkspace,
  duplicateWorkspacePane,
  renameWorkspace,
  withWorkspaceLayout,
  withWorkspacePaneOptions,
  withWorkspacePaneTarget,
  type WorkspaceLibrary,
  type WorkspacePane,
  type WorkspacePaneTarget,
} from './workspace.ts';
import type { WorkspaceLayout } from './workspace-layout.ts';

/**
 * Workspaceへの書き込み（#544 §8-2「書き込みはすべてコマンドを通す」）。
 *
 * `workspaces`だけに触れるコマンドの共通の骨組み。`compute`が同じ参照を返せば何もしなかったことに
 * なり（`no-op`）、Undoの履歴にも積まない（`input/commands/history.ts`が現在値と比べる）。
 * idの発行は純関数のコマンドの外（呼び出し側）で行い、値として渡す（`createSetupCommand`と違い、
 * 作った後に開く画面が新しいidを知る必要があるため）。
 */
function workspacesCommand(
  label: string,
  compute: (library: WorkspaceLibrary) => WorkspaceLibrary,
): Command<KeydistAssets> {
  return (current) => {
    const next = compute(current.workspaces);
    if (next === current.workspaces) return { kind: 'no-op' };
    return { kind: 'applied', label, changes: { workspaces: next } };
  };
}

/** 空のWorkspaceを作る。`id`は呼び出し側が発行する。名前が使われていれば連番を振る。 */
export function createWorkspaceCommand(id: string, name?: string): Command<KeydistAssets> {
  return workspacesCommand('Workspaceを作成する', (library) => {
    if (library.some((workspace) => workspace.id === id)) return library;
    return createWorkspace(library, () => id, name).library;
  });
}

export function renameWorkspaceCommand(id: string, name: string): Command<KeydistAssets> {
  return workspacesCommand('Workspaceの名前を変更する', (library) => renameWorkspace(library, id, name));
}

export function deleteWorkspaceCommand(id: string): Command<KeydistAssets> {
  return workspacesCommand('Workspaceを削除する', (library) => deleteWorkspace(library, id));
}

/** ペインを右端に足す。`pane`（idと初期の対象）は呼び出し側が組み立てる。 */
export function addWorkspacePaneCommand(workspaceId: string, pane: WorkspacePane): Command<KeydistAssets> {
  return workspacesCommand('ペインを追加する', (library) => addWorkspacePane(library, workspaceId, pane));
}

export function closeWorkspacePaneCommand(workspaceId: string, paneId: string): Command<KeydistAssets> {
  return workspacesCommand('ペインを閉じる', (library) => closeWorkspacePane(library, workspaceId, paneId));
}

/** ペインを複製する。解析設定と対象を写し、元のペインの右隣に置く。 */
export function duplicateWorkspacePaneCommand(
  workspaceId: string,
  paneId: string,
  newPaneId: string,
): Command<KeydistAssets> {
  return workspacesCommand('ペインを複製する', (library) => (
    duplicateWorkspacePane(library, workspaceId, paneId, newPaneId)
  ));
}

/** ペインの解析設定を書き換える。`undefined`は一度も変えていない状態（Analyzerの既定値）へ戻す。 */
export function setWorkspacePaneOptionsCommand(
  workspaceId: string,
  paneId: string,
  options: unknown,
): Command<KeydistAssets> {
  return workspacesCommand('解析設定を変更する', (library) => (
    withWorkspacePaneOptions(library, workspaceId, paneId, options)
  ));
}

export function setWorkspacePaneTargetCommand(
  workspaceId: string,
  paneId: string,
  target: WorkspacePaneTarget,
): Command<KeydistAssets> {
  return workspacesCommand('対象を選ぶ', (library) => withWorkspacePaneTarget(library, workspaceId, paneId, target));
}

/** ペインの並び（ドラッグ・リサイズの結果）を書き換える。 */
export function setWorkspaceLayoutCommand(workspaceId: string, layout: WorkspaceLayout): Command<KeydistAssets> {
  return workspacesCommand('ペインの並びを変える', (library) => withWorkspaceLayout(library, workspaceId, layout));
}
