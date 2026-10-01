import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, emptyCommandHistory, undo } from '#input/commands/index.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import type { KeydistAssets } from './commands.ts';
import { initialMultiTargetSelection } from './multi-target-selection.ts';
import { initialSingleTargetSelection } from './single-target-selection.ts';
import {
  changedColumnKeys,
  distributeByFloor,
  layoutShapeKey,
  requiredBoardHeightRem,
  type BoardPolicy,
} from './workspace-board.ts';
import {
  addWorkspacePaneCommand,
  closeWorkspacePaneCommand,
  createWorkspaceCommand,
  duplicateWorkspacePaneCommand,
  setWorkspaceLayoutCommand,
} from './workspace-commands.ts';
import { findWorkspace, followBinding, INITIAL_LINK_GROUP_ID, MAX_BOARD_HEIGHT_REM, type WorkspacePane } from './workspace.ts';
import { WORKSPACE_LIBRARY_CODEC } from './workspace-codec.ts';
import type { WorkspaceLayoutNode } from './workspace-layout.ts';

/** a=20rem・b=10rem・c=30rem（それ以外は10rem）。余白は外周2rem・段の間1rem。 */
const FLOORS: Readonly<Record<string, number>> = { tall: 30, mid: 20, short: 10 };
const policy: BoardPolicy = { floorRemOfAnalyzer: (id) => FLOORS[id] ?? 10, paddingRem: 2, gapRem: 1 };
const geometry = { paddingRem: 2, gapRem: 1 };

const group = (id: string, weight = 1): WorkspaceLayoutNode => ({ kind: 'group', paneIds: [id], weight });
const column = (...children: WorkspaceLayoutNode[]): WorkspaceLayoutNode => ({ kind: 'split', direction: 'column', children, weight: 1 });
const row = (...children: WorkspaceLayoutNode[]): WorkspaceLayoutNode => ({ kind: 'split', direction: 'row', children, weight: 1 });
const floorByPane = (map: Record<string, number>) => (id: string) => map[id] ?? 10;

test('必要な高さ: 1段なら下限+外周、縦に並べると各段の下限の和（比を保つ）+間の余白、横は最大', () => {
  const floors = floorByPane({ a: 30, b: 20, c: 10 });
  assert.equal(requiredBoardHeightRem(undefined, floors, geometry), 0);
  assert.equal(requiredBoardHeightRem(group('a'), floors, geometry), 32);
  // 重みが下限に比例していれば、和 + 間の余白 + 外周
  assert.equal(requiredBoardHeightRem(column(group('a', 3), group('b', 2), group('c', 1)), floors, geometry), 60 + 2 + 2);
  // 等分だと、一番高い下限の3倍が要る
  assert.equal(requiredBoardHeightRem(column(group('a'), group('b'), group('c')), floors, geometry), 90 + 2 + 2);
  // 横に並んだ子は同じ高さをもらうので、最大
  assert.equal(requiredBoardHeightRem(row(group('a'), group('b')), floors, geometry), 32);
  // タブで重ねた組は、一番高い下限
  assert.equal(requiredBoardHeightRem({ kind: 'group', paneIds: ['b', 'c'], weight: 1 }, floors, geometry), 22);
});

test('形のキー: 重み・前面のタブ・タブの並びは含めず、ペインの出入りと分割は含める', () => {
  assert.equal(layoutShapeKey(column(group('a', 1), group('b', 1))), layoutShapeKey(column(group('a', 5), group('b', 1))));
  assert.equal(
    layoutShapeKey({ kind: 'group', paneIds: ['a', 'b'], weight: 1 }),
    layoutShapeKey({ kind: 'group', paneIds: ['b', 'a'], activePaneId: 'a', weight: 1 }),
  );
  assert.notEqual(layoutShapeKey(column(group('a'), group('b'))), layoutShapeKey(row(group('a'), group('b'))));
  assert.notEqual(layoutShapeKey(column(group('a'), group('b'))), layoutShapeKey(column(group('a'), group('b'), group('c'))));
});

test('配分: 新しい形の縦の分割は下限に比例させ、前からある形の比は動かさない', () => {
  const floors = floorByPane({ a: 30, b: 20, c: 10, d: 10 });
  const before = column(group('a', 1), group('b', 3));
  const added = column(group('a', 1), group('b', 3), group('c', 1));
  const result = distributeByFloor(added, before, floors, 1) as Extract<WorkspaceLayoutNode, { kind: 'split' }>;
  const total = result.children.reduce((sum, child) => sum + child.weight, 0);
  assert.deepEqual(result.children.map((child) => Math.round((child.weight / total) * 1000) / 1000), [0.5, 0.333, 0.167]);

  // 形が変わらない（比だけ変わった）なら動かさない
  const dragged = column(group('a', 1), group('b', 3));
  assert.deepEqual(distributeByFloor(dragged, before, floors, 1), dragged);

  // 前からある縦の分割（右の列）は、別の列にペインが増えても比を保つ
  const right = column(group('c', 7), group('d', 1));
  const beforeRow = row(group('a'), right);
  const addedRow = row(group('a'), right, group('b'));
  assert.deepEqual(distributeByFloor(addedRow, beforeRow, floors, 1), addedRow);
});

/** ペインを持つ初期状態（コマンドを通して作る）。 */
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

const pane = (id: string, analyzerId: string): WorkspacePane => ({ id, analyzerId, options: undefined, binding: followBinding(INITIAL_LINK_GROUP_ID) });

type Command = Parameters<typeof applyCommand<KeydistAssets>>[2];
function run(state: { assets: KeydistAssets; history: ReturnType<typeof emptyCommandHistory<KeydistAssets>> }, ...commands: Command[]) {
  let current = state;
  for (const command of commands) {
    const step = applyCommand(current.assets, current.history, command);
    current = { assets: step.assets, history: step.history };
  }
  return current;
}

test('ペインの追加: 下限を割る形になる時だけ板を伸ばし、追加と同じ1回のUndoで戻る', () => {
  const start = { assets: emptyAssets(), history: emptyCommandHistory<KeydistAssets>() };
  // 外周2 + 段30 = 32rem（最初の1つ）
  const first = run(start, createWorkspaceCommand('w'), addWorkspacePaneCommand('w', pane('a', 'tall'), policy));
  assert.equal(findWorkspace(first.assets.workspaces, 'w')!.boardHeightRem, 32);
  // 横に並べても、同じ高さで足りるので動かない
  const second = run(first, addWorkspacePaneCommand('w', pane('b', 'short'), policy));
  assert.equal(findWorkspace(second.assets.workspaces, 'w')!.boardHeightRem, 32);
  // 方針を渡さなければ板には触れない
  const plain = run(start, createWorkspaceCommand('w'), addWorkspacePaneCommand('w', pane('a', 'tall'), undefined));
  assert.equal(findWorkspace(plain.assets.workspaces, 'w')!.boardHeightRem, undefined);

  // Undoは、ペインと板の高さをいっしょに戻す
  const undone = undo(first.assets, first.history);
  const workspace = findWorkspace(undone.assets.workspaces, 'w')!;
  assert.equal(workspace.panes.length, 0);
  assert.equal(workspace.boardHeightRem, undefined);
});

test('並びの変更: サッシのドラッグ（形が同じ）は板も他のペインの比も動かさず、形が変わる時だけ伸ばして配る', () => {
  const start = { assets: emptyAssets(), history: emptyCommandHistory<KeydistAssets>() };
  let state = run(
    start,
    createWorkspaceCommand('w'),
    addWorkspacePaneCommand('w', pane('a', 'tall'), undefined),
    addWorkspacePaneCommand('w', pane('b', 'mid'), undefined),
    addWorkspacePaneCommand('w', pane('c', 'short'), undefined),
  );
  assert.equal(findWorkspace(state.assets.workspaces, 'w')!.boardHeightRem, undefined);

  // 形が変わる（縦3段を作る）と、下限に比例した比になり、必要な高さへ板が伸びる
  state = run(state, setWorkspaceLayoutCommand('w', column(group('a', 1), group('b', 1), group('c', 1)), policy));
  const stacked = findWorkspace(state.assets.workspaces, 'w')!;
  // 重みは4桁に丸めて保存するので、必要な高さは丸めの分だけわずかに大きくなりうる
  assert.ok(Math.abs(stacked.boardHeightRem! - (30 + 20 + 10 + 2 * 1 + 2)) <= 0.02);
  const weights = (stacked.layout as Extract<WorkspaceLayoutNode, { kind: 'split' }>).children.map((child) => child.weight);
  assert.deepEqual(weights, [0.5, 0.3333, 0.1667]);

  // サッシのドラッグ: 形は同じで比だけ変わる。板の高さも他の比もそのまま書かれる
  const dragged = column(group('a', 0.2), group('b', 0.5), group('c', 0.3));
  state = run(state, setWorkspaceLayoutCommand('w', dragged, policy));
  const after = findWorkspace(state.assets.workspaces, 'w')!;
  assert.equal(after.boardHeightRem, stacked.boardHeightRem);
  assert.deepEqual((after.layout as Extract<WorkspaceLayoutNode, { kind: 'split' }>).children.map((child) => child.weight), [0.2, 0.5, 0.3]);
});

test('複製・閉じる: 複製は形が変わるので配り直して伸ばし、閉じても板は縮めない', () => {
  const start = { assets: emptyAssets(), history: emptyCommandHistory<KeydistAssets>() };
  let state = run(
    start,
    createWorkspaceCommand('w'),
    addWorkspacePaneCommand('w', pane('a', 'tall'), undefined),
    addWorkspacePaneCommand('w', pane('b', 'short'), undefined),
    setWorkspaceLayoutCommand('w', column(group('a', 1), group('b', 1)), undefined),
  );
  state = run(state, duplicateWorkspacePaneCommand('w', 'b', 'b2', policy));
  const duplicated = findWorkspace(state.assets.workspaces, 'w')!;
  // 縦: a(30) と、横に2つ並んだ b・b2(10)。比は 30:10 → 必要な高さは 30 + 10 + 間の余白1 + 外周2
  assert.equal(duplicated.boardHeightRem, 43);

  state = run(state, closeWorkspacePaneCommand('w', 'b2'));
  assert.equal(findWorkspace(state.assets.workspaces, 'w')!.boardHeightRem, 43);
});

test('板の高さの保存: 往復できる。壊れた値は診断つきで1画面へ戻し、上限で止める', () => {
  const start = { assets: emptyAssets(), history: emptyCommandHistory<KeydistAssets>() };
  const state = run(start, createWorkspaceCommand('w'), addWorkspacePaneCommand('w', pane('a', 'tall'), policy));
  const encoded: unknown = JSON.parse(JSON.stringify(WORKSPACE_LIBRARY_CODEC.encode(state.assets.workspaces)));
  const decoded = WORKSPACE_LIBRARY_CODEC.decode(encoded);
  assert.ok(decoded.ok);
  assert.equal(decoded.value[0]!.boardHeightRem, 32);

  const decodeWith = (boardHeightRem: unknown) => {
    const copy = JSON.parse(JSON.stringify(encoded)) as { workspaces: Record<string, unknown>[] };
    copy.workspaces[0]!.boardHeightRem = boardHeightRem;
    const result = WORKSPACE_LIBRARY_CODEC.decode(copy);
    assert.ok(result.ok);
    return result;
  };
  for (const broken of ['100', -5, 0, null, Number.NaN]) {
    const result = decodeWith(broken);
    assert.equal(result.value[0]!.boardHeightRem, undefined, `値: ${String(broken)}`);
    assert.ok(result.diagnostics.some((d) => d.path.endsWith('boardHeightRem')));
  }
  assert.equal(decodeWith(1e9).value[0]!.boardHeightRem, MAX_BOARD_HEIGHT_REM);
});

type Split = Extract<WorkspaceLayoutNode, { kind: 'split' }>;

/** 縦の分割の重みを置き換える（サッシのドラッグ: 形は変えず、比だけ変える）。 */
function withWeights(node: WorkspaceLayoutNode, weights: readonly number[]): WorkspaceLayoutNode {
  assert.equal(node.kind, 'split');
  return { ...node, children: (node as Split).children.map((child, i) => ({ ...child, weight: weights[i]! })) };
}

/** 5つのペインを置き、`layout`を形の変更として書いた状態（板は必要な高さまで伸びている）。 */
function stacked(layout: WorkspaceLayoutNode) {
  const start = { assets: emptyAssets(), history: emptyCommandHistory<KeydistAssets>() };
  return run(
    start,
    createWorkspaceCommand('w'),
    addWorkspacePaneCommand('w', pane('a', 'tall'), undefined),
    addWorkspacePaneCommand('w', pane('b', 'mid'), undefined),
    addWorkspacePaneCommand('w', pane('c', 'short'), undefined),
    addWorkspacePaneCommand('w', pane('d', 'mid'), undefined),
    addWorkspacePaneCommand('w', pane('e', 'short'), undefined),
    setWorkspaceLayoutCommand('w', layout, policy),
  );
}
const boardOf = (state: ReturnType<typeof stacked>) => findWorkspace(state.assets.workspaces, 'w')!.boardHeightRem!;

test('人が狭めたペインは、下限を割っていても、次に形が変わる時の板を伸ばす理由にならない（追加・閉じる）', () => {
  // 縦3段（a・b・c）+ 別の列（d・e）。まず形として書き、板が伸びた状態にする
  const base = row(column(group('a'), group('b'), group('c')), column(group('d'), group('e'))) as Split;
  let state = stacked(base);
  const stored = boardOf(state);
  // サッシで c と e を最小近くまで狭める（形は同じ。板は動かない）
  const squeezed = row(withWeights(base.children[0]!, [0.5, 0.49, 0.01]), withWeights(base.children[1]!, [0.99, 0.01]));
  state = run(state, setWorkspaceLayoutCommand('w', squeezed, policy));
  assert.equal(boardOf(state), stored);

  // 別の列のペインを閉じても、狭めた列は数えない
  assert.equal(boardOf(run(state, closeWorkspacePaneCommand('w', 'd'))), stored);
  // 狭めた列の中のペインを閉じても、残りの比は人が決めたまま（配り直さず、板も伸ばさない）
  const closedInside = run(state, closeWorkspacePaneCommand('w', 'a'));
  assert.equal(boardOf(closedInside), stored);
  const left = (findWorkspace(closedInside.assets.workspaces, 'w')!.layout as Split).children[0] as Split;
  assert.equal(layoutShapeKey(left), 'c[g(b) g(c)]');
  assert.ok(left.children[1]!.weight < 0.1, '狭めた段の比は配り直されない');

  // 新しいペインを足しても、足したペインの分だけ（狭めた列は数えない）
  assert.equal(boardOf(run(state, addWorkspacePaneCommand('w', pane('f', 'tall'), policy))), stored);
});

test('人が狭めた列のペインを別の列へ移しても、板は移った先の必要高さだけで決まる', () => {
  const base = row(column(group('a'), group('b')), column(group('c'), group('d'), group('e'))) as Split;
  let state = stacked(base);
  // 右の列は d を最小近くまで狭める（形は同じ）
  state = run(state, setWorkspaceLayoutCommand('w', row(base.children[0]!, withWeights(base.children[1]!, [0.6, 0.01, 0.39])), policy));
  const before = boardOf(state);
  // e を左の列の a の下へ移す。左は a・e・b の3段になり、右は c・d が残る
  const moved = row(column(group('a'), group('e'), group('b')), column(group('c', 0.6), group('d', 0.01)));
  const workspace = findWorkspace(run(state, setWorkspaceLayoutCommand('w', moved, policy)).assets.workspaces, 'w')!;
  // 左の3段の必要高さ（a30 + e10 + b20 + 間2 + 外周2 = 64）まで。狭めた d の比（0.01）で数千に伸びない
  assert.ok(workspace.boardHeightRem! >= before);
  assert.ok(workspace.boardHeightRem! <= 70, `板: ${workspace.boardHeightRem}`);
  // 抜けた側（右の列）は比を配り直さない
  const right = (workspace.layout as Split).children[1] as Split;
  assert.equal(layoutShapeKey(right), 'c[g(c) g(d)]');
  assert.ok(right.children[0]!.weight === 0.6 && right.children[1]!.weight === 0.01);
});

/** 使うペインだけを置き（a=tall30・b=mid20・c=short10・d=mid20・e=short10）、`from`を最初の形、`to`へ並びを変える。 */
function moved(ids: readonly string[], from: WorkspaceLayoutNode, to: WorkspaceLayoutNode) {
  const kind: Record<string, string> = { a: 'tall', b: 'mid', c: 'short', d: 'mid', e: 'short' };
  const start = { assets: emptyAssets(), history: emptyCommandHistory<KeydistAssets>() };
  const placed = run(
    start,
    createWorkspaceCommand('w'),
    ...ids.map((id) => addWorkspacePaneCommand('w', pane(id, kind[id]!), undefined)),
    setWorkspaceLayoutCommand('w', from, policy),
  );
  const workspace = (state: typeof placed) => findWorkspace(state.assets.workspaces, 'w')!;
  const next = run(placed, setWorkspaceLayoutCommand('w', to, policy));
  return { before: workspace(placed), after: workspace(next) };
}
const near = (actual: number | undefined, expected: number) => assert.ok(actual !== undefined && Math.abs(actual - expected) <= 0.05, `板: ${actual}（期待 ${expected}）`);

test('根が縦の配置での移動も、形が変わった扱いで板を伸ばし、動かしたペインを含む列を配り直す', () => {
  // 外周2・間1。d を b の下へ: 内側の列 (b 20 + d 20 + 間1 = 41)、根の列 (41 と c 10 を比に: 41+10+1) + 外周2 = 54
  const { after } = moved(['a', 'b', 'c', 'd'], column(row(group('a'), group('b')), row(group('c'), group('d'))), column(row(group('a'), column(group('b'), group('d'))), group('c')));
  near(after.boardHeightRem, 54);
  const root = after.layout as Split;
  const total = root.children[0]!.weight + root.children[1]!.weight;
  assert.ok(Math.abs(root.children[0]!.weight / total - 41 / 51) < 0.01, '根の列も下限に比例した比へ配り直す');

  // b を c の下へ（a の段は a だけになり、b は一番下の段へ）: a30 + c10 + b20 + 間2 + 外周2 = 64
  const second = moved(['a', 'b', 'c'], column(row(group('a'), group('b')), group('c')), column(group('a'), group('c'), group('b')));
  near(second.after.boardHeightRem, 64);

  // タブの組から b を出して同じ列の段にする: a30 + b20 + c10 + 間2 + 外周2 = 64
  const tabs = moved(
    ['a', 'b', 'c'],
    column({ kind: 'group', paneIds: ['a', 'b'], weight: 1 }, group('c')),
    column(group('a'), group('b'), group('c')),
  );
  near(tabs.after.boardHeightRem, 64);
});

test('入れ子の列へ移すと、内側の列も外側の列も下限に比例して配り直し、板を伸ばす', () => {
  // e を内側の列 (c, d) の下へ。内側: 10+20+10 + 間2 = 42、横並びの段は max(b 20, 42)、根: a30 と 42 + 間1 + 外周2 = 75
  const { after } = moved(
    ['a', 'b', 'c', 'd', 'e'],
    column(group('a'), row(group('b'), column(group('c'), group('d'))), group('e')),
    column(group('a'), row(group('b'), column(group('c'), group('d'), group('e')))),
  );
  near(after.boardHeightRem, 75);
  const inner = ((after.layout as Split).children[1] as Split).children[1] as Split;
  assert.equal(layoutShapeKey(inner), 'c[g(c) g(d) g(e)]');
  const total = inner.children.reduce((sum, child) => sum + child.weight, 0);
  assert.deepEqual(inner.children.map((child) => Math.round((child.weight / total) * 100) / 100), [0.25, 0.5, 0.25]);
});

test('増えた列の中に人が比を決めた列があっても、その比で割って板が暴走しない（下限の和 + 間で数える）', () => {
  // f=a(30)・n=b(20)・c=c(10)・c2=e(10)。右の列 (n .97, c .01, c2 .02) の c2 を下端へ出す
  const { before, after } = moved(
    ['a', 'b', 'c', 'e'],
    row(group('a'), column(group('b', 0.97), group('c', 0.01), group('e', 0.02))),
    column(row(group('a'), column(group('b', 0.99), group('c', 0.01))), group('e')),
  );
  assert.ok(before.boardHeightRem! < 100);
  // 内側の列 (n, c) は人の比のまま下限の和 (20+10+1=31)。段の高さは max(a30, 31)、根: 31 と e10 + 間1 + 外周2 = 44
  near(after.boardHeightRem, 44);
  const inner = ((after.layout as Split).children[0] as Split).children[1] as Split;
  assert.deepEqual(inner.children.map((child) => child.weight), [0.99, 0.01]);
});

test('閉じて横の分割が畳まれ、人が狭めた比の列が親の列に合わさっても、板は動かない（暴走しない）', () => {
  // column(row(a, column(b .95, c .05)), d) で a を閉じる。残りは根が column(b .95, c .05, d) に畳まれる
  const start = { assets: emptyAssets(), history: emptyCommandHistory<KeydistAssets>() };
  const placed = run(
    start,
    createWorkspaceCommand('w'),
    addWorkspacePaneCommand('w', pane('a', 'tall'), undefined),
    addWorkspacePaneCommand('w', pane('b', 'mid'), undefined),
    addWorkspacePaneCommand('w', pane('c', 'short'), undefined),
    addWorkspacePaneCommand('w', pane('d', 'mid'), undefined),
    setWorkspaceLayoutCommand('w', column(row(group('a'), column(group('b'), group('c'))), group('d')), policy),
    // サッシで内側の列を 0.95 : 0.05 に狭める（形は同じ）
    setWorkspaceLayoutCommand('w', column(row(group('a'), column(group('b', 0.95), group('c', 0.05))), group('d')), policy),
  );
  const before = boardOf(placed);
  const closed = run(placed, closeWorkspacePaneCommand('w', 'a'));
  const workspace = findWorkspace(closed.assets.workspaces, 'w')!;
  assert.equal(layoutShapeKey(workspace.layout!), 'c[g(b) g(c) g(d)]');
  assert.equal(workspace.boardHeightRem, before);
  // 畳まれた後の比は、人が決めた比のまま
  const [b, c] = (workspace.layout as Split).children;
  assert.ok(c!.weight / b!.weight < 0.1);
});

test('ペインを取り除いただけの列と、何も変えていない列は、変わっていない扱い（根が縦でも）', () => {
  const layout = column(row(group('a'), group('b')), group('c'), group('d'));
  const keys = (to: WorkspaceLayoutNode) => [...changedColumnKeys(to, layout)];
  assert.deepEqual(keys(layout), []);
  assert.deepEqual(keys(column(row(group('a'), group('b')), group('d'))), []);
  // 段の入れ替え・段の中の組み替えは、変わった扱い
  assert.equal(keys(column(group('c'), row(group('a'), group('b')), group('d'))).length, 1);
  assert.equal(keys(column(group('a'), group('b'), group('c'), group('d'))).length, 1);
});
