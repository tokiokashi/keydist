import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, emptyCommandHistory } from '#input/commands/index.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { assignColumnFinger, assignHomeKey, assignKeyFinger, resetToDefaultAssignment } from '#input/shapes/finger-assignment-edit.ts';
import {
  DEFAULT_FINGER_ASSIGNMENT,
  JIS_FINGER_ASSIGNMENT,
  makeFingerAssignment,
  PHYSICAL_SHAPES,
  type FingerAssignment,
} from '#input/shapes/geometry.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import { createFingerAssignmentCommand, setFingerAssignmentContentCommand, type KeydistAssets } from './commands.ts';
import { initialMultiTargetSelection } from './multi-target-selection.ts';
import { generateEngineTrace, interpretEngineTrace } from './pipeline.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride } from './settings-items.ts';
import { initialSingleTargetSelection } from './single-target-selection.ts';
import { initialWorkspaceLibrary } from './workspace.ts';
import { EMPTY_PERSONAL_SPEED } from '#interpretation/timing/calibration-codec.ts';

const SHAPES = new Map(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape] as const));
const TEXT = 'the quick brown fox, jumps over the lazy dog.';

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
    personalSpeed: EMPTY_PERSONAL_SPEED,
  } as unknown as KeydistAssets;
}

/** 指の割り当て`assignment`をカスケードの全体で選んで、QWERTYでTEXTを打った時の指標を測る。 */
function measure(assignment: FingerAssignment, shapeId: string) {
  const global = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'fingerAssignmentId', assignment.id);
  assert.ok(global.ok);
  const shaped = setSettingsOverride(global.overrides, { kind: 'global' }, 'defaultShapeId', shapeId);
  assert.ok(shaped.ok);
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId: 'qwerty' },
    setups: new Map(),
    catalog: { layouts: LAYOUT_BY_ID, shapes: SHAPES },
    userLayouts: new Map(),
    customFingerAssignments: new Map([[assignment.id, assignment]]),
    overrides: shaped.overrides,
    text: TEXT,
    language: 'en',
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  if (!result.ok) throw new Error('unreachable');
  assert.equal(result.input.geometry.assignment.id, assignment.id);
  return interpretEngineTrace(generateEngineTrace(result.input), result.input).metrics;
}

/** 画面の操作と同じく、作成→中身の書き換えをコマンドで通し、保存された割り当てを返す。 */
function createAndEdit(base: FingerAssignment, edit: (assignment: FingerAssignment) => FingerAssignment): FingerAssignment {
  const created = applyCommand(
    emptyAssets(),
    emptyCommandHistory<KeydistAssets>(),
    createFingerAssignmentCommand(() => 'finger-edited', base, '編集した割り当て'),
  );
  const stored = created.assets.fingerAssignments[0]!;
  const edited = edit(stored);
  const step = applyCommand(created.assets, created.history, setFingerAssignmentContentCommand(stored.id, edited));
  return step.assets.fingerAssignments[0]!;
}

test('画面の編集で保存した割り当ては、同じ中身を直接与えた時と同じ数値になる', () => {
  const shape = PHYSICAL_SHAPES['row-staggered'];
  const stored = createAndEdit(DEFAULT_FINGER_ASSIGNMENT, (assignment) =>
    assignHomeKey(assignColumnFinger(assignKeyFinger(assignment, 'b', 'RI'), shape, 10, 'RR'), 'RR', 'l'),
  );

  // 直接与える側は、編集関数を通さず中身を手で書く
  const baseFinger: FingerAssignment['baseFinger'] = { ...DEFAULT_FINGER_ASSIGNMENT.baseFinger, b: 'RI' };
  for (const id of ['-', '[', "'"]) baseFinger[id] = 'RR';
  const direct = makeFingerAssignment('finger-edited', '編集した割り当て', baseFinger, { ...DEFAULT_FINGER_ASSIGNMENT.homeKey, RR: 'l' });
  assert.deepEqual(stored, direct);

  const viaEditor = measure(stored, shape.id);
  assert.deepEqual(viaEditor, measure(direct, shape.id));
  // 既定のままの数値とは別になる（比較が空振りしていないことの確認）
  assert.notDeepEqual(viaEditor, measure({ ...DEFAULT_FINGER_ASSIGNMENT, id: 'finger-edited', name: '編集した割り当て' }, shape.id));
});

test('既定へ戻すと、物理配列の規格（ANSI・JIS）の既定の割り当てと同じ中身・同じ数値になる', () => {
  const cases = [
    { shapeId: 'row-staggered', defaults: DEFAULT_FINGER_ASSIGNMENT },
    { shapeId: 'jis-row-staggered', defaults: JIS_FINGER_ASSIGNMENT },
  ];
  for (const { shapeId, defaults } of cases) {
    const shape = PHYSICAL_SHAPES[shapeId as keyof typeof PHYSICAL_SHAPES];
    // 既定に無いキーの割り当てを足し、列とキーを書き換えた状態から戻す
    const stored = createAndEdit(DEFAULT_FINGER_ASSIGNMENT, (assignment) =>
      assignKeyFinger(assignKeyFinger(assignColumnFinger(assignment, shape, 3, 'LM'), 'b', 'RI'), 'r9c20', 'RP'),
    );
    const reset = createAndEditAgain(stored, (assignment) => resetToDefaultAssignment(assignment, defaults));
    assert.deepEqual(reset.baseFinger, defaults.baseFinger, shapeId);
    assert.deepEqual(reset.fingerKeys, defaults.fingerKeys, shapeId);
    assert.deepEqual(reset.homeKey, defaults.homeKey, shapeId);
    assert.deepEqual(measure(reset, shapeId), measure({ ...defaults, id: reset.id, name: reset.name }, shapeId), shapeId);
  }
});

/** すでに保存されている割り当てを、もう一度コマンドで書き換える。 */
function createAndEditAgain(stored: FingerAssignment, edit: (assignment: FingerAssignment) => FingerAssignment): FingerAssignment {
  const assets: KeydistAssets = { ...emptyAssets(), fingerAssignments: [stored] };
  const step = applyCommand(assets, emptyCommandHistory<KeydistAssets>(), setFingerAssignmentContentCommand(stored.id, edit(stored)));
  return step.assets.fingerAssignments[0]!;
}
