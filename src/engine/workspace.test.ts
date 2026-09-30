import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnalysisTarget } from '#input/setup/index.ts';
import {
  addWorkspacePane,
  closeWorkspacePane,
  createWorkspace,
  deleteWorkspace,
  duplicateWorkspacePane,
  emptySetTarget,
  findWorkspace,
  initialWorkspaceLibrary,
  renameWorkspace,
  uniqueWorkspaceName,
  withWorkspaceLayout,
  withWorkspacePaneOptions,
  withWorkspacePaneTarget,
  withWorkspaceText,
  type WorkspaceLibrary,
  type WorkspacePane,
} from './workspace.ts';
import { layoutPaneIds } from './workspace-layout.ts';

const QWERTY: AnalysisTarget = { kind: 'layout', layoutId: 'qwerty' };
const COLEMAK: AnalysisTarget = { kind: 'layout', layoutId: 'colemak-dh' };

function pane(id: string, analyzerId = 'bigram-flow'): WorkspacePane {
  return { id, analyzerId, options: undefined, target: { kind: 'single', target: QWERTY } };
}

function libraryWith(...paneIds: string[]): WorkspaceLibrary {
  let library = createWorkspace(initialWorkspaceLibrary(), () => 'w1').library;
  for (const id of paneIds) library = addWorkspacePane(library, 'w1', pane(id));
  return library;
}

test('createWorkspace: 空のWorkspaceを作り、名前が重なれば連番を振る', () => {
  const first = createWorkspace(initialWorkspaceLibrary(), () => 'w1');
  assert.equal(first.created.name, '新しいWorkspace');
  assert.deepEqual(first.created.panes, []);
  assert.equal(first.created.layout, undefined);
  const second = createWorkspace(first.library, () => 'w2');
  assert.equal(second.created.name, '新しいWorkspace 2');
  const third = createWorkspace(second.library, () => 'w3', '  自分用  ');
  assert.equal(third.created.name, '自分用');
  assert.deepEqual(third.library.map((w) => w.id), ['w1', 'w2', 'w3']);
  assert.equal(uniqueWorkspaceName(third.library, '自分用'), '自分用 2');
});

test('renameWorkspace: 空・同じ名前は何もしない。他と同じ名前は許す', () => {
  const library = createWorkspace(createWorkspace(initialWorkspaceLibrary(), () => 'w1', 'A').library, () => 'w2', 'B').library;
  assert.equal(renameWorkspace(library, 'w1', '   '), library);
  assert.equal(renameWorkspace(library, 'w1', 'A'), library);
  assert.equal(renameWorkspace(library, 'none', 'X'), library);
  assert.equal(findWorkspace(renameWorkspace(library, 'w1', ' B '), 'w1')?.name, 'B');
});

test('deleteWorkspace: 無いidは何もしない', () => {
  const library = libraryWith();
  assert.equal(deleteWorkspace(library, 'none'), library);
  assert.deepEqual(deleteWorkspace(library, 'w1'), []);
});

test('addWorkspacePane: ペインと配置が一緒に増える。同じidは無視する', () => {
  const library = libraryWith('a', 'b');
  const workspace = findWorkspace(library, 'w1')!;
  assert.deepEqual(workspace.panes.map((p) => p.id), ['a', 'b']);
  assert.deepEqual(layoutPaneIds(workspace.layout), ['a', 'b']);
  assert.equal(addWorkspacePane(library, 'w1', pane('a')), library);
  assert.equal(addWorkspacePane(library, 'none', pane('c')), library);
});

test('closeWorkspacePane: ペインと配置から一緒に消える。無いidは何もしない', () => {
  const library = libraryWith('a', 'b');
  const closed = closeWorkspacePane(library, 'w1', 'a');
  const workspace = findWorkspace(closed, 'w1')!;
  assert.deepEqual(workspace.panes.map((p) => p.id), ['b']);
  assert.deepEqual(layoutPaneIds(workspace.layout), ['b']);
  assert.equal(closeWorkspacePane(library, 'w1', 'none'), library);
  assert.equal(findWorkspace(closeWorkspacePane(closed, 'w1', 'b'), 'w1')!.layout, undefined);
});

test('duplicateWorkspacePane: 解析設定と対象を写して右隣に置く', () => {
  let library = libraryWith('a', 'b');
  library = withWorkspacePaneOptions(library, 'w1', 'a', { foo: 1 });
  library = withWorkspacePaneTarget(library, 'w1', 'a', { kind: 'single', target: COLEMAK });
  const next = duplicateWorkspacePane(library, 'w1', 'a', 'a2');
  const workspace = findWorkspace(next, 'w1')!;
  assert.deepEqual(layoutPaneIds(workspace.layout), ['a', 'a2', 'b']);
  const copy = workspace.panes.find((p) => p.id === 'a2')!;
  assert.deepEqual(copy.options, { foo: 1 });
  assert.deepEqual(copy.target, { kind: 'single', target: COLEMAK });
  // 元のペインとは独立（複製後の書き換えが元へ及ばない）
  const edited = withWorkspacePaneOptions(next, 'w1', 'a2', { foo: 2 });
  assert.deepEqual(findWorkspace(edited, 'w1')!.panes.find((p) => p.id === 'a')!.options, { foo: 1 });
  assert.equal(duplicateWorkspacePane(library, 'w1', 'none', 'x'), library);
  assert.equal(duplicateWorkspacePane(library, 'w1', 'a', 'b'), library);
});

test('withWorkspacePaneOptions: 中身が同じなら参照を変えない。undefinedで初期状態へ戻る', () => {
  const library = withWorkspacePaneOptions(libraryWith('a'), 'w1', 'a', { x: 1, y: 2 });
  assert.equal(withWorkspacePaneOptions(library, 'w1', 'a', { y: 2, x: 1 }), library);
  const reset = withWorkspacePaneOptions(library, 'w1', 'a', undefined);
  assert.equal(findWorkspace(reset, 'w1')!.panes[0]!.options, undefined);
  assert.equal(withWorkspacePaneOptions(reset, 'w1', 'a', undefined), reset);
  assert.equal(withWorkspacePaneOptions(library, 'w1', 'none', { x: 1 }), library);
});

test('withWorkspacePaneTarget: 集合の対象へも書き換えられ、同じ中身なら何もしない', () => {
  const setPane: WorkspacePane = { id: 's', analyzerId: 'comparison', options: undefined, target: emptySetTarget() };
  const library = addWorkspacePane(libraryWith(), 'w1', setPane);
  assert.equal(withWorkspacePaneTarget(library, 'w1', 's', emptySetTarget()), library);
  const next = withWorkspacePaneTarget(library, 'w1', 's', {
    kind: 'set',
    selection: { targets: [QWERTY], baseline: undefined, colorSlots: [0] },
  });
  assert.notEqual(next, library);
});

test('withWorkspaceLayout: 重みまで同じなら何もしない。ペインと食い違う配置は直して書く', () => {
  const library = libraryWith('a', 'b');
  const layout = findWorkspace(library, 'w1')!.layout;
  assert.equal(withWorkspaceLayout(library, 'w1', layout), library);
  // ペインbを落とした配置を渡しても、bは失われず右端へ戻る
  const next = withWorkspaceLayout(library, 'w1', { kind: 'group', paneIds: ['a'], weight: 1 });
  assert.deepEqual(layoutPaneIds(findWorkspace(next, 'w1')!.layout), ['a', 'b']);
  const resized = withWorkspaceLayout(library, 'w1', {
    kind: 'split',
    direction: 'row',
    weight: 1,
    children: [{ kind: 'group', paneIds: ['a'], weight: 3 }, { kind: 'group', paneIds: ['b'], weight: 1 }],
  });
  assert.notEqual(resized, library);
});

test('withWorkspaceText: 選択を書き換える。同じ参照なら何もしない', () => {
  const library = libraryWith();
  const workspace = findWorkspace(library, 'w1')!;
  assert.equal(withWorkspaceText(library, 'w1', workspace.text), library);
  const next = withWorkspaceText(library, 'w1', { ref: { kind: 'user', id: 't1' } });
  assert.deepEqual(findWorkspace(next, 'w1')!.text, { ref: { kind: 'user', id: 't1' } });
  assert.equal(withWorkspaceText(library, 'none', { ref: { kind: 'user', id: 't1' } }), library);
});
