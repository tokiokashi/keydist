import { EMPTY_PERSONAL_SPEED } from '#interpretation/timing/calibration-codec.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyCommandInScreen,
  emptyScreenHistories,
  stepInScreen,
  type Command,
  type ScreenHistories,
} from '#input/commands/index.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import {
  createSetupCommand,
  deleteSetupCommand,
  duplicateSetupCommand,
  relabelSetupCommand,
  resetCascadeItemCommand,
  setCascadeOverrideCommand,
  setSetupShapeCommand,
  type KeydistAssets,
} from './commands.ts';
import { KEYDIST_ITEM_SCOPES } from './history-scopes.ts';
import { initialMultiTargetSelection } from './multi-target-selection.ts';
import { initialSingleTargetSelection } from './single-target-selection.ts';

const SETUP_SCREEN = '/setup';
const OTHER_SCREEN = '/standalone/heatmap';

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
    userLayouts: [],
    userRomajiRules: [],
    personalSpeed: EMPTY_PERSONAL_SPEED,
  };
}

interface State {
  readonly assets: KeydistAssets;
  readonly histories: ScreenHistories<KeydistAssets>;
}

const start = (assets: KeydistAssets = emptyAssets()): State => ({ assets, histories: emptyScreenHistories() });

function run(state: State, screen: string, command: Command<KeydistAssets>): State {
  const next = applyCommandInScreen(state.assets, state.histories, screen, command);
  return { assets: next.assets, histories: next.histories };
}

function step(state: State, screen: string, direction: 'undo' | 'redo') {
  const result = stepInScreen(state.assets, state.histories, screen, direction, KEYDIST_ITEM_SCOPES);
  return { state: { assets: result.assets, histories: result.histories }, outcome: result.outcome };
}

const create = (id: string) => createSetupCommand('qwerty', 'row-staggered', () => id);
const global = (windowSize: number) => setCascadeOverrideCommand({ kind: 'global' }, 'windowSize', windowSize);
const ids = (state: State) => state.assets.setupLibrary.setups.map((setup) => setup.id);

test('Setupを作った後に別の画面で全体の条件を変えても、作った操作を元に戻せる', () => {
  let state = run(start(), SETUP_SCREEN, create('a'));
  state = run(state, OTHER_SCREEN, global(5));
  const undone = step(state, SETUP_SCREEN, 'undo');
  assert.equal(undone.outcome.kind, 'applied');
  assert.deepEqual(ids(undone.state), []);
  // 別の画面で変えた全体の条件は残る
  assert.equal(undone.state.assets.setupLibrary.overrides.global?.windowSize, 5);
  const redone = step(undone.state, SETUP_SCREEN, 'redo');
  assert.deepEqual(ids(redone.state), ['a']);
  assert.equal(redone.state.assets.setupLibrary.overrides.global?.windowSize, 5);
});

test('別の画面で全体の条件を変えた操作は、Setupを作った後でも元に戻せる', () => {
  let state = run(start(), OTHER_SCREEN, global(5));
  state = run(state, SETUP_SCREEN, create('a'));
  const undone = step(state, OTHER_SCREEN, 'undo');
  assert.equal(undone.outcome.kind, 'applied');
  assert.equal(undone.state.assets.setupLibrary.overrides.global, undefined);
  assert.deepEqual(ids(undone.state), ['a']);
});

test('同じSetupを別の画面で変えていた時だけ、元に戻せずに知らせる', () => {
  let state = run(start(), SETUP_SCREEN, create('a'));
  state = run(state, SETUP_SCREEN, relabelSetupCommand('a', '練習用'));
  state = run(state, OTHER_SCREEN, setSetupShapeCommand('a', 'ortho'));
  const undone = step(state, SETUP_SCREEN, 'undo');
  assert.equal(undone.outcome.kind, 'conflict');
  assert.equal(undone.state.assets.setupLibrary.setups[0]!.label, '練習用');
  assert.equal(undone.state.assets.setupLibrary.setups[0]!.shapeId, 'ortho');
});

test('Setupのレベルの条件を変えた操作は、別のSetupの変更に邪魔されずに元に戻せる', () => {
  let state = run(start(), SETUP_SCREEN, create('a'));
  state = run(state, SETUP_SCREEN, create('b'));
  state = run(state, SETUP_SCREEN, setCascadeOverrideCommand({ kind: 'setup', setupId: 'a' }, 'windowSize', 7));
  state = run(state, OTHER_SCREEN, setCascadeOverrideCommand({ kind: 'setup', setupId: 'b' }, 'windowSize', 9));
  const undone = step(state, SETUP_SCREEN, 'undo');
  assert.equal(undone.outcome.kind, 'applied');
  assert.equal(undone.state.assets.setupLibrary.overrides.setup?.['a'], undefined);
  assert.equal(undone.state.assets.setupLibrary.overrides.setup?.['b']?.windowSize, 9);
});

test('複製の取り消しは、複製した分のSetupとそのSetupのレベルの条件だけを除く', () => {
  let state = run(start(), SETUP_SCREEN, create('a'));
  state = run(state, SETUP_SCREEN, setCascadeOverrideCommand({ kind: 'setup', setupId: 'a' }, 'windowSize', 7));
  state = run(state, SETUP_SCREEN, duplicateSetupCommand('a', () => 'copy'));
  state = run(state, OTHER_SCREEN, global(4));
  assert.equal(state.assets.setupLibrary.overrides.setup?.['copy']?.windowSize, 7);
  const undone = step(state, SETUP_SCREEN, 'undo');
  assert.equal(undone.outcome.kind, 'applied');
  assert.deepEqual(ids(undone.state), ['a']);
  assert.equal(undone.state.assets.setupLibrary.overrides.setup?.['copy'], undefined);
  assert.equal(undone.state.assets.setupLibrary.overrides.setup?.['a']?.windowSize, 7);
  assert.equal(undone.state.assets.setupLibrary.overrides.global?.windowSize, 4);
});

test('作る操作を戻した後に別のSetupを作ると、番号は手持ちの最大＋1で決まる', () => {
  let state = run(start(), SETUP_SCREEN, create('a'));
  state = run(state, SETUP_SCREEN, create('b'));
  assert.deepEqual(state.assets.setupLibrary.setups.map((setup) => setup.number), [1, 2]);
  state = step(state, SETUP_SCREEN, 'undo').state;
  assert.deepEqual(ids(state), ['a']);
  state = run(state, SETUP_SCREEN, create('c'));
  assert.deepEqual(state.assets.setupLibrary.setups.map((setup) => [setup.id, setup.number]), [['a', 1], ['c', 2]]);
});

test('戻した作成を、同じ番号を別のSetupが使っている間はやり直せない', () => {
  let state = run(start(), SETUP_SCREEN, create('a'));
  state = step(state, SETUP_SCREEN, 'undo').state;
  // 別の画面で番号1のSetupが作られた
  state = run(state, OTHER_SCREEN, create('b'));
  const redone = step(state, SETUP_SCREEN, 'redo');
  assert.equal(redone.outcome.kind, 'conflict');
  assert.deepEqual(ids(redone.state), ['b']);
});

test('削除したSetupを戻すと、番号の昇順の位置に戻る', () => {
  let state = run(start(), SETUP_SCREEN, create('a'));
  state = run(state, SETUP_SCREEN, create('b'));
  state = run(state, SETUP_SCREEN, create('c'));
  state = run(state, '/assets', deleteSetupCommand('b'));
  assert.deepEqual(ids(state), ['a', 'c']);
  const undone = step(state, '/assets', 'undo');
  assert.equal(undone.outcome.kind, 'applied');
  assert.deepEqual(ids(undone.state), ['a', 'b', 'c']);
});

test('物理配列の付け替えは1回の操作で戻る', () => {
  let state = run(start(), SETUP_SCREEN, create('a'));
  state = run(state, SETUP_SCREEN, setSetupShapeCommand('a', 'ortho'));
  assert.equal(state.assets.setupLibrary.setups[0]!.shapeId, 'ortho');
  const undone = step(state, SETUP_SCREEN, 'undo');
  assert.equal(undone.state.assets.setupLibrary.setups[0]!.shapeId, 'row-staggered');
});

const SETUP_LEVEL = { kind: 'setup', setupId: 'a' } as const;
const condition = (windowSize: number) => setCascadeOverrideCommand(SETUP_LEVEL, 'windowSize', windowSize);

test('Setupのレベルの条件を戻した後にSetupを削除すると、条件をやり直せず、Setupの無い上書きを残さない', () => {
  let state = run(start(), SETUP_SCREEN, create('a'));
  state = run(state, SETUP_SCREEN, condition(7));
  const undone = step(state, SETUP_SCREEN, 'undo');
  assert.equal(undone.outcome.kind, 'applied');
  state = run(undone.state, '/assets', deleteSetupCommand('a'));
  const redone = step(state, SETUP_SCREEN, 'redo');
  assert.equal(redone.outcome.kind, 'conflict');
  assert.deepEqual(redone.state.assets.setupLibrary, { setups: [], overrides: emptyCascadeOverrides() });
});

test('Setupのレベルの条件を消した後にSetupを削除すると、消す前に戻せず、Setupの無い上書きを残さない', () => {
  let state = run(start(), SETUP_SCREEN, create('a'));
  state = run(state, SETUP_SCREEN, condition(7));
  state = run(state, SETUP_SCREEN, resetCascadeItemCommand(SETUP_LEVEL, 'windowSize'));
  state = run(state, '/assets', deleteSetupCommand('a'));
  const undone = step(state, SETUP_SCREEN, 'undo');
  assert.equal(undone.outcome.kind, 'conflict');
  assert.deepEqual(undone.state.assets.setupLibrary, { setups: [], overrides: emptyCascadeOverrides() });
});

test('Setupの削除を戻すと、Setupとそのレベルの条件が両方戻る', () => {
  let state = run(start(), SETUP_SCREEN, create('a'));
  state = run(state, SETUP_SCREEN, condition(7));
  state = run(state, '/assets', deleteSetupCommand('a'));
  const undone = step(state, '/assets', 'undo');
  assert.equal(undone.outcome.kind, 'applied');
  assert.deepEqual(ids(undone.state), ['a']);
  assert.equal(undone.state.assets.setupLibrary.overrides.setup?.a?.windowSize, 7);
});
