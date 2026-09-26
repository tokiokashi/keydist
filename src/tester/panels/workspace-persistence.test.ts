import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspacePanelRegistry } from './panel-registry.ts';
import {
  createWorkspaceState,
  MAX_DORMANT_DYNAMIC_PANELS,
  type WorkspaceStateV1,
} from './workspace-state.ts';
import {
  clampAllFloatingPanels,
  createWorkspacePersistenceScheduler,
  decodeWorkspaceState,
  loadWorkspaceState,
  saveWorkspaceState,
  serializeWorkspaceState,
  WORKSPACE_STORAGE_KEY,
} from './workspace-persistence.ts';
import { APP_STATE_STORAGE_KEY } from '#app/state/app-state-storage.ts';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';

const registry = createWorkspacePanelRegistry([
  { id: 'a', title: 'A', defaultDockSlot: 'main', minWidth: 320, minHeight: 200 },
  { id: 'b', title: 'B', defaultDockSlot: 'side', canHide: true },
  { id: 'c', title: 'C', defaultDockSlot: 'side' },
]);
const definitions = [...registry.values()];
const viewport = { width: 1280, height: 720 };

function memoryStorage(): KeyValueStorage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

test('decode: empty storage falls back to default state', () => {
  const result = decodeWorkspaceState(null, definitions, registry, viewport);
  assert.deepEqual(result, createWorkspaceState(definitions));
});

test('decode: corrupt JSON falls back to default without throwing', () => {
  const result = decodeWorkspaceState('{not json', definitions, registry, viewport);
  assert.deepEqual(result, createWorkspaceState(definitions));
});

test('decode: unknown version falls back to default without throwing', () => {
  const result = decodeWorkspaceState(
    JSON.stringify({ version: 99, panels: {}, zOrder: [] }),
    definitions,
    registry,
    viewport,
  );
  assert.deepEqual(result, createWorkspaceState(definitions));
});

test('decode: structurally invalid payload falls back to default without throwing', () => {
  const result = decodeWorkspaceState(
    JSON.stringify({ version: 1, panels: 'nope' }),
    definitions,
    registry,
    viewport,
  );
  assert.deepEqual(result, createWorkspaceState(definitions));
});

test('decode: floating without rect falls back to docked', () => {
  const raw = JSON.stringify({
    version: 1,
    panels: { a: { visible: true, mode: 'floating' } },
    zOrder: ['a', 'b', 'c'],
  });
  const result = decodeWorkspaceState(raw, definitions, registry, viewport);
  assert.equal(result.panels.a?.mode, 'docked');
});

test('decode: canHide=false is normalized to visible even if saved hidden', () => {
  const raw = JSON.stringify({
    version: 1,
    panels: { a: { visible: false, mode: 'docked' } },
    zOrder: ['a', 'b', 'c'],
  });
  const result = decodeWorkspaceState(raw, definitions, registry, viewport);
  // 'a' の canHide は既定の false
  assert.equal(result.panels.a?.visible, true);
});

test('decode: canHide=true panels keep their saved hidden state', () => {
  const raw = JSON.stringify({
    version: 1,
    panels: { b: { visible: false, mode: 'docked' } },
    zOrder: ['a', 'b', 'c'],
  });
  const result = decodeWorkspaceState(raw, definitions, registry, viewport);
  assert.equal(result.panels.b?.visible, false);
});

test('decode: unknown fields on a panel are dropped', () => {
  const raw = JSON.stringify({
    version: 1,
    panels: {
      a: { visible: true, mode: 'docked', dockSlot: 'main', evil: 'inject' },
    },
    zOrder: ['a', 'b', 'c'],
  });
  const result = decodeWorkspaceState(raw, definitions, registry, viewport);
  assert.deepEqual(result.panels.a, { visible: true, mode: 'docked', dockSlot: 'main' });
});

test('decode: floating rect is clamped to viewport using the panel\'s min size', () => {
  const raw = JSON.stringify({
    version: 1,
    panels: {
      a: { visible: true, mode: 'floating', rect: { x: 5000, y: 5000, width: 400, height: 300 } },
    },
    zOrder: ['a', 'b', 'c'],
  });
  const result = decodeWorkspaceState(raw, definitions, registry, { width: 800, height: 600 });
  const rect = result.panels.a?.rect;
  assert.ok(rect !== undefined);
  assert.ok(rect.x + rect.width <= 800);
  assert.ok(rect.y + rect.height <= 600);
});

test('decode: dynamic layer panels stay dormant while retired static ids are pruned', () => {
  const raw = JSON.stringify({
    version: 1,
    panels: {
      a: { visible: true, mode: 'docked', dockSlot: 'main' },
      'input.layer:dormant': {
        visible: true,
        mode: 'floating',
        rect: { x: 10, y: 20, width: 300, height: 200 },
      },
      'input.details': { visible: true, mode: 'docked', dockSlot: 'side' },
    },
    zOrder: ['a', 'input.layer:dormant', 'input.details', 'b', 'c'],
  });
  const result = decodeWorkspaceState(raw, definitions, registry, viewport);
  assert.deepEqual(result.panels['input.layer:dormant'], {
    visible: true,
    mode: 'floating',
    rect: { x: 10, y: 20, width: 300, height: 200 },
  });
  assert.equal(result.panels['input.details'], undefined);
  assert.equal(result.zOrder.includes('input.layer:dormant'), false);
  assert.deepEqual(new Set(result.zOrder), new Set(['a', 'b', 'c']));
});

test('decode: dormant dynamic panels are bounded to the newest first-seen entries', () => {
  const dormant = Object.fromEntries(
    Array.from({ length: MAX_DORMANT_DYNAMIC_PANELS + 2 }, (_, index) => [
      `input.layer:${index}`,
      { visible: true, mode: 'docked', dockSlot: 'guide' },
    ]),
  );
  const result = decodeWorkspaceState(
    JSON.stringify({ version: 1, panels: dormant, zOrder: [] }),
    definitions,
    registry,
    viewport,
  );

  const dormantIds = Object.keys(result.panels).filter((id) => id.startsWith('input.layer:'));
  assert.equal(dormantIds.length, MAX_DORMANT_DYNAMIC_PANELS);
  assert.equal(result.panels['input.layer:0'], undefined);
  assert.equal(result.panels['input.layer:1'], undefined);
  assert.ok(result.panels['input.layer:2']);
});

test('decode: duplicate ids in saved zOrder are deduped, keeping the first occurrence', () => {
  const raw = JSON.stringify({
    version: 1,
    panels: {},
    zOrder: ['a', 'a', 'b', 'a', 'c'],
  });
  const result = decodeWorkspaceState(raw, definitions, registry, viewport);
  assert.deepEqual(result.zOrder, ['a', 'b', 'c']);
});

test('serialize/decode round trip preserves an already-valid state', () => {
  let state: WorkspaceStateV1 = createWorkspaceState(definitions);
  state = {
    ...state,
    panels: {
      ...state.panels,
      a: { visible: true, mode: 'floating', rect: { x: 10, y: 20, width: 400, height: 300 } },
    },
    zOrder: ['b', 'c', 'a'],
  };
  const raw = serializeWorkspaceState(state);
  const decoded = decodeWorkspaceState(raw, definitions, registry, viewport);
  assert.deepEqual(decoded, state);
});

test('loadWorkspaceState falls back to default when storage.getItem throws', () => {
  const throwingStorage: KeyValueStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {},
    removeItem: () => {},
  };
  const result = loadWorkspaceState(throwingStorage, definitions, registry, viewport);
  assert.deepEqual(result, createWorkspaceState(definitions));
});

test('saveWorkspaceState writes the workspace slice under AppState and round-trips via load', () => {
  const storage = memoryStorage();
  const state: WorkspaceStateV1 = createWorkspaceState(definitions);
  saveWorkspaceState(storage, state);
  const appState = JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY)!);
  assert.deepEqual(appState.workspace, state);
  assert.equal(storage.getItem(WORKSPACE_STORAGE_KEY), null);
  assert.deepEqual(loadWorkspaceState(storage, definitions, registry, viewport), state);
});

test('loadWorkspaceState migrates and removes the legacy workspace key', () => {
  const storage = memoryStorage();
  const state: WorkspaceStateV1 = createWorkspaceState(definitions);
  storage.setItem(WORKSPACE_STORAGE_KEY, serializeWorkspaceState(state));
  assert.deepEqual(loadWorkspaceState(storage, definitions, registry, viewport), state);
  assert.equal(storage.getItem(WORKSPACE_STORAGE_KEY), null);
  assert.deepEqual(JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY)!).workspace, state);
});

test('saveWorkspaceState swallows a storage.setItem failure', () => {
  const storage: KeyValueStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota exceeded');
    },
    removeItem: () => {},
  };
  assert.doesNotThrow(() => saveWorkspaceState(storage, createWorkspaceState(definitions)));
});

test('clampAllFloatingPanels re-clamps every floating rect and is a no-op when nothing changes', () => {
  let state = createWorkspaceState(definitions);
  state = {
    ...state,
    panels: {
      ...state.panels,
      a: { visible: true, mode: 'floating', rect: { x: 700, y: 500, width: 400, height: 300 } },
    },
  };
  const smaller = clampAllFloatingPanels(state, registry, { width: 800, height: 600 });
  const rect = smaller.panels.a?.rect;
  assert.ok(rect !== undefined);
  assert.ok(rect.x + rect.width <= 800);
  assert.ok(rect.y + rect.height <= 600);

  const stable = clampAllFloatingPanels(smaller, registry, { width: 800, height: 600 });
  assert.equal(stable, smaller);
});

test('write coalescing: rapid notify() calls debounce into a single write', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = memoryStorage();
  let writes = 0;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    writes += 1;
    originalSetItem(key, value);
  };
  const scheduler = createWorkspacePersistenceScheduler({ storage, debounceMs: 300 });

  let state = createWorkspaceState(definitions);
  scheduler.notify(state);
  t.mock.timers.tick(100);
  state = { ...state, zOrder: [...state.zOrder].reverse() };
  scheduler.notify(state);
  t.mock.timers.tick(100);
  state = { ...state, zOrder: [...state.zOrder].reverse() };
  scheduler.notify(state);
  // まだdebounce窓の中なので書き込みは起きていない
  assert.equal(writes, 0);

  t.mock.timers.tick(300);
  assert.equal(writes, 1);
  assert.deepEqual(JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY)!).workspace, state);
});

test('write coalescing: identical serialized state is not written twice', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = memoryStorage();
  let writes = 0;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    writes += 1;
    originalSetItem(key, value);
  };
  const scheduler = createWorkspacePersistenceScheduler({ storage, debounceMs: 50 });
  const state = createWorkspaceState(definitions);

  scheduler.notify(state);
  t.mock.timers.tick(50);
  assert.equal(writes, 1);

  // 同じ内容を再度notifyしても書き込みは増えない
  scheduler.notify({ ...state });
  t.mock.timers.tick(50);
  assert.equal(writes, 1);
});

test('write coalescing: flush() writes immediately and cancels the pending timer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = memoryStorage();
  let writes = 0;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    writes += 1;
    originalSetItem(key, value);
  };
  const scheduler = createWorkspacePersistenceScheduler({ storage, debounceMs: 1000 });
  const state = createWorkspaceState(definitions);

  scheduler.notify(state);
  scheduler.flush();
  assert.equal(writes, 1);

  // flush後にタイマーが残っていないことを確認する（余分な二重書きが起きない）
  t.mock.timers.tick(1000);
  assert.equal(writes, 1);
});

test('write coalescing: cancel() drops the pending write', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = memoryStorage();
  let writes = 0;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    writes += 1;
    originalSetItem(key, value);
  };
  const scheduler = createWorkspacePersistenceScheduler({ storage, debounceMs: 200 });
  scheduler.notify(createWorkspaceState(definitions));
  scheduler.cancel();
  t.mock.timers.tick(200);
  assert.equal(writes, 0);
});
