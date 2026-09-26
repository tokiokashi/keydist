import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkspacePanelRegistry,
  resolvePanelLayout,
  type WorkspacePanelDefinitionInput,
} from '#tester/panels/panel-registry.ts';
import {
  createWorkspaceState,
  reconcileWorkspaceState,
} from '#tester/panels/workspace-state.ts';
import {
  workspaceReducer,
} from '#tester/panels/workspace-reducer.ts';
import {
  clampPanelRectToViewport,
} from '#tester/panels/viewport-clamp.ts';

const definitionInputs: WorkspacePanelDefinitionInput[] = [
  { id: 'input.keyboard', title: 'Keyboard', defaultDockSlot: 'main', minWidth: 240 },
  { id: 'input.details', title: 'Details', defaultDockSlot: 'side', canHide: true },
  { id: 'input.layer:thumb-l', title: 'Layer', defaultDockSlot: 'guide', canFloat: false },
];

const registry = createWorkspacePanelRegistry(definitionInputs);
const definitions = [...registry.values()];

test('workspace registry rejects invalid ids and normalizes capabilities', () => {
  assert.throws(
    () => createWorkspacePanelRegistry([{ ...definitionInputs[0]!, id: '' }]),
    /must not be empty/,
  );
  assert.throws(
    () => createWorkspacePanelRegistry([definitionInputs[0]!, definitionInputs[0]!]),
    /Duplicate workspace panel id/,
  );

  assert.equal(registry.get('input.keyboard')?.canFloat, true);
  assert.equal(registry.get('input.keyboard')?.canHide, false);
  assert.equal(registry.get('input.details')?.canHide, true);
  assert.equal(registry.get('input.layer:thumb-l')?.canFloat, false);
});

test('resolvePanelLayout makes the registry the authority for capability and size (#413)', () => {
  // input.keyboardはminWidthのみ明示。他はregistry既定値へ倒れる。
  assert.deepEqual(resolvePanelLayout(registry.get('input.keyboard')), {
    canFloat: true,
    minWidth: 240,
    minHeight: 240,
    defaultFloatingWidth: 560,
    defaultFloatingHeight: 480,
  });

  // canFloat: false のパネルはWorkspacePanel側のfloat/detach/keyboard floatを
  // 呼び出し元によらず一括で無効化するための唯一の判定材料になる。
  assert.equal(resolvePanelLayout(registry.get('input.layer:thumb-l')).canFloat, false);

  // 未登録パネル（防御的な呼び出し）は既定値のみで解決する
  assert.deepEqual(resolvePanelLayout(undefined), {
    canFloat: true,
    minWidth: 320,
    minHeight: 240,
    defaultFloatingWidth: 560,
    defaultFloatingHeight: 480,
  });
});

test('workspace state starts docked and keeps bottom-to-top registration order', () => {
  const state = createWorkspaceState(definitions);

  assert.equal(state.version, 1);
  assert.deepEqual(state.zOrder, definitions.map(({ id }) => id));
  assert.deepEqual(state.panels['input.keyboard'], {
    visible: true,
    mode: 'docked',
    dockSlot: 'main',
  });
  assert.equal(state.panels['missing'], undefined);
});

test('workspace reducer handles float, move, resize, activate, visibility and dock', () => {
  let state = createWorkspaceState(definitions);

  state = workspaceReducer(state, {
    type: 'float',
    id: 'input.keyboard',
    rect: { x: 10, y: 20, width: 400, height: 300 },
  });
  assert.equal(state.panels['input.keyboard']?.mode, 'floating');
  assert.equal(state.zOrder.at(-1), 'input.keyboard');

  state = workspaceReducer(state, { type: 'move', id: 'input.keyboard', x: 30, y: 40 });
  state = workspaceReducer(state, { type: 'resize', id: 'input.keyboard', width: 480, height: 320 });
  assert.deepEqual(state.panels['input.keyboard']?.rect, {
    x: 30,
    y: 40,
    width: 480,
    height: 320,
  });

  state = workspaceReducer(state, { type: 'activate', id: 'input.details' });
  assert.deepEqual(state.zOrder, [
    'input.layer:thumb-l',
    'input.keyboard',
    'input.details',
  ]);

  state = workspaceReducer(state, { type: 'set-visible', id: 'input.details', visible: false });
  assert.equal(state.panels['input.details']?.visible, false);

  state = workspaceReducer(state, { type: 'dock', id: 'input.keyboard' });
  assert.equal(state.panels['input.keyboard']?.mode, 'docked');
  assert.deepEqual(state.panels['input.keyboard']?.rect, {
    x: 30,
    y: 40,
    width: 480,
    height: 320,
  });
});

test('workspace reducer ignores unknown panel ids', () => {
  const state = createWorkspaceState(definitions);
  assert.equal(workspaceReducer(state, { type: 'activate', id: 'missing' }), state);
  assert.equal(
    workspaceReducer(state, { type: 'set-visible', id: 'missing', visible: false }),
    state,
  );
});

test('viewport clamp restores a panel fully inside the current viewport', () => {
  assert.deepEqual(
    clampPanelRectToViewport(
      { x: 1800, y: 1000, width: 700, height: 500 },
      { width: 1280, height: 720 },
      { minWidth: 320, minHeight: 180 },
    ),
    { x: 580, y: 220, width: 700, height: 500 },
  );
});

test('viewport clamp respects minimum size but never exceeds the viewport', () => {
  assert.deepEqual(
    clampPanelRectToViewport(
      { x: -20, y: Number.NaN, width: 10, height: 10 },
      { width: 200, height: 100 },
      { minWidth: 320, minHeight: 180 },
    ),
    { x: 0, y: 0, width: 200, height: 100 },
  );
});

test('workspace state reconciles dynamic definitions without losing surviving panel state', () => {
  let state = createWorkspaceState(definitions);
  state = workspaceReducer(state, {
    type: 'float',
    id: 'input.keyboard',
    rect: { x: 10, y: 20, width: 400, height: 300 },
  });
  state = workspaceReducer(state, { type: 'activate', id: 'input.details' });

  const nextRegistry = createWorkspacePanelRegistry([
    definitionInputs[0]!,
    { id: 'input.layer:new', title: 'New layer', defaultDockSlot: 'guide' },
  ]);
  const reconciled = reconcileWorkspaceState(state, [...nextRegistry.values()]);

  assert.deepEqual(reconciled.panels['input.keyboard'], state.panels['input.keyboard']);
  // 廃止済み/未知の静的panelはdormant化せずpruneする。
  assert.equal(reconciled.panels['input.details'], undefined);
  assert.deepEqual(reconciled.panels['input.layer:new'], {
    visible: true,
    mode: 'docked',
    dockSlot: 'guide',
  });
  // dormantなパネルはzOrderには出てこない
  assert.deepEqual(reconciled.zOrder, ['input.keyboard', 'input.layer:new']);
  assert.equal(reconciled.zOrder.includes('input.details'), false);
});

test('workspace state restores dormant floating rect when a definition reappears (A -> B -> A)', () => {
  let state = createWorkspaceState(definitions);
  state = workspaceReducer(state, {
    type: 'float',
    id: 'input.layer:thumb-l',
    rect: { x: 50, y: 60, width: 420, height: 280 },
  });
  const floatedLayerCard = state.panels['input.layer:thumb-l'];

  // layout B: レイヤーカンペのdefinitionが消える
  const layoutBRegistry = createWorkspacePanelRegistry([
    definitionInputs[0]!,
    definitionInputs[1]!,
  ]);
  const afterB = reconcileWorkspaceState(state, [...layoutBRegistry.values()]);
  assert.equal(afterB.zOrder.includes('input.layer:thumb-l'), false);
  // dormant状態でも内部には残っている（レンダリングされないだけ）
  assert.deepEqual(afterB.panels['input.layer:thumb-l'], floatedLayerCard);

  // layout A: 同じidのdefinitionが再登場
  const afterA = reconcileWorkspaceState(afterB, definitions);
  assert.deepEqual(afterA.panels['input.layer:thumb-l'], floatedLayerCard);
  assert.equal(afterA.zOrder.includes('input.layer:thumb-l'), true);
});

test('workspace state re-applies canHide invariant when a dormant dynamic panel reappears', () => {
  const hideableRegistry = createWorkspacePanelRegistry([
    definitionInputs[0]!,
    { ...definitionInputs[2]!, canHide: true },
  ]);
  let state = createWorkspaceState([...hideableRegistry.values()]);
  state = workspaceReducer(state, {
    type: 'set-visible',
    id: 'input.layer:thumb-l',
    visible: false,
  });

  const withoutLayer = createWorkspacePanelRegistry([definitionInputs[0]!]);
  const dormant = reconcileWorkspaceState(state, [...withoutLayer.values()]);
  assert.equal(dormant.panels['input.layer:thumb-l']?.visible, false);

  const afterA = reconcileWorkspaceState(dormant, definitions);
  assert.equal(afterA.panels['input.layer:thumb-l']?.visible, true);
});

test('workspace state reconciliation is referentially stable when definitions are unchanged', () => {
  const state = createWorkspaceState(definitions);
  assert.equal(reconcileWorkspaceState(state, definitions), state);
});
