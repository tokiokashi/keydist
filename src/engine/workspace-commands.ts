import type { Command } from '#input/commands/index.ts';
import type { KeydistAssets } from './commands.ts';
import {
  addWorkspacePane,
  closeWorkspacePane,
  createWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  duplicateWorkspacePane,
  restoreWorkspace,
  renameWorkspace,
  withWorkspaceLayout,
  withWorkspacePaneOptions,
  withWorkspacePaneBinding,
  withPaneInNewLinkGroup,
  withWorkspaceTarget,
  type PaneTargetBinding,
  type Workspace,
  type WorkspaceTarget,
  type WorkspaceLibrary,
  type WorkspacePane,
  type WorkspacePaneTarget,
} from './workspace.ts';
import { fitLibraryBoard, type BoardPolicy } from './workspace-board.ts';
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

/**
 * 空のWorkspaceを作る。`id`は呼び出し側が発行する。名前が使われていれば連番を振る。
 * Workspaceの対象は、個別画面で今選んでいる対象（Singleの対象・Multiの集合）を写して始める
 * （見ていた配列から比べ始められるように）。写した後は個別画面と連動しない。
 */
export function createWorkspaceCommand(id: string, name?: string): Command<KeydistAssets> {
  return (current) => {
    const library = current.workspaces;
    if (library.some((workspace) => workspace.id === id)) return { kind: 'no-op' };
    const target: WorkspaceTarget = { single: current.singleTargetSelection, set: current.multiTargetSelection };
    return {
      kind: 'applied',
      label: 'Workspaceを作成する',
      changes: { workspaces: createWorkspace(library, () => id, name, target).library },
    };
  };
}

export function renameWorkspaceCommand(id: string, name: string): Command<KeydistAssets> {
  return workspacesCommand('Workspaceの名前を変更する', (library) => renameWorkspace(library, id, name));
}

export function deleteWorkspaceCommand(id: string): Command<KeydistAssets> {
  return workspacesCommand('Workspaceを削除する', (library) => deleteWorkspace(library, id));
}

/**
 * Workspaceを複製する。`newId`は呼び出し側が発行する。中身の写し方は`duplicateWorkspace`。
 * 複製から開く画面が新しいidを知る必要があるので、`createWorkspaceCommand`と同じくidは外から渡す。
 */
export function duplicateWorkspaceCommand(id: string, newId: string): Command<KeydistAssets> {
  return workspacesCommand('Workspaceを複製する', (library) => duplicateWorkspace(library, id, newId));
}

/**
 * 削除したWorkspaceを元の位置へ戻す。削除した画面が閉じた後（履歴が残らない所）から戻す時に使う。
 * 画面の履歴が残っている間は、削除のUndoが同じ結果になる。
 */
export function restoreWorkspaceCommand(workspace: Workspace, index: number): Command<KeydistAssets> {
  return workspacesCommand('Workspaceの削除を取り消す', (library) => restoreWorkspace(library, workspace, index));
}

/**
 * ペインを右端に足す。`pane`（idと初期の対象）は呼び出し側が組み立てる。
 * `board`を渡すと、下限を割る時に板の高さを伸ばし、縦の分割の高さを下限の比に配る（#833）。同じ1回のUndoで戻る。
 */
export function addWorkspacePaneCommand(workspaceId: string, pane: WorkspacePane, board: BoardPolicy | undefined): Command<KeydistAssets> {
  return workspacesCommand('ペインを追加する', (library) => (
    fitLibraryBoard(library, addWorkspacePane(library, workspaceId, pane), workspaceId, board, true)
  ));
}

/**
 * ペインを閉じる。板の高さには触れない（配り直しも、伸ばす計算もしない）。閉じても、どのペインの縦の割合も減らないので、
 * 伸ばす理由が無い。閉じると残りの横の分割が畳まれ、人が狭めた比の列が親の列に合わさることがあり、その並びを
 * 「形が変わった」と数えると、人の比で下限を割って板が際限なく伸びる。縮めるのは人の操作だけ。
 */
export function closeWorkspacePaneCommand(workspaceId: string, paneId: string): Command<KeydistAssets> {
  return workspacesCommand('ペインを閉じる', (library) => closeWorkspacePane(library, workspaceId, paneId));
}

/** ペインを複製する。解析設定と対象を写し、元のペインの右隣に置く。 */
export function duplicateWorkspacePaneCommand(
  workspaceId: string,
  paneId: string,
  newPaneId: string,
  board: BoardPolicy | undefined,
): Command<KeydistAssets> {
  return workspacesCommand('ペインを複製する', (library) => (
    fitLibraryBoard(library, duplicateWorkspacePane(library, workspaceId, paneId, newPaneId), workspaceId, board, true)
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

/** ペインの対象の持ち方（従う / 固定とその対象）を書き換える。 */
export function setWorkspacePaneBindingCommand(
  workspaceId: string,
  paneId: string,
  binding: PaneTargetBinding,
): Command<KeydistAssets> {
  return workspacesCommand('対象を選ぶ', (library) => withWorkspacePaneBinding(library, workspaceId, paneId, binding));
}

/**
 * 連動の組の対象を書き換える。その組に従うペイン全部が一括で追従し、他の組・固定のペインは動かない。
 * `target.kind`が単体用と集合用のどちらを書くかを決める。
 */
export function setWorkspaceTargetCommand(workspaceId: string, groupId: string, target: WorkspacePaneTarget): Command<KeydistAssets> {
  return workspacesCommand('連動の対象を選ぶ', (library) => withWorkspaceTarget(library, workspaceId, groupId, target));
}

/**
 * ペインを新しい連動の組へ移す。新しい組の対象は、そのペインが今映している対象（`current`）から始める。
 * 組の作成・ペインの付け替え・空になった組の削除は1回の操作で、Undoも1回で戻る。
 */
export function linkWorkspacePaneToNewGroupCommand(
  workspaceId: string,
  paneId: string,
  newGroupId: string,
  current: WorkspacePaneTarget,
): Command<KeydistAssets> {
  return workspacesCommand('新しい連動の組へ移す', (library) => (
    withPaneInNewLinkGroup(library, workspaceId, paneId, newGroupId, current)
  ));
}

/** ペインの並び（ドラッグ・リサイズの結果）を書き換える。 */
export function setWorkspaceLayoutCommand(workspaceId: string, layout: WorkspaceLayout, board: BoardPolicy | undefined): Command<KeydistAssets> {
  return workspacesCommand('ペインの並びを変える', (library) => (
    // サッシのドラッグは形を変えないので、板の高さにも他のペインの比にも触れない。ペインの移動・分割だけが対象
    fitLibraryBoard(library, withWorkspaceLayout(library, workspaceId, layout), workspaceId, board, true)
  ));
}
