import type { Command } from '#input/commands/index.ts';
import type { KeydistAssets } from './commands.ts';
import { multiColorSlots } from './multi-target-selection.ts';
import {
  addWorkspacePane,
  closeWorkspacePane,
  createWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  duplicateWorkspacePane,
  restoreWorkspace,
  renameWorkspace,
  withWorkspaceGrid,
  followBinding,
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
import { applySampleLayout, createSampleWorkspace } from './sample-workspace.ts';
import type { GridSize, WorkspaceGrid } from './workspace-grid.ts';

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
    const created = createWorkspaceFromAssets(current, id, name);
    if (created === undefined) return { kind: 'no-op' };
    return { kind: 'applied', label: 'Workspaceを作成する', changes: { workspaces: created.library } };
  };
}

/**
 * 今の資産から新しいWorkspaceを作る（対象の写し方を含む）。Workspaceを作るコマンドはすべてここを通し、
 * 対象の組み立て（個別画面の選択のどこをWorkspaceの最初の組へ写すか）を1か所に持つ。
 * 同じidのWorkspaceが既にあれば`undefined`。
 */
function createWorkspaceFromAssets(
  current: KeydistAssets,
  id: string,
  name?: string,
): ReturnType<typeof createWorkspace> | undefined {
  const library = current.workspaces;
  if (library.some((workspace) => workspace.id === id)) return undefined;
  const selection = current.multiTargetSelection;
  const target: WorkspaceTarget = {
    single: current.singleTargetSelection,
    set: { targets: selection.targets, baseline: selection.baseline },
  };
  // 集合の色の番号も写す（`createWorkspaceCommand`と「新しいWorkspaceに追加」で同じ）
  return createWorkspace(library, () => id, name, target, new Map(Object.entries(multiColorSlots(selection))));
}

/**
 * 中身入りのサンプルのWorkspaceを作る（中身は`sample-workspace.ts`）。`id`・`generatePaneId`は呼び出し側が発行する。
 * 対象は個別画面の選択を写さず、サンプルの定義どおり。作成は1回の操作で、元に戻すも1回で戻る。
 */
export function createSampleWorkspaceCommand(id: string, generatePaneId: () => string): Command<KeydistAssets> {
  return (current) => {
    if (current.workspaces.some((workspace) => workspace.id === id)) return { kind: 'no-op' };
    const created = createSampleWorkspace(current.workspaces, () => id, generatePaneId);
    return { kind: 'applied', label: 'サンプルのWorkspaceを作成する', changes: { workspaces: created.library } };
  };
}

/**
 * 空のWorkspaceにサンプルの並びを入れる（「サンプルの並びで始める」）。新しいWorkspaceは作らず、今のWorkspaceを書き換える。
 * 1回の操作で、元に戻すも1回で空に戻る。ペインがある・存在しないWorkspaceは何もしない。
 */
export function startWorkspaceFromSampleCommand(workspaceId: string, generatePaneId: () => string): Command<KeydistAssets> {
  return workspacesCommand('サンプルの並びで始める', (library) => applySampleLayout(library, workspaceId, generatePaneId));
}

/** 個別画面から送るAnalyzer（ペインの素）。idと、個別画面で使っていた解析設定。 */
export interface PaneFromStandalone {
  readonly paneId: string;
  readonly analyzerId: string;
  /** 個別画面の解析設定（画面で今見えている値。既定値のままでも、既定値を展開した値が入る）。 */
  readonly options: unknown;
}

function standalonePane(source: PaneFromStandalone, groupId: string): WorkspacePane {
  return { id: source.paneId, analyzerId: source.analyzerId, options: source.options, binding: followBinding(groupId) };
}

/**
 * 個別画面で見ていたAnalyzerを、既存のWorkspaceへペインとして足す（「Workspaceに追加」）。
 * 解析設定は個別画面のものを写す。対象は写さず、Workspaceの「ペインを追加」と同じく最初の連動の組に従わせる
 * （そのWorkspaceで比べている対象を、追加で黙って書き換えないため）。Workspaceが無ければ何もしない。
 */
export function addStandalonePaneToWorkspaceCommand(
  workspaceId: string,
  source: PaneFromStandalone,
  size: GridSize,
): Command<KeydistAssets> {
  return (current) => {
    const workspace = current.workspaces.find((candidate) => candidate.id === workspaceId);
    const group = workspace?.groups[0];
    if (workspace === undefined || group === undefined) return { kind: 'no-op' };
    const library = current.workspaces;
    const next = addWorkspacePane(library, workspaceId, standalonePane(source, group.id), size);
    if (next === library) return { kind: 'no-op' };
    return { kind: 'applied', label: 'Workspaceに追加する', changes: { workspaces: next } };
  };
}

/**
 * 新しいWorkspaceを作り、個別画面で見ていたAnalyzerをペインとして足す。作成と追加は1回の操作で、Undoも1回で戻る。
 * Workspaceの最初の対象は、`createWorkspaceCommand`と同じく個別画面で今選んでいる対象を写す。
 */
export function addStandalonePaneToNewWorkspaceCommand(
  workspaceId: string,
  source: PaneFromStandalone,
  size: GridSize,
): Command<KeydistAssets> {
  return (current) => {
    const created = createWorkspaceFromAssets(current, workspaceId);
    if (created === undefined) return { kind: 'no-op' };
    const group = created.created.groups[0];
    if (group === undefined) return { kind: 'no-op' };
    const withPane = addWorkspacePane(created.library, workspaceId, standalonePane(source, group.id), size);
    return { kind: 'applied', label: '新しいWorkspaceに追加する', changes: { workspaces: withPane } };
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
 * ペインを足す。`pane`（idと初期の対象）と、置く大きさ（`size`。Analyzerごとの既定は呼び出し側が持つ）は
 * 呼び出し側が渡す。置き場所は格子の空いている最初の場所で、他のペインの大きさ・位置は変わらない。
 */
export function addWorkspacePaneCommand(workspaceId: string, pane: WorkspacePane, size: GridSize): Command<KeydistAssets> {
  return workspacesCommand('ペインを追加する', (library) => addWorkspacePane(library, workspaceId, pane, size));
}

/** ペインを閉じる。下のペインは上へ詰まるが、他のペインの大きさは変わらない。 */
export function closeWorkspacePaneCommand(workspaceId: string, paneId: string): Command<KeydistAssets> {
  return workspacesCommand('ペインを閉じる', (library) => closeWorkspacePane(library, workspaceId, paneId));
}

/** ペインを複製する。解析設定と対象を写し、元のペインと同じ大きさで隣（右、無ければ真下）に置く。 */
export function duplicateWorkspacePaneCommand(
  workspaceId: string,
  paneId: string,
  newPaneId: string,
): Command<KeydistAssets> {
  return workspacesCommand('ペインを複製する', (library) => duplicateWorkspacePane(library, workspaceId, paneId, newPaneId));
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

/** ペインの並び（ドラッグ・大きさの変更の結果）を書き換える。 */
export function setWorkspaceGridCommand(workspaceId: string, grid: WorkspaceGrid): Command<KeydistAssets> {
  return workspacesCommand('ペインの並びを変える', (library) => withWorkspaceGrid(library, workspaceId, grid));
}
