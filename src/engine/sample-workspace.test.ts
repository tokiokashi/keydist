import { EMPTY_PERSONAL_SPEED } from '#interpretation/timing/calibration-codec.ts';
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
  LAYOUT_DETAIL_LAYOUT_ID,
  LAYOUT_DETAIL_WORKSPACE_NAME,
  SAMPLE_BIGRAM_FLOW_LAYOUT_IDS,
  SAMPLE_COMPARISON_LAYOUT_IDS,
  SAMPLE_DEFAULT_SHAPE_ID,
  LAYOUT_DETAIL_GRID_COLS,
  SAMPLE_GRID_COLS,
  SAMPLE_WORKSPACE_NAME,
  createSampleWorkspace,
} from './sample-workspace.ts';
import { initialSingleTargetSelection } from './single-target-selection.ts';
import { createWorkspaceCommand, createSampleWorkspaceCommand, startWorkspaceFromSampleCommand } from './workspace-commands.ts';
import { initialWorkspaceLibrary, resolvePaneOptions } from './workspace.ts';
import { normalizeGrid } from './workspace-grid.ts';

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
    userLayouts: [],
    userRomajiRules: [],
    personalSpeed: EMPTY_PERSONAL_SPEED,
  };
}

test('サンプルの対象と物理配列は、すべて組み込みに存在する（idが変わったらここで落ちる）', () => {
  for (const layoutId of [...SAMPLE_COMPARISON_LAYOUT_IDS, ...SAMPLE_BIGRAM_FLOW_LAYOUT_IDS, LAYOUT_DETAIL_LAYOUT_ID]) {
    assert.ok(LAYOUT_BY_ID.has(layoutId), `組み込みの配列に無い: ${layoutId}`);
  }
  assert.ok(Object.values(PHYSICAL_SHAPES).some((shape) => shape.id === SAMPLE_DEFAULT_SHAPE_ID));
});

test('サンプルの並び: 上に比較表とN感度の横並び（18 + 6列）、中に同じ幅のBigram Flow 4つ、下に同じ幅の指ごとの距離4つ。連動・対象・共有の解析設定・Workspaceの条件', () => {
  const { created } = createSampleWorkspace(initialWorkspaceLibrary(), () => 'w', sequence('p'), 'overview');
  assert.equal(created.name, SAMPLE_WORKSPACE_NAME);
  assert.deepEqual(created.panes.map((pane) => pane.analyzerId), [
    'comparison', 'n-sensitivity',
    'bigram-flow', 'bigram-flow', 'bigram-flow', 'bigram-flow',
    'finger-distance', 'finger-distance', 'finger-distance', 'finger-distance',
  ]);
  assert.deepEqual(created.panes.map((pane) => pane.binding), [
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-2' },
    { mode: 'follow', group: 'link-3' },
    { mode: 'follow', group: 'link-4' },
    { mode: 'follow', group: 'link-1' },
    { mode: 'follow', group: 'link-2' },
    { mode: 'follow', group: 'link-3' },
    { mode: 'follow', group: 'link-4' },
  ]);
  assert.deepEqual(created.groups.map((group) => group.id), ['link-1', 'link-2', 'link-3', 'link-4']);
  assert.deepEqual(
    created.groups[0]!.target.set.targets,
    SAMPLE_COMPARISON_LAYOUT_IDS.map((layoutId) => ({ kind: 'layout', layoutId })),
  );
  assert.deepEqual(
    created.groups.map((group) => group.target.single.target),
    SAMPLE_BIGRAM_FLOW_LAYOUT_IDS.map((layoutId) => ({ kind: 'layout', layoutId })),
  );
  // Bigram Flowの4つは、2打鍵の取り方がWithin-handの共有の設定に従う。指ごとの距離の4つも1つの共有の設定に従う
  assert.deepEqual(created.optionSets.map(({ analyzerId, options }) => ({ analyzerId, options })), [
    { analyzerId: 'bigram-flow', options: { source: 'within-hand' } },
    { analyzerId: 'finger-distance', options: undefined },
  ]);
  for (const pane of created.panes.filter((candidate) => ['bigram-flow', 'finger-distance'].includes(candidate.analyzerId))) {
    const binding = pane.optionsBinding;
    const set = binding.mode === 'shared' ? created.optionSets.find((candidate) => candidate.id === binding.set) : undefined;
    assert.equal(set?.analyzerId, pane.analyzerId);
    assert.equal(resolvePaneOptions(created, pane) === undefined, pane.analyzerId === 'finger-distance');
  }
  assert.deepEqual(created.conditions, { defaultShapeId: 'split-ortholinear' });
  // サンプルも既定どおり詰めない
  assert.equal(created.compactPanes, undefined);

  // 24列。上の段は比較表とN感度が横に並んで24列を使い切り（高さは揃う）、下の段は同じ幅の4つが左から並ぶ
  const [comparison, nSensitivity, ...lower] = created.grid;
  assert.deepEqual([comparison!.x, comparison!.y], [0, 0]);
  assert.deepEqual([nSensitivity!.x, nSensitivity!.y], [comparison!.w, 0]);
  assert.equal(comparison!.w + nSensitivity!.w, SAMPLE_GRID_COLS);
  assert.equal(comparison!.h, nSensitivity!.h);
  // 高さ（升目）: 上の段9・中の段14・下の段9。どれも各ペインが中でスクロールしない最小の高さ（`e2e/sample-workspace.spec.ts` で確かめる）。
  assert.deepEqual([comparison!.h, ...lower.map((item) => item.h)], [9, 14, 14, 14, 14, 10, 10, 10, 10]);
  assert.equal(lower.length, 8);
  const [middle, bottom] = [lower.slice(0, 4), lower.slice(4)];
  assert.ok(middle.every((item) => item.y === comparison!.h && item.w === SAMPLE_GRID_COLS / 4));
  assert.deepEqual(middle.map((item) => item.x), [0, 6, 12, 18]);
  assert.ok(bottom.every((item) => item.y === comparison!.h + 14 && item.w === SAMPLE_GRID_COLS / 4));
  assert.deepEqual(bottom.map((item) => item.x), [0, 6, 12, 18]);
  // 不変条件を満たした形（正規化しても変わらない）
  assert.deepEqual(normalizeGrid(created.grid, created.panes.map((pane) => pane.id), false), created.grid);
});

test('同名があれば連番になり、既存のWorkspaceは変わらない', () => {
  const first = createSampleWorkspace(initialWorkspaceLibrary(), () => 'a', sequence('a'), 'overview');
  const second = createSampleWorkspace(first.library, () => 'b', sequence('b'), 'overview');
  assert.equal(second.created.name, `${SAMPLE_WORKSPACE_NAME} 2`);
  assert.equal(second.library[0], first.library[0]);
});

test('作成のコマンド: 全体の条件と選択を書き換えず、元に戻すで作成が戻る。同じidは何もしない', () => {
  const before = assets();
  const step = applyCommand(before, emptyCommandHistory<KeydistAssets>(), createSampleWorkspaceCommand('w', sequence('p'), 'overview'));
  assert.equal(step.assets.workspaces.length, 1);
  assert.equal(step.assets.setupLibrary, before.setupLibrary);
  assert.equal(step.assets.multiTargetSelection, before.multiTargetSelection);
  assert.equal(step.assets.singleTargetSelection, before.singleTargetSelection);

  const undone = undo(step.assets, step.history);
  assert.deepEqual(undone.assets.workspaces, []);

  assert.equal(createSampleWorkspaceCommand('w', sequence('q'), 'overview')(step.assets).kind, 'no-op');
});

test('個別画面の選択は写さない（空のWorkspaceの作成と違い、定義どおりの対象になる）', () => {
  const withSelection = applyCommand(
    assets(),
    emptyCommandHistory<KeydistAssets>(),
    createWorkspaceCommand('x'),
  ).assets;
  const step = applyCommand(withSelection, emptyCommandHistory<KeydistAssets>(), createSampleWorkspaceCommand('w', sequence('p'), 'overview'));
  const sample = step.assets.workspaces.find((workspace) => workspace.id === 'w')!;
  assert.equal(sample.groups[0]!.target.set.targets.length, SAMPLE_COMPARISON_LAYOUT_IDS.length);
});

test('空のWorkspaceにサンプルの並びを入れる: 同じidのまま、名前・テキストは変えず、元に戻すで空に戻る', () => {
  const empty = applyCommand(assets(), emptyCommandHistory<KeydistAssets>(), createWorkspaceCommand('x', 'マイ'));
  const step = applyCommand(empty.assets, empty.history, startWorkspaceFromSampleCommand('x', sequence('p'), 'overview'));
  assert.equal(step.assets.workspaces.length, 1);
  const filled = step.assets.workspaces[0]!;
  const reference = createSampleWorkspace(initialWorkspaceLibrary(), () => 'r', sequence('p'), 'overview').created;
  assert.equal(filled.id, 'x');
  assert.equal(filled.name, 'マイ');
  assert.deepEqual(filled.text, empty.assets.workspaces[0]!.text);
  assert.deepEqual(filled.groups, reference.groups);
  assert.deepEqual(filled.conditions, reference.conditions);
  assert.deepEqual(filled.panes.map((pane) => [pane.analyzerId, pane.options, pane.binding]), reference.panes.map((pane) => [pane.analyzerId, pane.options, pane.binding]));
  assert.deepEqual(filled.grid.map(({ x, y, w, h }) => [x, y, w, h]), reference.grid.map(({ x, y, w, h }) => [x, y, w, h]));
  assert.equal(step.assets.setupLibrary, empty.assets.setupLibrary);

  const undone = undo(step.assets, step.history);
  assert.deepEqual(undone.assets.workspaces, empty.assets.workspaces);
});

test('ペインがあるWorkspace・存在しないidにサンプルの並びは入れない', () => {
  const filled = applyCommand(assets(), emptyCommandHistory<KeydistAssets>(), createSampleWorkspaceCommand('w', sequence('p'), 'overview'));
  assert.equal(startWorkspaceFromSampleCommand('w', sequence('q'), 'overview')(filled.assets).kind, 'no-op');
  assert.equal(startWorkspaceFromSampleCommand('none', sequence('q'), 'overview')(filled.assets).kind, 'no-op');
});

test('配列の詳細と比較のサンプル: 詳細の段が上、比較の段が下。全部が1つの連動の組に従い、見る量・表示の面が指定どおり', () => {
  const { created } = createSampleWorkspace(initialWorkspaceLibrary(), () => 'w', sequence('p'), 'layout-detail');
  assert.equal(created.name, LAYOUT_DETAIL_WORKSPACE_NAME);
  const detail = ['playback', 'heatmap-layers', 'heatmap', 'finger-distance', 'finger-distance', 'bigram-flow'];
  const comparison = ['comparison', 'n-sensitivity', 'finger-matrix', 'finger-matrix', 'finger-matrix', 'finger-matrix'];
  assert.deepEqual(created.panes.map((pane) => pane.analyzerId), [...detail, ...comparison]);
  // 連動の組は1つで、単体の対象は詳細で見る配列（比較する集合の中の1つ）、集合は比較する配列
  assert.deepEqual(created.groups.map((group) => group.id), ['link-1']);
  assert.ok(created.panes.every((pane) => pane.binding.mode === 'follow' && pane.binding.group === 'link-1'));
  assert.deepEqual(created.groups[0]!.target.single.target, { kind: 'layout', layoutId: LAYOUT_DETAIL_LAYOUT_ID });
  assert.deepEqual(created.groups[0]!.target.set.targets, SAMPLE_COMPARISON_LAYOUT_IDS.map((layoutId) => ({ kind: 'layout', layoutId })));
  assert.ok(SAMPLE_COMPARISON_LAYOUT_IDS.includes(LAYOUT_DETAIL_LAYOUT_ID));
  assert.deepEqual(created.conditions, { defaultShapeId: SAMPLE_DEFAULT_SHAPE_ID });
  assert.deepEqual(created.optionSets, []);
  // 指ごとの距離は移動距離（既定）と標準偏差の2つ、配列×指のマトリックスは押下数・移動距離・指間距離の平均・標準偏差の4つ
  const optionsOf = (analyzerId: string) => created.panes.filter((pane) => pane.analyzerId === analyzerId).map((pane) => pane.options);
  assert.deepEqual(optionsOf('finger-distance'), [undefined, { chartMetric: 'stdDev' }]);
  assert.deepEqual(optionsOf('finger-matrix'), ['presses', 'distance', 'pairMean', 'pairStdDev'].map((surface) => ({ surface })));
  assert.ok(created.panes.every((pane) => pane.optionsBinding.mode === 'own'));

  // 詳細の段のペインは、比較の段のどのペインより上にある
  const bottomOfDetail = Math.max(...created.grid.slice(0, detail.length).map((item) => item.y + item.h));
  assert.ok(created.grid.slice(detail.length).every((item) => item.y >= bottomOfDetail));
  // 24列に収まり、不変条件を満たした形（正規化しても変わらない）
  assert.ok(created.grid.every((item) => item.x + item.w <= LAYOUT_DETAIL_GRID_COLS));
  assert.deepEqual(normalizeGrid(created.grid, created.panes.map((pane) => pane.id), false), created.grid);
  // 並び（x, y, w, h）。高さは各ペインが中でスクロールしない最小の高さ（`e2e/sample-workspace.spec.ts` で確かめる）
  assert.deepEqual(created.grid.map(({ x, y, w, h }) => [x, y, w, h]), [
    [0, 0, 8, 21], [8, 0, 16, 9], [8, 9, 8, 12], [16, 9, 8, 12], [0, 21, 8, 13], [8, 21, 16, 13],
    [0, 34, 18, 9], [18, 34, 6, 9],
    [0, 43, 12, 10], [12, 43, 12, 10], [0, 53, 12, 10], [12, 53, 12, 10],
  ]);
});

test('配列の詳細と比較のサンプルも、空のWorkspaceに入れる・作るのどちらでも同じ並びになる', () => {
  const empty = applyCommand(assets(), emptyCommandHistory<KeydistAssets>(), createWorkspaceCommand('x', 'マイ'));
  const step = applyCommand(empty.assets, empty.history, startWorkspaceFromSampleCommand('x', sequence('p'), 'layout-detail'));
  const reference = createSampleWorkspace(initialWorkspaceLibrary(), () => 'r', sequence('p'), 'layout-detail').created;
  const filled = step.assets.workspaces[0]!;
  assert.equal(filled.name, 'マイ');
  assert.deepEqual(filled.groups, reference.groups);
  assert.deepEqual(filled.panes, reference.panes);
  assert.deepEqual(filled.grid, reference.grid);
  assert.deepEqual(undo(step.assets, step.history).assets.workspaces, empty.assets.workspaces);
});
