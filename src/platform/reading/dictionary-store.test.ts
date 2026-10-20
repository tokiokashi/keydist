import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DICTIONARY_CACHE_PREFIX, type DictionaryCache, type DictionaryCacheStorage, dictionaryCacheName, loadDictionary } from './dictionary-store.ts';
import { buildDictionaryZip } from './zip-fixture.ts';

const URL_ = '/lindera-ipadic-6.2.0.zip';

function fakeStorage(options: { failOpen?: boolean; failPut?: boolean } = {}) {
  const caches = new Map<string, Map<string, Uint8Array<ArrayBuffer>>>();
  const storage: DictionaryCacheStorage = {
    async open(name) {
      if (options.failOpen === true) throw new Error('保存できない環境');
      const entries = caches.get(name) ?? new Map<string, Uint8Array<ArrayBuffer>>();
      caches.set(name, entries);
      const cache: DictionaryCache = {
        async match(request) {
          const bytes = entries.get(request);
          return bytes === undefined ? undefined : new Response(bytes.slice());
        },
        async put(request, response) {
          if (options.failPut === true) throw new Error('容量不足');
          entries.set(request, new Uint8Array(await response.arrayBuffer()));
        },
        async delete(request) {
          return entries.delete(request);
        },
      };
      return cache;
    },
    async keys() {
      return [...caches.keys()];
    },
    async delete(name) {
      return caches.delete(name);
    },
  };
  return { storage, caches };
}

function fakeFetch(respond: () => Response) {
  const calls: string[] = [];
  return {
    calls,
    fetchImpl: async (url: string) => {
      calls.push(url);
      return respond();
    },
  };
}

const zipResponse = () => new Response(buildDictionaryZip());

test('保存が無ければ取得して保存し、次は通信せずに保存から読む', async () => {
  const { storage, caches } = fakeStorage();
  const network = fakeFetch(zipResponse);
  const first = await loadDictionary({ url: URL_, version: '1', fetchImpl: network.fetchImpl, cacheStorage: storage });
  assert.equal(first.source, 'network');
  assert.equal(first.stored, true);
  assert.deepEqual([...caches.keys()], [dictionaryCacheName('1')]);

  const second = await loadDictionary({ url: URL_, version: '1', fetchImpl: network.fetchImpl, cacheStorage: storage });
  assert.equal(second.source, 'cache');
  assert.equal(network.calls.length, 1);
  assert.equal(second.files.length, 9);
});

test('版が変わったら保存を使わず取り直し、古い版の保存を消す', async () => {
  const { storage, caches } = fakeStorage();
  const network = fakeFetch(zipResponse);
  await loadDictionary({ url: URL_, version: '1', fetchImpl: network.fetchImpl, cacheStorage: storage });
  caches.set('other-app-cache', new Map());
  const next = await loadDictionary({ url: URL_, version: '2', fetchImpl: network.fetchImpl, cacheStorage: storage });
  assert.equal(next.source, 'network');
  assert.equal(network.calls.length, 2);
  assert.deepEqual([...caches.keys()].sort(), [dictionaryCacheName('2'), 'other-app-cache']);
  assert.ok([...caches.keys()].every((name) => name === 'other-app-cache' || name.startsWith(DICTIONARY_CACHE_PREFIX)));
});

test('応答の状態が正常でない時と、中身が辞書のzipでない時は、保存せず失敗する', async () => {
  for (const respond of [
    () => new Response('missing', { status: 404 }),
    () => new Response('<!doctype html><title>index</title>', { status: 200 }),
    () => new Response(buildDictionaryZip({ omit: 'dict.trie' }), { status: 200 }),
  ]) {
    const { storage, caches } = fakeStorage();
    const network = fakeFetch(respond);
    await assert.rejects(loadDictionary({ url: URL_, version: '1', fetchImpl: network.fetchImpl, cacheStorage: storage }));
    assert.deepEqual([...(caches.get(dictionaryCacheName('1')) ?? new Map()).keys()], []);
  }
});

test('保存してあった物が壊れていたら捨てて取り直す', async () => {
  const { storage, caches } = fakeStorage();
  caches.set(dictionaryCacheName('1'), new Map([[URL_, new TextEncoder().encode('<html>')]]));
  const network = fakeFetch(zipResponse);
  const loaded = await loadDictionary({ url: URL_, version: '1', fetchImpl: network.fetchImpl, cacheStorage: storage });
  assert.equal(loaded.source, 'network');
  assert.equal(network.calls.length, 1);
  assert.equal(loaded.stored, true);
});

test('保存が使えない環境では、保存せずに取得して読み込む', async () => {
  for (const cacheStorage of [undefined, fakeStorage({ failOpen: true }).storage, fakeStorage({ failPut: true }).storage]) {
    const network = fakeFetch(zipResponse);
    const loaded = await loadDictionary({ url: URL_, version: '1', fetchImpl: network.fetchImpl, cacheStorage });
    assert.equal(loaded.source, 'network');
    assert.equal(loaded.stored, false);
    assert.equal(loaded.files.length, 9);
  }
});
