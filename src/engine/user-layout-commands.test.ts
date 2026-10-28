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
import type { FaceLayoutContent } from '#input/layouts/face-layout-file.ts';
import type { AlphaFaceUserLayout, StageUserLayout } from '#input/layouts/user-layouts.ts';
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
    kind: 'kana' as const,
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
  assert.equal(created.outcome.kind === 'applied' ? created.outcome.label : undefined, '自作のかな配列を作成する');
  assert.equal(edited.outcome.kind === 'applied' ? edited.outcome.label : undefined, '自作のかな配列を編集する');
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
    userLayouts: [{ ...(created.assets.userLayouts[0] as StageUserLayout), id: 'user-imp', sequences: [['あ', [['a']]] as [string, string[][]]] }],
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

/** 英字の種類の面の形。 */
const ALPHA_FACE: AlphaFaceUserLayout = {
  id: 'user-alpha-face',
  name: '英字の面',
  kind: 'alpha',
  faces: [{ trigger: [], inputRole: 'layer', outputs: { a: 'a', s: 's' } }],
  romaji: 'kunrei',
};

test('面の形の作成・更新のコマンドは、種類とローマ字規則を持つ中身を受ける', () => {
  const alphaContent = (romaji: string): FaceLayoutContent => ({ kind: 'alpha', name: ALPHA_FACE.name, faces: ALPHA_FACE.faces, romaji });
  const content = alphaContent('kunrei');
  const created = applyCommand(
    emptyAssets(),
    emptyCommandHistory(),
    createUserFaceLayoutCommand(() => ALPHA_FACE.id, content),
  );
  assert.equal(created.outcome.kind, 'applied');
  assert.deepEqual(created.assets.userLayouts, [ALPHA_FACE]);
  assert.deepEqual(created.outcome.kind === 'applied' ? created.outcome.label : undefined, '自作のローマ字配列を作成する');

  const renamed = applyCommand(created.assets, created.history, updateUserFaceLayoutCommand(ALPHA_FACE.id, alphaContent('azik')));
  assert.equal(renamed.outcome.kind, 'applied');
  assert.equal(renamed.assets.userLayouts[0]!.romaji, 'azik');
  assert.equal(renamed.outcome.kind === 'applied' ? renamed.outcome.label : undefined, '自作のローマ字配列を編集する');

  const same = applyCommand(created.assets, created.history, updateUserFaceLayoutCommand(ALPHA_FACE.id, content));
  assert.equal(same.outcome.kind, 'no-op');

  // 種類を変える更新もできる。英字からかなに替えると、ローマ字規則は持たず合成の指定を持つ
  const toKana = applyCommand(
    created.assets,
    created.history,
    updateUserFaceLayoutCommand(ALPHA_FACE.id, {
      kind: 'kana',
      name: content.name,
      faces: content.faces,
      composition: { dakuten: false, handakuten: false },
    }),
  );
  assert.equal(toKana.outcome.kind, 'applied');
  assert.equal(toKana.assets.userLayouts[0]!.kind, 'kana');
  assert.equal(toKana.assets.userLayouts[0]!.romaji, undefined);
});
