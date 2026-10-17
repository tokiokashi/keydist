import assert from 'node:assert/strict';
import test from 'node:test';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';
import { APP_STATE_STORAGE_KEY } from '../state/app-state-storage.ts';
import { SIDEBAR_BOOTSTRAP_SCRIPT, loadSidebarCollapsed, loadSidebarPinned, saveSidebarCollapsed, saveSidebarPinned } from './sidebar-preference.ts';

function createFakeStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const map = new Map(Object.entries(initial));
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

test('サイドバーの固定: 何も覚えていなければ固定', () => {
  assert.equal(loadSidebarPinned(createFakeStorage()), true);
});

test('サイドバーの固定: 外したことを覚え、他の項目を消さない', () => {
  const storage = createFakeStorage({
    [APP_STATE_STORAGE_KEY]: JSON.stringify({ version: 2, appearance: { theme: 'dark' } }),
  });
  assert.equal(saveSidebarPinned(storage, false), true);
  assert.equal(loadSidebarPinned(storage), false);
  const stored = JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY) ?? '{}');
  assert.deepEqual(stored.appearance, { theme: 'dark' });

  saveSidebarPinned(storage, true);
  assert.equal(loadSidebarPinned(storage), true);
});

test('サイドバーの固定: storageが例外を投げても固定として読む', () => {
  const storage: KeyValueStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {},
  };
  assert.equal(loadSidebarPinned(storage), true);
  assert.equal(saveSidebarPinned(storage, false), false);
});

test('畳んだまとまり: 何も覚えていなければ全部開いている', () => {
  assert.deepEqual(loadSidebarCollapsed(createFakeStorage()), []);
  const storage = createFakeStorage({ [APP_STATE_STORAGE_KEY]: JSON.stringify({ version: 2, shell: { sidebarPinned: true } }) });
  assert.deepEqual(loadSidebarCollapsed(storage), []);
});

test('畳んだまとまり: 畳んだことを覚え、開き直すと消える', () => {
  const storage = createFakeStorage();
  assert.equal(saveSidebarCollapsed(storage, ['about', 'assets']), true);
  // 並びは識別子の正準の順になる。
  assert.deepEqual(loadSidebarCollapsed(storage), ['assets', 'about']);
  saveSidebarCollapsed(storage, []);
  assert.deepEqual(loadSidebarCollapsed(storage), []);
});

test('畳んだまとまり: 壊れた保存値は全部開いた状態になり、知らない識別子は無視する', () => {
  const read = (collapsed: unknown) =>
    loadSidebarCollapsed(createFakeStorage({ [APP_STATE_STORAGE_KEY]: JSON.stringify({ version: 2, shell: { sidebarCollapsed: collapsed } }) }));
  assert.deepEqual(read('about'), []);
  assert.deepEqual(read({ about: true }), []);
  assert.deepEqual(read(7), []);
  assert.deepEqual(read(null), []);
  assert.deepEqual(read(['nope', 3, 'about']), ['about']);
  assert.deepEqual(loadSidebarCollapsed(createFakeStorage({ [APP_STATE_STORAGE_KEY]: '{broken' })), []);
});

test('固定と畳んだまとまりは同じshellに置き、片方の保存がもう片方を消さない', () => {
  const storage = createFakeStorage({
    [APP_STATE_STORAGE_KEY]: JSON.stringify({ version: 2, appearance: { theme: 'dark' } }),
  });
  saveSidebarCollapsed(storage, ['analyze']);
  assert.equal(loadSidebarPinned(storage), true);
  saveSidebarPinned(storage, false);
  assert.deepEqual(loadSidebarCollapsed(storage), ['analyze']);
  assert.equal(loadSidebarPinned(storage), false);
  saveSidebarCollapsed(storage, ['analyze', 'workspace']);
  assert.equal(loadSidebarPinned(storage), false);
  saveSidebarPinned(storage, true);
  assert.deepEqual(loadSidebarCollapsed(storage), ['analyze', 'workspace']);
  const stored = JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY) ?? '{}');
  assert.deepEqual(stored.appearance, { theme: 'dark' });
});

/** head scriptを、与えた保存値で走らせた後の `<html>` の属性を返す。 */
function runBootstrap(stored: string | null): Record<string, string> {
  const attributes: Record<string, string> = {};
  const document = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
    },
  };
  const localStorage = { getItem: () => stored };
  new Function('localStorage', 'document', SIDEBAR_BOOTSTRAP_SCRIPT)(localStorage, document);
  return attributes;
}

test('描画の前のスクリプト: 畳んだまとまりと固定の解除を属性に付け、読めない値では何も付けない', () => {
  assert.deepEqual(runBootstrap(null), {});
  assert.deepEqual(runBootstrap('{broken'), {});
  assert.deepEqual(runBootstrap(JSON.stringify({ version: 2, shell: { sidebarCollapsed: 'about' } })), {});
  assert.deepEqual(runBootstrap(JSON.stringify({ version: 2, shell: { sidebarPinned: false, sidebarCollapsed: ['about', 'nope', 'assets'] } })), {
    'data-sidebar': 'unpinned',
    'data-sidebar-collapsed': 'assets about',
  });
});

test('描画の前のスクリプトと読み込みは、同じ保存値から同じ畳んだまとまりと固定を取り出す', () => {
  const collapsedValues = [[], ['workspace'], ['about', 'analyze'], ['x'], 'analyze', null, 3];
  // 版が違う保存値は、読み込みが捨てるので、スクリプトも属性を付けない。
  for (const version of [2, 1, 3, '2', null, undefined]) {
    for (const collapsed of collapsedValues) {
      const raw = JSON.stringify({ version, shell: { sidebarPinned: false, sidebarCollapsed: collapsed } });
      const storage = createFakeStorage({ [APP_STATE_STORAGE_KEY]: raw });
      const attributes = runBootstrap(raw);
      const fromScript = (attributes['data-sidebar-collapsed'] ?? '').split(' ').filter((id) => id !== '');
      assert.deepEqual(fromScript, loadSidebarCollapsed(storage), raw);
      assert.equal(attributes['data-sidebar'] === undefined, loadSidebarPinned(storage), raw);
    }
  }
  for (const raw of ['null', '[]', '"2"', '7']) {
    assert.deepEqual(runBootstrap(raw), {}, raw);
  }
});
