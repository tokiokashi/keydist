import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCommand, emptyCommandHistory, undo, type CommandHistory } from '#input/commands/index.ts';
import { LAYOUTS_JA } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { readOverride, type CascadeContext, type CascadeLevel } from '#input/settings/index.ts';
import type { KeydistAssets } from './commands.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import { emptyPresetLibrary } from '#input/presets/index.ts';
import { initialMultiTargetSelection } from './multi-target-selection.ts';
import { initialSingleTargetSelection } from './single-target-selection.ts';
import { initialWorkspaceLibrary } from './workspace.ts';
import {
  applyPresetCommand,
  deletePresetCommand,
  importPresetsCommand,
  planPresetApplication,
  renamePresetCommand,
  savePresetCommand,
} from './preset-commands.ts';
import { resolveSettings, type SettingsCascadeOverrides } from './settings-items.ts';
import { setCascadeOverrideCommand } from './commands.ts';

function initialAssets(): KeydistAssets {
  return {
    setupLibrary: { setups: [], overrides: emptyCascadeOverrides() },
    fingerAssignments: [],
    textLibrary: emptyTextLibrary(),
    standaloneTextSelection: initialTextSelection(),
    standaloneAnalyzerOptions: {},
    multiTargetSelection: initialMultiTargetSelection(),
    singleTargetSelection: initialSingleTargetSelection(),
    workspaces: initialWorkspaceLibrary(),
    presetLibrary: emptyPresetLibrary(),
  };
}

const GLOBAL: CascadeLevel = { kind: 'global' };
const LAYOUT: CascadeLevel = { kind: 'layout', layoutId: 'qwerty' };

let nextId = 0;
const generateId = () => `preset-${++nextId}`;

function withOverrides(overrides: SettingsCascadeOverrides): KeydistAssets {
  const assets = initialAssets();
  return { ...assets, setupLibrary: { ...assets.setupLibrary, overrides } };
}

function run(assets: KeydistAssets, command: ReturnType<typeof savePresetCommand>, history?: CommandHistory<KeydistAssets>) {
  return applyCommand(assets, history ?? emptyCommandHistory<KeydistAssets>(), command);
}

test('savePresetCommand: 全体の今の上書きを複製して保存する。他の資産は触らない', () => {
  const start = withOverrides({ global: { windowSize: 5 }, layout: { qwerty: { windowSize: 9 } } });
  const step = run(start, savePresetCommand('  厳しめ ', GLOBAL, generateId));
  assert.equal(step.outcome.kind, 'applied');
  assert.deepEqual(step.assets.presetLibrary.presets.map(({ name, values }) => ({ name, values })), [
    { name: '厳しめ', values: { windowSize: 5 } },
  ]);
  assert.equal(step.assets.setupLibrary, start.setupLibrary);
});

test('savePresetCommand: 名前が空なら拒否する。レベルを変えればそのレベルの上書きを保存する', () => {
  const start = withOverrides({ global: { windowSize: 5 }, layout: { qwerty: { windowSize: 9 } } });
  assert.equal(run(start, savePresetCommand('  ', GLOBAL, generateId)).outcome.kind, 'rejected');
  const step = run(start, savePresetCommand('配列用', LAYOUT, generateId));
  assert.deepEqual(step.assets.presetLibrary.presets[0].values, { windowSize: 9 });
});

test('savePresetCommand: 上書きが無いレベルは空の値で保存できる', () => {
  const step = run(initialAssets(), savePresetCommand('すべて既定', GLOBAL, generateId));
  assert.deepEqual(step.assets.presetLibrary.presets[0].values, {});
});

test('applyPresetCommand: 置き換える（無い項目は既定へ戻り、既定と同じ値は残らない）。undoで戻る', () => {
  const saved = run(
    withOverrides({ global: { windowSize: 6 } }),
    savePresetCommand('P', GLOBAL, generateId),
  );
  const id = saved.assets.presetLibrary.presets[0].id;
  // 今は別の上書き（sfbHomeCost）だけを持つ状態にして流し込む
  const other = withOverrides({ global: { sfbHomeCost: false } });
  const start: KeydistAssets = { ...other, presetLibrary: saved.assets.presetLibrary };
  const step = run(start, applyPresetCommand(id, GLOBAL));
  assert.equal(step.outcome.kind, 'applied');
  assert.deepEqual(step.assets.setupLibrary.overrides, { global: { windowSize: 6 } });
  const back = undo(step.assets, step.history);
  assert.deepEqual(back.assets.setupLibrary.overrides, { global: { sfbHomeCost: false } });
});

test('applyPresetCommand: 既定と同じ値のプリセットは上書きを消す', () => {
  const start: KeydistAssets = {
    ...withOverrides({ global: { windowSize: 6 } }),
    presetLibrary: { presets: [{ id: 'p', name: 'P', values: { windowSize: 3 } }] },
  };
  const step = run(start, applyPresetCommand('p', GLOBAL));
  assert.deepEqual(step.assets.setupLibrary.overrides, {});
});

test('applyPresetCommand: 対象レベルの許可に無い項目は入れず、planで返る', () => {
  const start: KeydistAssets = {
    ...initialAssets(),
    presetLibrary: {
      presets: [{ id: 'p', name: 'P', values: { windowSize: 4, chainInterpretation: { breakOnTriggerOnly: true } as never } }],
    },
  };
  const step = run(start, applyPresetCommand('p', LAYOUT));
  assert.deepEqual(step.assets.setupLibrary.overrides, { layout: { qwerty: { windowSize: 4 } } });
  const plan = planPresetApplication(start, 'p', LAYOUT);
  assert.equal(plan.kind, 'ready');
  if (plan.kind === 'ready') assert.deepEqual(plan.skipped, ['chainInterpretation']);
});

test('applyPresetCommand: 存在しないid・変化が無い流し込みは何もしない', () => {
  const start: KeydistAssets = {
    ...withOverrides({ global: { windowSize: 4 } }),
    presetLibrary: { presets: [{ id: 'p', name: 'P', values: { windowSize: 4 } }] },
  };
  assert.equal(run(start, applyPresetCommand('none', GLOBAL)).outcome.kind, 'no-op');
  assert.equal(run(start, applyPresetCommand('p', GLOBAL)).outcome.kind, 'no-op');
});

test('流し込んだ条件は、同じ値を手で設定した時と実効値が一致する', () => {
  const layout = LAYOUTS_JA.find((entry) => entry.id === 'qwerty');
  assert.ok(layout);
  const context: CascadeContext = {
    shapeId: 'row-staggered',
    shape: PHYSICAL_SHAPES['row-staggered'],
    inputMethod: 'romaji',
    layoutId: layout.id,
    layout,
    targetKind: 'layout',
  };
  const values = { windowSize: 5, sfbHomeCost: false, romajiRuleId: 'azik' } as const;

  // 手で設定した状態
  let manual = initialAssets();
  manual = run(manual, setCascadeOverrideCommand(GLOBAL, 'windowSize', values.windowSize)).assets;
  manual = run(manual, setCascadeOverrideCommand(GLOBAL, 'sfbHomeCost', values.sfbHomeCost)).assets;
  manual = run(manual, setCascadeOverrideCommand(GLOBAL, 'romajiRuleId', values.romajiRuleId)).assets;
  const saved = run(manual, savePresetCommand('手で設定', GLOBAL, generateId));

  // 別の値が入っている状態へ、保存したプリセットを流し込む
  const target: KeydistAssets = {
    ...withOverrides({ global: { windowSize: 8, preferOppositeThumb: true } }),
    presetLibrary: saved.assets.presetLibrary,
  };
  const applied = run(target, applyPresetCommand(saved.assets.presetLibrary.presets[0].id, GLOBAL)).assets;

  assert.deepEqual(
    resolveSettings(applied.setupLibrary.overrides, context),
    resolveSettings(manual.setupLibrary.overrides, context),
  );
  assert.equal(readOverride(applied.setupLibrary.overrides, GLOBAL, 'preferOppositeThumb'), undefined);
});

test('renamePresetCommand: 名前を変える。空は拒否、同じ名前は何もしない', () => {
  const start: KeydistAssets = { ...initialAssets(), presetLibrary: { presets: [{ id: 'p', name: 'A', values: {} }] } };
  assert.equal(run(start, renamePresetCommand('p', 'B')).assets.presetLibrary.presets[0].name, 'B');
  assert.equal(run(start, renamePresetCommand('p', ' ')).outcome.kind, 'rejected');
  assert.equal(run(start, renamePresetCommand('p', 'A')).outcome.kind, 'no-op');
});

test('deletePresetCommand: 消す。存在しないidは何もしない。undoで戻る', () => {
  const start: KeydistAssets = { ...initialAssets(), presetLibrary: { presets: [{ id: 'p', name: 'A', values: {} }] } };
  const step = run(start, deletePresetCommand('p'));
  assert.deepEqual(step.assets.presetLibrary.presets, []);
  assert.equal(undo(step.assets, step.history).assets.presetLibrary.presets.length, 1);
  assert.equal(run(start, deletePresetCommand('none')).outcome.kind, 'no-op');
});

test('importPresetsCommand: 新しいidで追加し、同名は番号を付ける。setupLibraryは触らない', () => {
  const start: KeydistAssets = {
    ...withOverrides({ global: { windowSize: 4 } }),
    presetLibrary: { presets: [{ id: 'p', name: 'A', values: { windowSize: 7 } }] },
  };
  const step = run(start, importPresetsCommand([{ name: 'A', values: { windowSize: 5 } }, { name: 'A', values: {} }], generateId));
  assert.deepEqual(step.assets.presetLibrary.presets.map((preset) => preset.name), ['A', 'A 2', 'A 3']);
  assert.deepEqual(step.assets.presetLibrary.presets[0], start.presetLibrary.presets[0]);
  assert.equal(step.assets.setupLibrary, start.setupLibrary);
  assert.equal(run(start, importPresetsCommand([], generateId)).outcome.kind, 'no-op');
});
