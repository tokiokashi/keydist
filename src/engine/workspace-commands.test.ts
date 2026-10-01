import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, emptyCommandHistory, redo, undo, type CommandHistory } from '#input/commands/index.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import { BUILTIN_TEXTS } from '#input/text/builtin.ts';
import {
  createTextCommand,
  deleteTextCommand,
  selectTextCommand,
  setTextContentCommand,
  setTextLanguageOverrideCommand,
  textSelectionOf,
  type KeydistAssets,
} from './commands.ts';
import { initialMultiTargetSelection, initialTargetSet } from './multi-target-selection.ts';
import { initialSingleTargetSelection } from './single-target-selection.ts';
import {
  addWorkspacePaneCommand,
  closeWorkspacePaneCommand,
  createWorkspaceCommand,
  deleteWorkspaceCommand,
  duplicateWorkspaceCommand,
  restoreWorkspaceCommand,
  duplicateWorkspacePaneCommand,
  renameWorkspaceCommand,
  setWorkspaceLayoutCommand,
  setWorkspacePaneOptionsCommand,
  setWorkspacePaneBindingCommand,
  linkWorkspacePaneToNewGroupCommand,
  setWorkspaceTargetCommand,
} from './workspace-commands.ts';
import { findWorkspace, followBinding, INITIAL_LINK_GROUP_ID as G, type WorkspacePane } from './workspace.ts';
import { layoutPaneIds } from './workspace-layout.ts';

function emptyAssets(): KeydistAssets {
  return {
    setupLibrary: { setups: [], overrides: emptyCascadeOverrides() },
    fingerAssignments: [],
    textLibrary: emptyTextLibrary(),
    standaloneTextSelection: initialTextSelection(),
    standaloneAnalyzerOptions: {},
    multiTargetSelection: initialMultiTargetSelection(),
    singleTargetSelection: initialSingleTargetSelection(),
    workspaces: [],
    presetLibrary: { presets: [] },
  };
}

const pane = (id: string): WorkspacePane => ({
  id,
  analyzerId: 'bigram-flow',
  options: undefined,
  binding: followBinding(G),
});

interface State {
  readonly assets: KeydistAssets;
  readonly history: CommandHistory<KeydistAssets>;
}

function run(state: State, ...commands: Parameters<typeof applyCommand<KeydistAssets>>[2][]): State {
  let current = state;
  for (const command of commands) {
    const step = applyCommand(current.assets, current.history, command);
    current = { assets: step.assets, history: step.history };
  }
  return current;
}

let nextTextId = 0;
const generateTextId = () => `text-${++nextTextId}`;

function withWorkspace(): State {
  return run(
    { assets: emptyAssets(), history: emptyCommandHistory() },
    createWorkspaceCommand('w1'),
    addWorkspacePaneCommand('w1', pane('a'), undefined),
    addWorkspacePaneCommand('w1', pane('b'), undefined),
  );
}

test('作成・ペインの追加/複製/閉じる・名前の変更がUndo / Redoで往復する', () => {
  const start = { assets: emptyAssets(), history: emptyCommandHistory<KeydistAssets>() };
  const created = run(start, createWorkspaceCommand('w1'));
  assert.equal(created.assets.workspaces.length, 1);

  const added = run(created, addWorkspacePaneCommand('w1', pane('a'), undefined));
  assert.equal(findWorkspace(added.assets.workspaces, 'w1')!.panes.length, 1);

  const duplicated = run(added, duplicateWorkspacePaneCommand('w1', 'a', 'a2', undefined));
  assert.deepEqual(layoutPaneIds(findWorkspace(duplicated.assets.workspaces, 'w1')!.layout), ['a', 'a2']);

  const renamed = run(duplicated, renameWorkspaceCommand('w1', '比較'));
  assert.equal(findWorkspace(renamed.assets.workspaces, 'w1')!.name, '比較');

  const closed = run(renamed, closeWorkspacePaneCommand('w1', 'a'));
  assert.deepEqual(findWorkspace(closed.assets.workspaces, 'w1')!.panes.map((p) => p.id), ['a2']);

  // 5つの操作（作成・追加・複製・名前の変更・閉じる）を1手ずつ戻す
  let state = closed;
  for (let step = 1; step <= 5; step += 1) {
    const result = undo(state.assets, state.history);
    assert.equal(result.outcome.kind, 'applied', `${step}手目のUndo`);
    state = { assets: result.assets, history: result.history };
  }
  assert.deepEqual(state.assets.workspaces, []);

  // やり直しで元に戻る
  for (let i = 0; i < 5; i += 1) {
    const step = redo(state.assets, state.history);
    state = { assets: step.assets, history: step.history };
  }
  assert.deepEqual(state.assets.workspaces, closed.assets.workspaces);
});

test('Undoで消えたペインが、配置ごと元の位置へ戻る', () => {
  const state = withWorkspace();
  const closed = run(state, closeWorkspacePaneCommand('w1', 'a'));
  const step = undo(closed.assets, closed.history);
  assert.deepEqual(step.assets.workspaces, state.assets.workspaces);
});

test('存在しないWorkspace・ペインへの書き込みは履歴に積まない', () => {
  const state = withWorkspace();
  const depth = state.history.undoStack.length;
  const next = run(
    state,
    closeWorkspacePaneCommand('w1', 'none'),
    closeWorkspacePaneCommand('none', 'a'),
    renameWorkspaceCommand('w1', '   '),
    setWorkspacePaneOptionsCommand('w1', 'none', {}),
    deleteWorkspaceCommand('none'),
    createWorkspaceCommand('w1'),
  );
  assert.equal(next.history.undoStack.length, depth);
  assert.equal(next.assets.workspaces, state.assets.workspaces);
});

test('解析設定・対象・並びの書き込みは、同じ中身なら履歴に積まない', () => {
  const state = withWorkspace();
  const once = run(state, setWorkspacePaneOptionsCommand('w1', 'a', { x: 1 }));
  const depth = once.history.undoStack.length;
  const again = run(
    once,
    setWorkspacePaneOptionsCommand('w1', 'a', { x: 1 }),
    setWorkspacePaneBindingCommand('w1', 'a', followBinding(G)),
    setWorkspaceTargetCommand('w1', G, { kind: 'set', selection: initialTargetSet() }),
    setWorkspaceLayoutCommand('w1', findWorkspace(once.assets.workspaces, 'w1')!.layout, undefined),
  );
  assert.equal(again.history.undoStack.length, depth);
  const changed = run(again, setWorkspacePaneBindingCommand('w1', 'a', { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId: 'colemak-dh' } } }));
  assert.equal(changed.history.undoStack.length, depth + 1);
});

test('Workspaceの対象の切り替えは1回のUndoで戻り、固定のペインは動かない', () => {
  const state = run(
    withWorkspace(),
    setWorkspacePaneBindingCommand('w1', 'b', { mode: 'fixed', target: { kind: 'single', target: { kind: 'layout', layoutId: 'qwerty' } } }),
  );
  const switched = run(state, setWorkspaceTargetCommand('w1', G, { kind: 'single', target: { kind: 'layout', layoutId: 'colemak-dh' } }));
  const after = findWorkspace(switched.assets.workspaces, 'w1')!;
  assert.deepEqual(after.groups[0]!.target.single.target, { kind: 'layout', layoutId: 'colemak-dh' });
  assert.deepEqual(after.panes.map((p) => p.binding), findWorkspace(state.assets.workspaces, 'w1')!.panes.map((p) => p.binding));
  const undone = undo(switched.assets, switched.history);
  assert.deepEqual(findWorkspace(undone.assets.workspaces, 'w1')!.groups, findWorkspace(state.assets.workspaces, 'w1')!.groups);
});

test('createWorkspaceCommand: 個別画面で選んでいる対象を、Workspaceの対象として写して始める', () => {
  const base = emptyAssets();
  const assets: KeydistAssets = {
    ...base,
    singleTargetSelection: { target: { kind: 'layout', layoutId: 'colemak-dh' } },
    multiTargetSelection: { targets: [{ kind: 'layout', layoutId: 'qwerty' }], baseline: undefined, colorSlots: [0] },
  };
  const created = run({ assets, history: emptyCommandHistory() }, createWorkspaceCommand('w9'));
  const workspace = findWorkspace(created.assets.workspaces, 'w9')!;
  assert.deepEqual(workspace.groups[0]!.target.single, assets.singleTargetSelection);
  assert.deepEqual(workspace.groups[0]!.target.set, { targets: assets.multiTargetSelection.targets, baseline: undefined });
  // 個別画面で配っていた色を引き継ぐ
  assert.deepEqual(workspace.colorSlots, { 'layout:qwerty': 0 });
});

test('新しい組への付け替えと、組ごとの対象の切り替えは、それぞれ1回のUndoで戻る', () => {
  const state = withWorkspace();
  const linked = run(state, linkWorkspacePaneToNewGroupCommand('w1', 'b', 'g2', { kind: 'single', target: { kind: 'layout', layoutId: 'colemak-dh' } }));
  const workspace = findWorkspace(linked.assets.workspaces, 'w1')!;
  assert.deepEqual(workspace.groups.map((g) => g.id), [G, 'g2']);
  assert.deepEqual(workspace.panes.map((p) => p.binding), [followBinding(G), followBinding('g2')]);
  assert.equal(linked.history.undoStack.length, state.history.undoStack.length + 1);

  const switched = run(linked, setWorkspaceTargetCommand('w1', G, { kind: 'single', target: { kind: 'layout', layoutId: 'qwerty' } }));
  const after = findWorkspace(switched.assets.workspaces, 'w1')!;
  assert.deepEqual(after.groups[0]!.target.single.target, { kind: 'layout', layoutId: 'qwerty' });
  assert.deepEqual(after.groups[1], workspace.groups[1]);
  assert.deepEqual(findWorkspace(undo(switched.assets, switched.history).assets.workspaces, 'w1')!.groups, workspace.groups);
  assert.deepEqual(findWorkspace(undo(linked.assets, linked.history).assets.workspaces, 'w1')!.groups, findWorkspace(state.assets.workspaces, 'w1')!.groups);
});

test('削除はUndoで戻る', () => {
  const state = withWorkspace();
  const deleted = run(state, deleteWorkspaceCommand('w1'));
  assert.deepEqual(deleted.assets.workspaces, []);
  assert.deepEqual(undo(deleted.assets, deleted.history).assets.workspaces, state.assets.workspaces);
});

test('Workspaceのテキストの選択は個別画面の選択と別に持つ', () => {
  const state = withWorkspace();
  const holder = { workspaceId: 'w1' } as const;
  const other = BUILTIN_TEXTS.find((text) => text.id !== initialTextSelection().ref.id)!;

  const selected = run(state, selectTextCommand(holder, { kind: 'builtin', id: other.id }));
  assert.equal(textSelectionOf(selected.assets, holder)?.ref.id, other.id);
  assert.equal(selected.assets.standaloneTextSelection.ref.id, initialTextSelection().ref.id);

  // 個別画面側の選択は、Workspaceの選択に影響しない
  const standaloneChanged = run(selected, selectTextCommand('standalone', initialTextSelection().ref));
  assert.equal(textSelectionOf(standaloneChanged.assets, holder)?.ref.id, other.id);

  // Undoで両方戻る
  const undone = undo(selected.assets, selected.history);
  assert.equal(textSelectionOf(undone.assets, holder)?.ref.id, initialTextSelection().ref.id);
});

test('Workspaceのテキスト: 新規作成はそのWorkspaceだけが選び、組み込みを書き換えると自作の複製へ移る', () => {
  const state = withWorkspace();
  const holder = { workspaceId: 'w1' } as const;

  const created = run(state, createTextCommand(holder, generateTextId));
  const ref = textSelectionOf(created.assets, holder)!.ref;
  assert.equal(ref.kind, 'user');
  assert.equal(created.assets.standaloneTextSelection.ref.kind, 'builtin');

  const back = run(created, selectTextCommand(holder, initialTextSelection().ref));
  const edited = run(back, setTextContentCommand(holder, initialTextSelection().ref, 'ちがう本文', generateTextId));
  assert.equal(textSelectionOf(edited.assets, holder)!.ref.kind, 'user');
  assert.equal(edited.assets.standaloneTextSelection.ref.kind, 'builtin');
});

test('Workspaceのテキスト: 選んでいたテキストを消すと、そのWorkspaceだけ既定へ戻る', () => {
  const state = withWorkspace();
  const holder = { workspaceId: 'w1' } as const;
  const created = run(state, createTextCommand(holder, generateTextId));
  const ref = textSelectionOf(created.assets, holder)!.ref;
  const deleted = run(created, deleteTextCommand(holder, ref.id));
  assert.deepEqual(textSelectionOf(deleted.assets, holder)?.ref, initialTextSelection().ref);
});

test('持ち主のWorkspaceが無い時、テキストの書き込みは何もしない', () => {
  const state = { assets: emptyAssets(), history: emptyCommandHistory<KeydistAssets>() };
  const holder = { workspaceId: 'gone' } as const;
  const next = run(
    state,
    selectTextCommand(holder, { kind: 'builtin', id: BUILTIN_TEXTS[0]!.id }),
    createTextCommand(holder, generateTextId),
    setTextLanguageOverrideCommand(holder, 'en'),
    setTextContentCommand(holder, initialTextSelection().ref, 'x', generateTextId),
  );
  assert.equal(next.history.undoStack.length, 0);
  assert.equal(textSelectionOf(next.assets, holder), undefined);
});

/** ペイン・連動・固定・解析設定・テキスト・名前まで手を入れた、複製の元になるWorkspace。 */
function richWorkspace(): State {
  const other = BUILTIN_TEXTS.find((text) => text.id !== initialTextSelection().ref.id)!;
  return run(
    withWorkspace(),
    renameWorkspaceCommand('w1', '比較'),
    setWorkspacePaneOptionsCommand('w1', 'a', { x: 1 }),
    setWorkspacePaneBindingCommand('w1', 'b', {
      mode: 'fixed',
      target: { kind: 'set', selection: initialTargetSet() },
    }),
    linkWorkspacePaneToNewGroupCommand('w1', 'a', 'link-2', { kind: 'single', target: { kind: 'layout', layoutId: 'qwerty' } }),
    selectTextCommand({ workspaceId: 'w1' }, { kind: 'builtin', id: other.id }),
  );
}

test('複製は、ペインの並び・連動の組・固定の対象・解析設定・テキストをそのまま写し、idと名前だけが新しい', () => {
  const state = richWorkspace();
  const copied = run(state, duplicateWorkspaceCommand('w1', 'w2'));
  const source = findWorkspace(copied.assets.workspaces, 'w1')!;
  const copy = findWorkspace(copied.assets.workspaces, 'w2')!;
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.name, '比較 のコピー');
  assert.deepEqual({ ...copy, id: '', name: '' }, { ...source, id: '', name: '' });
  // 元は変わらない
  assert.deepEqual(source, findWorkspace(state.assets.workspaces, 'w1'));
  // 写した後は別物: 片方の書き込みがもう片方に及ばない
  const edited = run(copied, setWorkspacePaneOptionsCommand('w2', 'a', { x: 2 }));
  assert.deepEqual(findWorkspace(edited.assets.workspaces, 'w1')!.panes[0]!.options, { x: 1 });
});

test('複製は元の右隣に置き、名前が使われていれば連番を振る', () => {
  const state = run(richWorkspace(), createWorkspaceCommand('w3', '別'));
  const twice = run(state, duplicateWorkspaceCommand('w1', 'w2'), duplicateWorkspaceCommand('w1', 'w4'));
  assert.deepEqual(twice.assets.workspaces.map((workspace) => workspace.id), ['w1', 'w4', 'w2', 'w3']);
  assert.deepEqual(twice.assets.workspaces.map((workspace) => workspace.name), ['比較', '比較 のコピー 2', '比較 のコピー', '別']);
});

test('複製はUndoで消え、Redoで戻る。無い元・使われているidは履歴に積まない', () => {
  const state = richWorkspace();
  const copied = run(state, duplicateWorkspaceCommand('w1', 'w2'));
  const undone = undo(copied.assets, copied.history);
  assert.deepEqual(undone.assets.workspaces, state.assets.workspaces);
  assert.deepEqual(redo(undone.assets, undone.history).assets.workspaces, copied.assets.workspaces);

  const depth = state.history.undoStack.length;
  const noop = run(state, duplicateWorkspaceCommand('none', 'w2'), duplicateWorkspaceCommand('w1', 'w1'));
  assert.equal(noop.history.undoStack.length, depth);
  assert.equal(noop.assets.workspaces, state.assets.workspaces);
});

test('削除したWorkspaceは元の位置へ復元でき、同じidがあれば何もしない', () => {
  const state = run(richWorkspace(), createWorkspaceCommand('w3'), createWorkspaceCommand('w5'));
  const deleted = findWorkspace(state.assets.workspaces, 'w3')!;
  const index = state.assets.workspaces.indexOf(deleted);
  const after = run(state, deleteWorkspaceCommand('w3'));
  const restored = run(after, restoreWorkspaceCommand(deleted, index));
  assert.deepEqual(restored.assets.workspaces, state.assets.workspaces);
  // 一覧が短くなっていれば末尾へ
  const tail = run(after, deleteWorkspaceCommand('w5'), restoreWorkspaceCommand(deleted, 9));
  assert.deepEqual(tail.assets.workspaces.map((workspace) => workspace.id), ['w1', 'w3']);
  // 既にあるidは積まない
  const depth = restored.history.undoStack.length;
  assert.equal(run(restored, restoreWorkspaceCommand(deleted, 0)).history.undoStack.length, depth);
});
