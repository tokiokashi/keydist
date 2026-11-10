import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { defineAssetCodec, isRecord } from '#input/codec/index.ts';
import { createAssetTabSync } from '../asset-tab-sync.ts';
import { dismissStorageWriteFailures, getStorageWriteFailuresSnapshot, guardedSetItem, type WritableStorage } from './storage-write.ts';

afterEach(() => dismissStorageWriteFailures());

/** 文字数の合計が`limit`を超える書き込みで、容量の超過の例外を投げる保存先。 */
class LimitedStorage implements WritableStorage {
  readonly data = new Map<string, string>();
  readonly limit: number;
  readonly error: () => unknown;
  constructor(limit: number, error: () => unknown = () => new DOMException('quota', 'QuotaExceededError')) {
    this.limit = limit;
    this.error = error;
  }
  get length(): number {
    return this.data.size;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    const others = [...this.data].filter(([name]) => name !== key).reduce((sum, [, stored]) => sum + stored.length, 0);
    if (others + value.length > this.limit) throw this.error();
    this.data.set(key, value);
  }
}

test('容量の超過で書けなかった時、書こうとしたキーと大きさを記録する', () => {
  const storage = new LimitedStorage(100);
  storage.data.set('keydist:text-library', 'x'.repeat(60));
  storage.data.set('keydist:user-layouts', 'y'.repeat(10));
  storage.data.set('other:key', 'z'.repeat(5));
  assert.equal(guardedSetItem(storage, 'keydist:workspaces', 'w'.repeat(50)), false);
  const [failure] = getStorageWriteFailuresSnapshot();
  assert.equal(failure!.key, 'keydist:workspaces');
  assert.equal(failure!.attemptedLength, 50);
  assert.equal(storage.getItem('keydist:workspaces'), null);
});

test('同じキーの書き込みが成功したら、失敗の記録を外す', () => {
  const storage = new LimitedStorage(100);
  storage.data.set('keydist:text-library', 'x'.repeat(30));
  assert.equal(guardedSetItem(storage, 'keydist:text-library', 'x'.repeat(200)), false);
  assert.equal(guardedSetItem(storage, 'keydist:text-library', 'x'.repeat(20)), true);
  assert.deepEqual(getStorageWriteFailuresSnapshot(), []);
});

test('容量の超過以外の失敗は記録しない', () => {
  const storage = new LimitedStorage(0, () => new DOMException('denied', 'SecurityError'));
  assert.equal(guardedSetItem(storage, 'keydist:text-library', 'x'), false);
  assert.deepEqual(getStorageWriteFailuresSnapshot(), []);
});

test('大きさを数えられない保存先でも、失敗の記録は残る', () => {
  const storage: WritableStorage = {
    setItem() {
      throw new DOMException('quota', 'QuotaExceededError');
    },
  };
  assert.equal(guardedSetItem(storage, 'keydist:presets', 'abc'), false);
  assert.equal(getStorageWriteFailuresSnapshot()[0]!.key, 'keydist:presets');
});

test('資産の保存が容量の超過で失敗したら記録され、保存データは書き換わらない', () => {
  const codec = defineAssetCodec<{ text: string }>({
    currentVersion: 1,
    decodePayload: (payload) => (isRecord(payload) && typeof payload.text === 'string' ? { text: payload.text } : undefined),
    encodePayload: (value) => ({ text: value.text }),
  });
  const storage = new LimitedStorage(100);
  const notified: string[] = [];
  const sync = createAssetTabSync({
    storageKey: 'keydist:text-library',
    codec,
    storage,
    subscribe: () => () => {},
    notify: (key) => notified.push(key),
    onExternalChange: () => {},
  });
  sync.save({ text: 'a' });
  const saved = storage.getItem('keydist:text-library');
  sync.save({ text: 'b'.repeat(500) });
  assert.equal(storage.getItem('keydist:text-library'), saved);
  assert.equal(getStorageWriteFailuresSnapshot()[0]!.key, 'keydist:text-library');
  assert.deepEqual(notified, ['keydist:text-library']);
});
