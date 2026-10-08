import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnalysisTarget } from '#input/setup/index.ts';
import {
  addWorkspacePane,
  BLANK_PANE_ID,
  NO_BINDING,
  closeWorkspacePane,
  createWorkspace,
  deleteWorkspace,
  duplicateWorkspacePane,
  findWorkspace,
  followBinding,
  INITIAL_LINK_GROUP_ID,
  initialWorkspaceLibrary,
  resolveWorkspacePaneTarget,
  workspaceLayoutIds,
  renameWorkspace,
  uniqueWorkspaceName,
  withWorkspaceGrid,
  withWorkspaceCompactPanes,
  duplicateWorkspace,
  withWorkspacePaneOptions,
  withWorkspacePaneBinding,
  withPaneInNewLinkGroup,
  withWorkspaceTarget,
  withWorkspaceText,
  type WorkspaceLibrary,
  type WorkspacePane,
  type WorkspaceTarget,
  OWN_OPTIONS,
} from './workspace.ts';
import { gridPaneIds, type GridSize } from './workspace-grid.ts';

const G = INITIAL_LINK_GROUP_ID;
const SIZE: GridSize = { w: 6, h: 10 };
const QWERTY: AnalysisTarget = { kind: 'layout', layoutId: 'qwerty' };
const COLEMAK: AnalysisTarget = { kind: 'layout', layoutId: 'colemak-dh' };

function pane(id: string, analyzerId = 'bigram-flow'): WorkspacePane {
  return { id, analyzerId, options: undefined, optionsBinding: OWN_OPTIONS, binding: followBinding(G) };
}

function libraryWith(...paneIds: string[]): WorkspaceLibrary {
  let library = createWorkspace(initialWorkspaceLibrary(), () => 'w1').library;
  for (const id of paneIds) library = addWorkspacePane(library, 'w1', pane(id), SIZE);
  return library;
}

test('createWorkspace: 空のWorkspaceを作り、名前が重なれば連番を振る', () => {
  const first = createWorkspace(initialWorkspaceLibrary(), () => 'w1');
  assert.equal(first.created.name, '新しいWorkspace');
  assert.deepEqual(first.created.panes, []);
  assert.deepEqual(first.created.grid, []);
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

test('addWorkspacePane: ペインと枠が一緒に増える。同じidは無視する', () => {
  const library = libraryWith('a', 'b');
  const workspace = findWorkspace(library, 'w1')!;
  assert.deepEqual(workspace.panes.map((p) => p.id), ['a', 'b']);
  assert.deepEqual(workspace.grid.map((item) => [item.id, item.w, item.h]), [['a', 6, 10], ['b', 6, 10]]);
  assert.deepEqual(gridPaneIds(workspace.grid), ['a', 'b']);
  assert.equal(addWorkspacePane(library, 'w1', pane('a'), SIZE), library);
  assert.equal(addWorkspacePane(library, 'none', pane('c'), SIZE), library);
});

test('closeWorkspacePane: ペインと配置から一緒に消える。無いidは何もしない', () => {
  const library = libraryWith('a', 'b');
  const closed = closeWorkspacePane(library, 'w1', 'a');
  const workspace = findWorkspace(closed, 'w1')!;
  assert.deepEqual(workspace.panes.map((p) => p.id), ['b']);
  assert.deepEqual(gridPaneIds(workspace.grid), ['b']);
  assert.equal(closeWorkspacePane(library, 'w1', 'none'), library);
  assert.deepEqual(findWorkspace(closeWorkspacePane(closed, 'w1', 'b'), 'w1')!.grid, []);
});

test('duplicateWorkspacePane: 解析設定と対象の持ち方（従う / 固定）を写して、同じ大きさで右隣に置く', () => {
  let library = libraryWith('a', 'b');
  library = withWorkspacePaneOptions(library, 'w1', 'a', { foo: 1 });
  library = withWorkspacePaneBinding(library, 'w1', 'a', { mode: 'fixed', target: { kind: 'single', target: COLEMAK } });
  const next = duplicateWorkspacePane(library, 'w1', 'a', 'a2');
  const workspace = findWorkspace(next, 'w1')!;
  // aの右隣はbで塞がっているので、真下に置く（読み順ではbの後）
  assert.deepEqual(gridPaneIds(workspace.grid), ['a', 'b', 'a2']);
  const [source, copyItem] = [workspace.grid.find((i) => i.id === 'a')!, workspace.grid.find((i) => i.id === 'a2')!];
  assert.deepEqual([copyItem.w, copyItem.h], [source.w, source.h]);
  const copy = workspace.panes.find((p) => p.id === 'a2')!;
  assert.deepEqual(copy.options, { foo: 1 });
  assert.deepEqual(copy.binding, { mode: 'fixed', target: { kind: 'single', target: COLEMAK } });
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

const group = (library: WorkspaceLibrary, id = G) => findWorkspace(library, 'w1')!.groups.find((g) => g.id === id)!;

test('createWorkspace: 連動の組を1つ持ち、対象は渡された値から始める。省略すれば空から始める', () => {
  const empty = createWorkspace(initialWorkspaceLibrary(), () => 'w1').created;
  assert.deepEqual(empty.groups.map((g) => g.id), [G]);
  assert.deepEqual(empty.groups[0]!.target.single, { target: undefined });
  assert.deepEqual(empty.groups[0]!.target.set.targets, []);
  const target: WorkspaceTarget = {
    single: { target: COLEMAK },
    set: { targets: [QWERTY], baseline: undefined },
  };
  assert.deepEqual(createWorkspace(initialWorkspaceLibrary(), () => 'w2', undefined, target).created.groups[0]!.target, target);
});

test('withWorkspaceTarget: 組の単体用と集合用を別々に書き、同じ中身・無い組は何もしない', () => {
  const library = libraryWith();
  const single = withWorkspaceTarget(library, 'w1', G, { kind: 'single', target: COLEMAK });
  assert.deepEqual(group(single).target.single, { target: COLEMAK });
  assert.deepEqual(group(single).target.set.targets, []);
  assert.equal(withWorkspaceTarget(single, 'w1', G, { kind: 'single', target: { ...COLEMAK } }), single);

  const selection = { targets: [QWERTY], baseline: undefined };
  const set = withWorkspaceTarget(single, 'w1', G, { kind: 'set', selection });
  assert.deepEqual(group(set).target.set, selection);
  assert.deepEqual(group(set).target.single, { target: COLEMAK });
  assert.equal(withWorkspaceTarget(set, 'w1', G, { kind: 'set', selection: { ...selection } }), set);
  assert.equal(withWorkspaceTarget(set, 'none', G, { kind: 'single', target: QWERTY }), set);
  assert.equal(withWorkspaceTarget(set, 'w1', 'no-group', { kind: 'single', target: QWERTY }), set);
});

test('resolveWorkspacePaneTarget: 従うペインは組の対象、固定のペインは自分の対象を映す', () => {
  const groups = [
    { id: G, target: { single: { target: COLEMAK }, set: { targets: [QWERTY], baseline: undefined } } },
    { id: 'g2', target: { single: { target: QWERTY }, set: { targets: [], baseline: undefined } } },
  ];
  assert.deepEqual(resolveWorkspacePaneTarget(followBinding(G), groups, 'single'), { kind: 'single', target: COLEMAK });
  assert.deepEqual(resolveWorkspacePaneTarget(followBinding('g2'), groups, 'single'), { kind: 'single', target: QWERTY });
  assert.deepEqual(resolveWorkspacePaneTarget(followBinding(G), groups, 'set'), { kind: 'set', selection: groups[0]!.target.set });
  // Singleをまだ選んでいなければ既定の配列
  const unselected = resolveWorkspacePaneTarget(followBinding(G), [{ id: G, target: { ...groups[0]!.target, single: { target: undefined } } }], 'single');
  assert.equal(unselected?.kind, 'single');
  // 存在しない組には従えない
  assert.equal(resolveWorkspacePaneTarget(followBinding('none'), groups, 'single'), undefined);
  const fixed = { mode: 'fixed', target: { kind: 'single', target: QWERTY } } as const;
  assert.deepEqual(resolveWorkspacePaneTarget(fixed, groups, 'single'), fixed.target);
  // 形が合わない固定の対象は映せない
  assert.equal(resolveWorkspacePaneTarget(fixed, groups, 'set'), undefined);
});

test('withWorkspacePaneBinding: 従う組 / 固定を切り替え、同じ中身なら何もしない。組の対象は固定のペインに及ばない', () => {
  const library = libraryWith('a', 'b');
  assert.equal(withWorkspacePaneBinding(library, 'w1', 'a', followBinding(G)), library);
  const fixed = withWorkspacePaneBinding(library, 'w1', 'a', { mode: 'fixed', target: { kind: 'single', target: QWERTY } });
  assert.notEqual(fixed, library);
  assert.equal(withWorkspacePaneBinding(fixed, 'w1', 'a', { mode: 'fixed', target: { kind: 'single', target: { ...QWERTY } } }), fixed);
  const moved = withWorkspaceTarget(fixed, 'w1', G, { kind: 'single', target: COLEMAK });
  assert.deepEqual(findWorkspace(moved, 'w1')!.panes[0]!.binding, { mode: 'fixed', target: { kind: 'single', target: QWERTY } });
  assert.deepEqual(findWorkspace(moved, 'w1')!.panes[1]!.binding, followBinding(G));
  assert.equal(withWorkspacePaneBinding(library, 'w1', 'none', followBinding(G)), library);
  // 存在しない組へは従わせられない
  assert.equal(withWorkspacePaneBinding(library, 'w1', 'a', followBinding('no-group')), library);
});

test('withPaneInNewLinkGroup: 今の対象で新しい組を作って移り、組ごとに対象が別々になる。空になった組は消える', () => {
  let library = libraryWith('a', 'b', 'c');
  library = withWorkspaceTarget(library, 'w1', G, { kind: 'set', selection: { targets: [QWERTY], baseline: undefined } });
  const next = withPaneInNewLinkGroup(library, 'w1', 'c', 'g2', { kind: 'single', target: COLEMAK });
  const workspace = findWorkspace(next, 'w1')!;
  assert.deepEqual(workspace.groups.map((g) => g.id), [G, 'g2']);
  assert.deepEqual(workspace.panes.map((p) => p.binding), [followBinding(G), followBinding(G), followBinding('g2')]);
  // 新しい組は今の対象（Single）で始まり、別の形（Multi）は元の組から写す
  assert.deepEqual(group(next, 'g2').target.single, { target: COLEMAK });
  assert.deepEqual(group(next, 'g2').target.set, group(library).target.set);
  // 元の組は動かない。組を書き換えても他の組は動かない
  assert.deepEqual(group(next).target.single, { target: undefined });
  const edited = withWorkspaceTarget(next, 'w1', 'g2', { kind: 'single', target: QWERTY });
  assert.deepEqual(group(edited).target.single, { target: undefined });
  assert.deepEqual(group(edited, 'g2').target.single, { target: QWERTY });
  // 既にあるid・無いペインは何もしない
  assert.equal(withPaneInNewLinkGroup(next, 'w1', 'a', 'g2', { kind: 'single', target: QWERTY }), next);
  assert.equal(withPaneInNewLinkGroup(next, 'w1', 'none', 'g3', { kind: 'single', target: QWERTY }), next);

  // どのペインも従わなくなった組は消える（固定にした・別の組へ移した・ペインを閉じた）
  const fixed = withWorkspacePaneBinding(next, 'w1', 'c', { mode: 'fixed', target: { kind: 'single', target: COLEMAK } });
  assert.deepEqual(findWorkspace(fixed, 'w1')!.groups.map((g) => g.id), [G]);
  const moved = withWorkspacePaneBinding(next, 'w1', 'c', followBinding(G));
  assert.deepEqual(findWorkspace(moved, 'w1')!.groups.map((g) => g.id), [G]);
  const closed = closeWorkspacePane(next, 'w1', 'c');
  assert.deepEqual(findWorkspace(closed, 'w1')!.groups.map((g) => g.id), [G]);
  // 新しい組へ移した結果、元の組が空になれば元の組が消える
  const alone = withPaneInNewLinkGroup(libraryWith('a'), 'w1', 'a', 'g2', { kind: 'single', target: COLEMAK });
  assert.deepEqual(findWorkspace(alone, 'w1')!.groups.map((g) => g.id), ['g2']);
});

test('組は1つ以上残る。全ペインを閉じても先頭の組と対象を失わない', () => {
  let library = libraryWith('a');
  library = withWorkspaceTarget(library, 'w1', G, { kind: 'single', target: COLEMAK });
  const closed = closeWorkspacePane(library, 'w1', 'a');
  assert.deepEqual(group(closed).target.single, { target: COLEMAK });
  const allFixed = withWorkspacePaneBinding(library, 'w1', 'a', { mode: 'fixed', target: { kind: 'single', target: QWERTY } });
  assert.deepEqual(findWorkspace(allFixed, 'w1')!.groups.map((g) => g.id), [G]);
});

test('withWorkspaceGrid: 位置と大きさが同じなら何もしない。ペインと食い違う配置は直して書く', () => {
  const library = libraryWith('a', 'b');
  const grid = findWorkspace(library, 'w1')!.grid;
  assert.equal(withWorkspaceGrid(library, 'w1', grid), library);
  // ペインbの枠を落とした配置を渡しても、bは失われず空いている場所へ戻る
  const next = withWorkspaceGrid(library, 'w1', [grid[0]!]);
  assert.deepEqual([...gridPaneIds(findWorkspace(next, 'w1')!.grid)].sort(), ['a', 'b']);
  // aだけの大きさを変えても、bの大きさは変わらない
  const resized = withWorkspaceGrid(library, 'w1', [{ ...grid[0]!, w: 4, h: 14 }, grid[1]!]);
  assert.notEqual(resized, library);
  const after = findWorkspace(resized, 'w1')!.grid;
  assert.deepEqual(after.find((i) => i.id === 'b'), grid[1]);
});

test('withWorkspaceText: 選択を書き換える。同じ参照なら何もしない', () => {
  const library = libraryWith();
  const workspace = findWorkspace(library, 'w1')!;
  assert.equal(withWorkspaceText(library, 'w1', workspace.text), library);
  const next = withWorkspaceText(library, 'w1', { ref: { kind: 'user', id: 't1' } });
  assert.deepEqual(findWorkspace(next, 'w1')!.text, { ref: { kind: 'user', id: 't1' } });
  assert.equal(withWorkspaceText(library, 'none', { ref: { kind: 'user', id: 't1' } }), library);
});

test('workspaceLayoutIds: 従う組の対象（単体・集合）と固定のペインの対象に含まれる配列を重複なく返す。Setupは含めない', () => {
  const OONISHI: AnalysisTarget = { kind: 'layout', layoutId: 'oonishi' };
  const SETUP: AnalysisTarget = { kind: 'setup', setupId: 's1' };
  let library = libraryWith('a', 'b');
  library = withWorkspaceTarget(library, 'w1', G, { kind: 'single', target: COLEMAK });
  library = withWorkspaceTarget(library, 'w1', G, { kind: 'set', selection: { targets: [QWERTY, COLEMAK, SETUP], baseline: undefined } });
  assert.deepEqual(workspaceLayoutIds(findWorkspace(library, 'w1')!), ['colemak-dh', 'qwerty']);
  // 固定のペインは自分の対象を足す。従うペインが無くなった組の対象は含めない。
  library = withWorkspacePaneBinding(library, 'w1', 'a', { mode: 'fixed', target: { kind: 'single', target: OONISHI } });
  library = withWorkspacePaneBinding(library, 'w1', 'b', { mode: 'fixed', target: { kind: 'set', selection: { targets: [QWERTY], baseline: undefined } } });
  assert.deepEqual(workspaceLayoutIds(findWorkspace(library, 'w1')!), ['oonishi', 'qwerty']);
});

test('余白のペイン: 対象を持たず、組を残す理由にならない。閉じても組と他のペインに影響しない', () => {
  const blank: WorkspacePane = { id: 'b', analyzerId: BLANK_PANE_ID, options: undefined, optionsBinding: OWN_OPTIONS, binding: NO_BINDING };
  assert.equal(resolveWorkspacePaneTarget(NO_BINDING, [], 'single'), undefined);
  let library = addWorkspacePane(libraryWith('a'), 'w1', blank, SIZE);
  assert.deepEqual([...gridPaneIds(findWorkspace(library, 'w1')!.grid)].sort(), ['a', 'b']);
  // 従うペインが固定になると組は先頭の1つへ畳まれるが、余白が組を保つことはない
  library = withWorkspacePaneBinding(library, 'w1', 'a', { mode: 'fixed', target: { kind: 'single', target: QWERTY } });
  assert.deepEqual(findWorkspace(library, 'w1')!.groups.map((g) => g.id), [G]);
  library = closeWorkspacePane(library, 'w1', 'b');
  assert.deepEqual(findWorkspace(library, 'w1')!.panes.map((p) => p.id), ['a']);
});

test('詰めない設定（既定）: ペインを閉じても下のペインは動かず、閉じた所は空いたまま', () => {
  // 幅12のペインを2段に並べる（上の段はa・b、下の段はc・d）
  let library = libraryWith();
  for (const id of ['a', 'b', 'c', 'd']) library = addWorkspacePane(library, 'w1', pane(id), { w: 12, h: 10 });
  const grid = findWorkspace(library, 'w1')!.grid;
  const closed = closeWorkspacePane(library, 'w1', 'a');
  const after = findWorkspace(closed, 'w1')!.grid;
  assert.deepEqual(after, grid.filter((item) => item.id !== 'a'));
  // 詰める設定なら、下のペインが上へ詰まる
  const compact = withWorkspaceCompactPanes(library, 'w1', true);
  const compactAfter = findWorkspace(closeWorkspacePane(compact, 'w1', 'a'), 'w1')!.grid;
  assert.notDeepEqual(compactAfter, after);
  assert.ok(compactAfter.some((item) => item.y < grid.find((g) => g.id === item.id)!.y));
});

test('withWorkspaceCompactPanes: 並びを書き換えない。同じ値なら何もせず、詰めないへ戻すと値ごと消える', () => {
  const library = libraryWith('a', 'b');
  assert.equal(withWorkspaceCompactPanes(library, 'w1', false), library);
  assert.equal(withWorkspaceCompactPanes(library, 'none', true), library);
  const gapped = withWorkspaceGrid(library, 'w1', [
    { id: 'a', x: 0, y: 0, w: 6, h: 4 },
    { id: 'b', x: 12, y: 9, w: 6, h: 4 },
  ]);
  const on = withWorkspaceCompactPanes(gapped, 'w1', true);
  const workspace = findWorkspace(on, 'w1')!;
  assert.equal(workspace.compactPanes, true);
  // 切り替えただけでは、空きの残った並びのまま
  assert.equal(workspace.grid, findWorkspace(gapped, 'w1')!.grid);
  assert.equal(withWorkspaceCompactPanes(on, 'w1', true), on);
  const off = withWorkspaceCompactPanes(on, 'w1', false);
  assert.deepEqual(off, gapped);
  assert.equal('compactPanes' in findWorkspace(off, 'w1')!, false);
});

test('withWorkspaceGrid: 詰めない設定は空きを残し、詰める設定は詰める', () => {
  const library = libraryWith('a', 'b');
  const gapped = [{ id: 'a', x: 0, y: 3, w: 6, h: 4 }, { id: 'b', x: 12, y: 9, w: 6, h: 4 }];
  assert.deepEqual(findWorkspace(withWorkspaceGrid(library, 'w1', gapped), 'w1')!.grid, gapped);
  const compact = withWorkspaceCompactPanes(library, 'w1', true);
  assert.deepEqual(findWorkspace(withWorkspaceGrid(compact, 'w1', gapped), 'w1')!.grid.map((i) => i.y), [0, 0]);
});

test('duplicateWorkspace: 詰める設定も写る', () => {
  const library = withWorkspaceCompactPanes(libraryWith('a'), 'w1', true);
  const copied = duplicateWorkspace(library, 'w1', 'w2');
  assert.equal(findWorkspace(copied, 'w2')!.compactPanes, true);
});
