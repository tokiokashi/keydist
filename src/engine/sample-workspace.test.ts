import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, emptyCommandHistory, undo } from '#input/commands/index.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import type { KeydistAssets } from './commands.ts';
import { initialMultiTargetSelection } from './multi-target-selection.ts';
import {
  SAMPLE_BIGRAM_FLOW_LAYOUT_IDS,
  SAMPLE_COMPARISON_LAYOUT_IDS,
  SAMPLE_DEFAULT_SHAPE_ID,
  SAMPLE_WORKSPACE_NAME,
  createSampleWorkspace,
} from './sample-workspace.ts';
import { initialSingleTargetSelection } from './single-target-selection.ts';
import { createWorkspaceCommand, createSampleWorkspaceCommand } from './workspace-commands.ts';
import { initialWorkspaceLibrary } from './workspace.ts';
import { GRID_COLS, normalizeGrid } from './workspace-grid.ts';

function sequence(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}${(n += 1)}`;
}

function assets(): KeydistAssets {
  return {
    setupLibrary: { setups: [], overrides: emptyCascadeOverrides() },
    fingerAssignments: [],
    textLibrary: emptyTextLibrary(),
    standaloneTextSelection: initialTextSelection(),
    standaloneAnalyzerOptions: {},
    multiTargetSelection: initialMultiTargetSelection(),
    singleTargetSelection: initialSingleTargetSelection(),
    workspaces: initialWorkspaceLibrary(),
    presetLibrary: { presets: [] },
  };
}

test('サンプルの対象と物理配列は、すべて組み込みに存在する（idが変わったらここで落ちる）', () => {
  for (const layoutId of [...SAMPLE_COMPARISON_LAYOUT_IDS, ...SAMPLE_BIGRAM_FLOW_LAYOUT_IDS]) {
    assert.ok(LAYOUT_BY_ID.has(layoutId), `組み込みの配列に無い: ${layoutId}`);
  }
  assert.ok(Object.values(PHYSICAL_SHAPES).some((shape) => shape.id === SAMPLE_DEFAULT_SHAPE_ID));
});

test('サンプルの並び: 上に比較表（幅いっぱい）、下に同じ幅の4つ。連動・対象・解析設定・Workspaceの条件', () => {
  const { created } = createSampleWorkspace(initialWorkspaceLibrary(), () => 'w', sequence('p'));
  assert.equal(created.name, SAMPLE_WORKSPACE_NAME);
  assert.deepEqual(created.panes.map((pane) => pane.analyzerId), [
    'comparison', 'n-sensitivity', 'bigram-flow', 'bigram-flow', 'bigram-flow',
  ]);
  assert.deepEqual(created.panes.map((pane) => pane.binding), [
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-2' },
    { mode: 'follow', group: 'link-3' },
  ]);
  assert.deepEqual(created.groups.map((group) => group.id), ['link-1', 'link-2', 'link-3']);
  assert.deepEqual(
    created.groups[0]!.target.set.targets,
    SAMPLE_COMPARISON_LAYOUT_IDS.map((layoutId) => ({ kind: 'layout', layoutId })),
  );
  assert.deepEqual(
    created.groups.map((group) => group.target.single.target),
    SAMPLE_BIGRAM_FLOW_LAYOUT_IDS.map((layoutId) => ({ kind: 'layout', layoutId })),
  );
  for (const pane of created.panes.filter((candidate) => candidate.analyzerId === 'bigram-flow')) {
    assert.deepEqual(pane.options, { source: 'within-hand' });
  }
  assert.deepEqual(created.conditions, { defaultShapeId: 'split-ortholinear' });

  // 24列。上の段は幅いっぱい、下の段は4つが同じ幅で横に並ぶ
  const [top, ...lower] = created.grid;
  assert.deepEqual([top!.x, top!.y, top!.w], [0, 0, GRID_COLS]);
  assert.equal(lower.length, 4);
  assert.ok(lower.every((item) => item.y === top!.h && item.w === GRID_COLS / 4));
  assert.deepEqual(lower.map((item) => item.x), [0, 6, 12, 18]);
  // 不変条件を満たした形（正規化しても変わらない）
  assert.deepEqual(normalizeGrid(created.grid, created.panes.map((pane) => pane.id)), created.grid);
});

test('同名があれば連番になり、既存のWorkspaceは変わらない', () => {
  const first = createSampleWorkspace(initialWorkspaceLibrary(), () => 'a', sequence('a'));
  const second = createSampleWorkspace(first.library, () => 'b', sequence('b'));
  assert.equal(second.created.name, `${SAMPLE_WORKSPACE_NAME} 2`);
  assert.equal(second.library[0], first.library[0]);
});

test('作成のコマンド: 全体の条件と選択を書き換えず、元に戻すで作成が戻る。同じidは何もしない', () => {
  const before = assets();
  const step = applyCommand(before, emptyCommandHistory<KeydistAssets>(), createSampleWorkspaceCommand('w', sequence('p')));
  assert.equal(step.assets.workspaces.length, 1);
  assert.equal(step.assets.setupLibrary, before.setupLibrary);
  assert.equal(step.assets.multiTargetSelection, before.multiTargetSelection);
  assert.equal(step.assets.singleTargetSelection, before.singleTargetSelection);

  const undone = undo(step.assets, step.history);
  assert.deepEqual(undone.assets.workspaces, []);

  assert.equal(createSampleWorkspaceCommand('w', sequence('q'))(step.assets).kind, 'no-op');
});

test('個別画面の選択は写さない（空のWorkspaceの作成と違い、定義どおりの対象になる）', () => {
  const withSelection = applyCommand(
    assets(),
    emptyCommandHistory<KeydistAssets>(),
    createWorkspaceCommand('x'),
  ).assets;
  const step = applyCommand(withSelection, emptyCommandHistory<KeydistAssets>(), createSampleWorkspaceCommand('w', sequence('p')));
  const sample = step.assets.workspaces.find((workspace) => workspace.id === 'w')!;
  assert.equal(sample.groups[0]!.target.set.targets.length, SAMPLE_COMPARISON_LAYOUT_IDS.length);
});
