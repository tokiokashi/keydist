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
  const plain = run(start, createWorkspaceCommand('w'), addWorkspacePaneCommand('w', pane('a', 'tall')));
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
    addWorkspacePaneCommand('w', pane('a', 'tall')),
    addWorkspacePaneCommand('w', pane('b', 'mid')),
    addWorkspacePaneCommand('w', pane('c', 'short')),
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
    addWorkspacePaneCommand('w', pane('a', 'tall')),
    addWorkspacePaneCommand('w', pane('b', 'short')),
    setWorkspaceLayoutCommand('w', column(group('a', 1), group('b', 1))),
  );
  state = run(state, duplicateWorkspacePaneCommand('w', 'b', 'b2', policy));
  const duplicated = findWorkspace(state.assets.workspaces, 'w')!;
  // 縦: a(30) と、横に2つ並んだ b・b2(10)。比は 30:10 → 必要な高さは 30 + 10 + 間の余白1 + 外周2
  assert.equal(duplicated.boardHeightRem, 43);

  state = run(state, closeWorkspacePaneCommand('w', 'b2', policy));
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
