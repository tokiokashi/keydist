import assert from 'node:assert/strict';
import test from 'node:test';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';
import { createTextCommand, selectTextCommand, setStandaloneAnalyzerOptionsCommand, setTargetForSingleAndMultiCommand } from '#engine/commands.ts';
import { createWorkspaceCommand, renameWorkspaceCommand, restoreWorkspaceCommand } from '#engine/workspace-commands.ts';
import { createAssetStore } from './asset-store.ts';

function createFakeStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function createFakeBus() {
  const listeners = new Set<(key: string) => void>();
  return {
    subscribe: (keys: readonly string[], listener: (key: string) => void) => {
      const watched = new Set(keys);
      const wrapped = (key: string) => {
        if (watched.has(key)) listener(key);
      };
      listeners.add(wrapped);
      return () => {
        listeners.delete(wrapped);
      };
    },
    notify: (key: string) => {
      for (const listener of listeners) listener(key);
    },
  };
}

function newStore(storage: KeyValueStorage = createFakeStorage()) {
  const store = createAssetStore({ storage, notify: () => {} });
  store.start();
  return store;
}

let nextId = 0;
const freshId = () => `id-${++nextId}`;

test('start: storageを読み終えるまでreadyは偽で、読み込みが空でも真になる', () => {
  const store = createAssetStore({ storage: createFakeStorage(), notify: () => {} });
  assert.equal(store.getState().ready, false);
  store.start();
  assert.equal(store.getState().ready, true);
});

test('履歴は画面ごと: 離れても残り、別の画面の元に戻すでは動かない', () => {
  const store = newStore();
  store.dispatch('/analyzer/heatmap', setStandaloneAnalyzerOptionsCommand('heatmap', { n: 1 }));
  store.dispatch('/analyzer/keymap', setStandaloneAnalyzerOptionsCommand('keymap', { n: 2 }));

  // 画面の部品が外れても、ストアが履歴と値を持ち続ける
  assert.equal(store.step('/analyzer/heatmap', 'undo').kind, 'applied');
  assert.deepEqual(store.getAssets().standaloneAnalyzerOptions, { keymap: { n: 2 } });
  assert.equal(store.step('/analyzer/heatmap', 'redo').kind, 'applied');
  assert.deepEqual(store.getAssets().standaloneAnalyzerOptions, { heatmap: { n: 1 }, keymap: { n: 2 } });
});

test('別の画面で書き換わった資産に触れる項目は、戻せなかった知らせを出して捨てる', () => {
  const store = newStore();
  store.dispatch('/analyzer/heatmap', selectTextCommand('standalone', { kind: 'builtin', id: 'builtin:ja.modern' }));
  store.dispatch('/analyzer/keymap', selectTextCommand('standalone', { kind: 'builtin', id: 'builtin:ja.legacy' }));
  const before = store.getAssets();

  const outcome = store.step('/analyzer/heatmap', 'undo');
  assert.equal(outcome.kind, 'conflict');
  assert.equal(store.getAssets(), before);
  assert.match(store.getNotice()?.text ?? '', /元に戻せませんでした/);
  assert.equal(store.getState().histories.get('/analyzer/heatmap')?.undoStack.length, 0);

  store.dismissNotice();
  assert.equal(store.getNotice(), undefined);
});

test('戻せた時は、前の知らせを消す', () => {
  const store = newStore();
  store.dispatch('/a', createTextCommand('standalone', freshId));
  store.dispatch('/a', createTextCommand('standalone', freshId));
  store.dispatch('/b', createTextCommand('standalone', freshId));
  assert.equal(store.step('/a', 'undo').kind, 'conflict');
  assert.notEqual(store.getNotice(), undefined);
  store.dispatch('/c', setStandaloneAnalyzerOptionsCommand('heatmap', { n: 1 }));
  assert.equal(store.step('/c', 'undo').kind, 'applied');
  assert.equal(store.getNotice(), undefined);
});

test('Workspace Aを変えた後にWorkspace Bを変えても、Aの変更を戻せる', () => {
  const store = newStore();
  store.dispatch(undefined, createWorkspaceCommand('a', 'A'));
  store.dispatch(undefined, createWorkspaceCommand('b', 'B'));
  store.dispatch('/workspace/a', renameWorkspaceCommand('a', 'A2'));
  store.dispatch('/workspace/b', renameWorkspaceCommand('b', 'B2'));

  assert.equal(store.step('/workspace/a', 'undo').kind, 'applied');
  assert.deepEqual(
    store.getAssets().workspaces.map((workspace) => workspace.name),
    ['A', 'B2'],
  );
});

test('サイドバーでWorkspaceを作った後も、他の画面で取っておいたWorkspaceの中身の変更を戻せる', () => {
  const store = newStore();
  store.dispatch(undefined, createWorkspaceCommand('a', 'A'));
  store.dispatch('/workspace/a', renameWorkspaceCommand('a', 'A2'));
  // 履歴を持たない所（サイドバー）からの書き込み
  store.dispatch(undefined, createWorkspaceCommand('c', 'C'));

  assert.equal(store.step('/workspace/a', 'undo').kind, 'applied');
  assert.deepEqual(
    store.getAssets().workspaces.map((workspace) => workspace.name),
    ['A', 'C'],
  );
});

test('トップで対象を選んだ後は、その対象の選択に触れる項目が戻せなくなる', () => {
  const store = newStore();
  const target = { kind: 'layout' as const, layoutId: 'qwerty' };
  store.dispatch('/analyzer/heatmap', setTargetForSingleAndMultiCommand(target));
  store.dispatch(undefined, setTargetForSingleAndMultiCommand({ kind: 'layout', layoutId: 'dvorak' }));

  assert.equal(store.step('/analyzer/heatmap', 'undo').kind, 'conflict');
});

test('Workspaceの削除: 画面の履歴を捨て、履歴を持たない書き込みで戻せる', () => {
  const store = newStore();
  store.dispatch(undefined, createWorkspaceCommand('a', 'A'));
  const created = store.getAssets().workspaces[0]!;
  store.dispatch('/workspace/a', renameWorkspaceCommand('a', 'A2'));
  const renamed = store.getAssets().workspaces[0]!;
  store.discardHistory('/workspace/a');
  assert.equal(store.getState().histories.has('/workspace/a'), false);
  assert.equal(store.step('/workspace/a', 'undo').kind, 'no-op');

  store.dispatch(undefined, restoreWorkspaceCommand(created, 5));
  assert.equal(store.getAssets().workspaces.length, 1, '同じidが既にあれば戻さない');
  assert.equal(store.getAssets().workspaces[0], renamed);
});

test('別のタブでの変更: その資産に触れる項目を、取っておく全部の画面の履歴から捨てる', () => {
  const storage = createFakeStorage();
  const bus = createFakeBus();
  const tabA = createAssetStore({ storage, subscribe: bus.subscribe, notify: bus.notify });
  const tabB = createAssetStore({ storage, subscribe: bus.subscribe, notify: bus.notify });
  tabA.start();
  tabB.start();
  tabA.dispatch('/a', createTextCommand('standalone', freshId));
  tabA.dispatch('/b', setStandaloneAnalyzerOptionsCommand('heatmap', { n: 1 }));

  tabB.dispatch('/x', createTextCommand('standalone', freshId));

  assert.equal(tabA.getState().histories.get('/a')?.undoStack.length, 0);
  assert.equal(tabA.getState().histories.get('/b')?.undoStack.length, 1, '触れていない資産の項目は残る');
  assert.equal(tabA.getAssets().textLibrary.texts.length, 2);
});

test('履歴は保存データに書かない: 新しいストアは空の履歴で始まる', () => {
  const storage = createFakeStorage();
  const first = newStore(storage);
  first.dispatch('/a', setStandaloneAnalyzerOptionsCommand('playback', { showChain: true }));
  const reloaded = newStore(storage);
  assert.equal(reloaded.getState().histories.size, 0);
  assert.deepEqual(reloaded.getAssets().standaloneAnalyzerOptions, { playback: { showChain: true } });
});

test('購読: 値や履歴が変わった時だけ通知する', () => {
  const store = newStore();
  let count = 0;
  store.subscribe(() => {
    count += 1;
  });
  store.dispatch('/a', setStandaloneAnalyzerOptionsCommand('heatmap', { n: 1 }));
  assert.equal(count, 1);
  store.dispatch('/a', setStandaloneAnalyzerOptionsCommand('heatmap', { n: 1 }));
  assert.equal(count, 1, '同じ値の書き込み（no-op）では通知しない');
});
