import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, emptyCommandHistory, undo } from '#input/commands/index.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import { EMPTY_PERSONAL_SPEED } from '#interpretation/timing/calibration-codec.ts';
import {
  createUserFaceLayoutCommand,
  createUserLayoutCommand,
  updateUserFaceLayoutCommand,
  updateUserLayoutCommand,
  type KeydistAssets,
} from './commands.ts';
import type { StageUserLayout } from '#input/layouts/user-layouts.ts';
import { initialMultiTargetSelection } from './multi-target-selection.ts';
import { initialSingleTargetSelection } from './single-target-selection.ts';
import { initialWorkspaceLibrary } from './workspace.ts';

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
    workspaceLibrary: initialWorkspaceLibrary(),
    userLayouts: [],
    userRomajiRules: [],
    presetLibrary: { presets: [] },
    personalSpeed: EMPTY_PERSONAL_SPEED,
  } as unknown as KeydistAssets;
}

const CONTENT = {
  name: '私のDvorak',
  rows: ['1234567890[]', "',.pyfgcrl/=", 'aoeuidhtns-', ';qjkxbmwvz'] as const,
  romaji: 'kunrei',
  homeKeys: {},
};

test('自作の配列のコマンド: 作成と編集を書き込み、undoで戻せる', () => {
  const history = emptyCommandHistory<KeydistAssets>();
  const created = applyCommand(
    emptyAssets(),
    history,
    createUserLayoutCommand(() => 'user-1', CONTENT),
  );
  assert.equal(created.outcome.kind, 'applied');
  assert.deepEqual(
    created.assets.userLayouts.map((layout) => [layout.id, layout.name]),
    [['user-1', '私のDvorak']],
  );

  const edited = applyCommand(created.assets, created.history, updateUserLayoutCommand('user-1', { ...CONTENT, name: '改名', homeKeys: { RI: 'h' } }));
  assert.equal(edited.outcome.kind, 'applied');
  assert.deepEqual(edited.assets.userLayouts[0]!.homeKeys, { RI: 'h' });
  assert.deepEqual(
    undo(edited.assets, edited.history).assets.userLayouts.map((layout) => layout.name),
    ['私のDvorak'],
  );
});

test('面で定義するかな配列のコマンド: 作成と編集を書き込み、undoで戻せ、誤りは拒否する', () => {
  const content = {
    name: '面の配列',
    faces: [{ trigger: [], inputRole: 'layer' as const, outputs: { a: 'あ' } }],
    composition: { dakuten: false, handakuten: false },
  };
  const created = applyCommand(
    emptyAssets(),
    emptyCommandHistory<KeydistAssets>(),
    createUserFaceLayoutCommand(() => 'user-face', content),
  );
  assert.equal(created.outcome.kind, 'applied');
  const edited = applyCommand(created.assets, created.history, updateUserFaceLayoutCommand('user-face', { ...content, name: '改名' }));
  assert.equal(edited.outcome.kind, 'applied');
  assert.deepEqual(
    edited.assets.userLayouts.map((layout) => layout.name),
    ['改名'],
  );
  assert.deepEqual(
    undo(edited.assets, edited.history).assets.userLayouts.map((layout) => layout.name),
    ['面の配列'],
  );
  const rejected = applyCommand(created.assets, created.history, updateUserFaceLayoutCommand('user-face', { ...content, faces: [] }));
  assert.equal(rejected.outcome.kind, 'rejected');
});

test('自作の配列のコマンド: 変化が無い編集と存在しないidはno-opで、履歴に積まない', () => {
  const created = applyCommand(
    emptyAssets(),
    emptyCommandHistory<KeydistAssets>(),
    createUserLayoutCommand(() => 'user-1', CONTENT),
  );
  for (const command of [updateUserLayoutCommand('user-1', CONTENT), updateUserLayoutCommand('none', CONTENT)]) {
    const step = applyCommand(created.assets, created.history, command);
    assert.equal(step.outcome.kind, 'no-op');
    assert.equal(step.history, created.history);
  }
});

test('自作の配列のコマンド: 保存できない入力と取り込み形式の配列は拒否し、履歴に積まない', () => {
  const created = applyCommand(
    emptyAssets(),
    emptyCommandHistory<KeydistAssets>(),
    createUserLayoutCommand(() => 'user-1', CONTENT),
  );
  const imported: KeydistAssets = {
    ...created.assets,
    userLayouts: [{ ...(created.assets.userLayouts[0] as StageUserLayout), id: 'user-imp', sequences: [['あ', [['a']]]] }],
  };
  const cases = [
    { assets: created.assets, command: createUserLayoutCommand(() => 'user-2', { ...CONTENT, name: '' }) },
    { assets: created.assets, command: updateUserLayoutCommand('user-1', { ...CONTENT, rows: ['', '', '', ''] }) },
    { assets: imported, command: updateUserLayoutCommand('user-imp', CONTENT) },
  ];
  for (const { assets, command } of cases) {
    const step = applyCommand(assets, created.history, command);
    assert.equal(step.outcome.kind, 'rejected');
    assert.equal(step.assets, assets);
    assert.equal(step.history, created.history);
  }
});
