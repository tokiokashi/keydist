import { EMPTY_PERSONAL_SPEED } from '#interpretation/timing/calibration-codec.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSetupCommand,
  setCascadeOverrideCommand,
  setSetupShapeCommand,
  type KeydistAssets,
} from '#engine/commands.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { withWorkspaceConditions } from '#engine/settings-items.ts';
import { initialWorkspaceLibrary } from '#engine/workspace.ts';
import { initialMultiTargetSelection } from '#engine/multi-target-selection.ts';
import { initialSingleTargetSelection } from '#engine/single-target-selection.ts';
import { applyCommand, emptyCommandHistory, type Command, type CommandHistory } from '#input/commands/index.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import { resetSetupConditionsCommand, resettableSetupIds, setSetupConditionCommand } from '#hosts/shared/condition-edit.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { paneCatalog } from '../standalone/catalog.ts';
import { SETUP_HIDDEN_ITEM_IDS, setupConditionRows, setupListItems } from './setup-view.ts';

interface Session {
  assets: KeydistAssets;
  history: CommandHistory<KeydistAssets>;
}

function newSession(): Session {
  return {
    assets: {
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
    },
    history: emptyCommandHistory<KeydistAssets>(),
  };
}

function dispatch(session: Session, command: Command<KeydistAssets>): void {
  const result = applyCommand(session.assets, session.history, command);
  session.assets = result.assets;
  session.history = result.history;
}

const row = (session: Session, setupId: string, id: string) => {
  const setup = session.assets.setupLibrary.setups.find((entry) => entry.id === setupId)!;
  const rows = setupConditionRows(setup, paneCatalog(session.assets), session.assets.setupLibrary.overrides);
  assert.ok(rows);
  return rows.find((entry) => entry.id === id)!;
};

test('同じ配列で物理配列の違うSetupを2つ作ると、別々の物理配列で解決され、一覧では物理配列の名前で区別される', () => {
  const session = newSession();
  dispatch(session, createSetupCommand('qwerty', 'row-staggered', () => 'a'));
  dispatch(session, createSetupCommand('qwerty', 'ortholinear', () => 'b'));
  const catalog = paneCatalog(session.assets);
  const items = setupListItems(session.assets.setupLibrary.setups, catalog, session.assets.setupLibrary.overrides);
  assert.equal(new Set(items.map((item) => item.displayName)).size, 2);
  assert.ok(items.every((item) => item.displayName !== 'QWERTY'), items.map((item) => item.displayName).join());

  const geometries = ['a', 'b'].map((setupId) => {
    const resolved = resolveEngineInput({
      target: { kind: 'setup', setupId },
      setups: new Map(session.assets.setupLibrary.setups.map((setup) => [setup.id, setup] as const)),
      catalog: catalog.setupCatalog,
      userLayouts: catalog.userLayouts,
      overrides: session.assets.setupLibrary.overrides,
      text: 'the quick brown fox',
      language: 'en',
    });
    assert.ok(resolved.ok);
    return resolved.ok ? resolved.input.geometry.id : '';
  });
  assert.notEqual(geometries[0], geometries[1]);
});

test('物理配列の付け替えは一覧の名前と解決に反映され、元に戻せる', () => {
  const session = newSession();
  dispatch(session, createSetupCommand('qwerty', 'row-staggered', () => 'a'));
  dispatch(session, setSetupShapeCommand('a', 'ortholinear'));
  assert.equal(session.assets.setupLibrary.setups[0]!.shapeId, 'ortholinear');
  const [item] = setupListItems(session.assets.setupLibrary.setups, paneCatalog(session.assets), session.assets.setupLibrary.overrides);
  assert.ok(item!.fullName.includes(PHYSICAL_SHAPES.ortholinear.name), item!.fullName);
});

test('Setupのレベルの条件: 継承する値は全体と配列のレベルから求め、Workspaceのレベルは含まない。継承と同じ値を書くと上書きを消す', () => {
  const session = newSession();
  dispatch(session, createSetupCommand('qwerty', 'row-staggered', () => 'a'));
  dispatch(session, setCascadeOverrideCommand({ kind: 'global' }, 'windowSize', 4));
  dispatch(session, setCascadeOverrideCommand({ kind: 'layout', layoutId: 'qwerty' }, 'windowSize', 6));
  const before = row(session, 'a', 'windowSize');
  assert.equal(before.setupBase, 6);
  assert.equal(before.value, 6);

  dispatch(session, setSetupConditionCommand('a', 'windowSize', 8, before.setupBase as number));
  const after = row(session, 'a', 'windowSize');
  assert.equal(after.value, 8);
  assert.deepEqual(after.origin, { kind: 'setup', setupId: 'a' });
  assert.equal(after.setupBase, 6);

  // 継承する値へ戻すと上書きが消える
  dispatch(session, setSetupConditionCommand('a', 'windowSize', 6, after.setupBase as number));
  assert.equal(session.assets.setupLibrary.overrides.setup, undefined);
});

test('Setupのレベルの条件は、Workspaceのレベルの値があっても、そのWorkspaceの中の解決で勝つ', () => {
  const session = newSession();
  dispatch(session, createSetupCommand('qwerty', 'row-staggered', () => 'a'));
  dispatch(session, setSetupConditionCommand('a', 'windowSize', 8, 3));
  const catalog = paneCatalog(session.assets);
  const resolveWith = (workspaceN: number) => {
    const resolved = resolveEngineInput({
      target: { kind: 'setup', setupId: 'a' },
      setups: new Map(session.assets.setupLibrary.setups.map((setup) => [setup.id, setup] as const)),
      catalog: catalog.setupCatalog,
      userLayouts: catalog.userLayouts,
      overrides: withWorkspaceConditions(session.assets.setupLibrary.overrides, { windowSize: workspaceN }),
      text: 'the quick brown fox',
      language: 'en',
    });
    assert.ok(resolved.ok);
    return resolved.ok ? resolved.input.cascade.windowSize.value : undefined;
  };
  assert.equal(resolveWith(5), 8);
});

test('Setupのレベルの変更をまとめて戻す: 行を出さない項目は触らず、1回の元に戻すで全部戻る', () => {
  const session = newSession();
  dispatch(session, createSetupCommand('qwerty', 'row-staggered', () => 'a'));
  dispatch(session, setSetupConditionCommand('a', 'windowSize', 8, 3));
  dispatch(session, setSetupConditionCommand('a', 'sfbHomeCost', false, true));
  const ids = resettableSetupIds(session.assets.setupLibrary.overrides, 'a', SETUP_HIDDEN_ITEM_IDS);
  assert.deepEqual([...ids].sort(), ['sfbHomeCost', 'windowSize']);
  dispatch(session, resetSetupConditionsCommand('a', ids));
  assert.equal(session.assets.setupLibrary.overrides.setup, undefined);
  assert.equal(resettableSetupIds(session.assets.setupLibrary.overrides, 'a', SETUP_HIDDEN_ITEM_IDS).length, 0);
});

test('配列が見つからないSetupは条件の行を作らず、一覧では見つからない旨の名前で出る。物理配列が見つからない時も同じ', () => {
  const session = newSession();
  dispatch(session, createSetupCommand('user-missing', 'row-staggered', () => 'a'));
  dispatch(session, createSetupCommand('qwerty', 'future-shape', () => 'b'));
  const catalog = paneCatalog(session.assets);
  const overrides = session.assets.setupLibrary.overrides;
  assert.equal(setupConditionRows(session.assets.setupLibrary.setups[0]!, catalog, overrides), undefined);
  assert.equal(setupConditionRows(session.assets.setupLibrary.setups[1]!, catalog, overrides), undefined);
  const items = setupListItems(session.assets.setupLibrary.setups, catalog, overrides);
  assert.match(items[0]!.displayName, /見つからない配列/);
  assert.match(items[1]!.displayName, /見つからない物理配列/);
  // 物理配列を選び直すと条件の行が出る
  dispatch(session, setSetupShapeCommand('b', 'row-staggered'));
  assert.ok(setupConditionRows(session.assets.setupLibrary.setups[1]!, paneCatalog(session.assets), session.assets.setupLibrary.overrides));
});
