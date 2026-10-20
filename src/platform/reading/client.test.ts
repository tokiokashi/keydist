import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReadingService, dictionaryUrl, type WorkerLike } from './client.ts';
import type { ReadingWorkerRequest, ReadingWorkerResponse } from './protocol.ts';

const dictionary = { url: '/dict.zip', version: '1' };

class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  terminated = false;
  requests: ReadingWorkerRequest[] = [];
  behave: (request: ReadingWorkerRequest) => ReadingWorkerResponse;
  constructor(behave: (request: ReadingWorkerRequest) => ReadingWorkerResponse) {
    this.behave = behave;
  }
  postMessage(message: ReadingWorkerRequest) {
    this.requests.push(message);
    queueMicrotask(() => this.onmessage?.({ data: this.behave(message) }));
  }
  terminate() {
    this.terminated = true;
  }
}

const okWorker = () =>
  new FakeWorker((request) =>
    request.op === 'load'
      ? { id: request.id, ok: true, op: 'load', source: 'network', stored: true }
      : { id: request.id, ok: true, op: 'tokenize', tokens: [{ surface: request.text, byteStart: 0, byteEnd: 3, reading: 'ア', isUnknown: false }] },
  );

test('呼ばれるまではWorkerを作らず、状態はidle', () => {
  let created = 0;
  const service = createReadingService({
    createWorker: () => {
      created += 1;
      return okWorker();
    },
    dictionary,
  });
  assert.deepEqual(service.status(), { state: 'idle' });
  assert.equal(created, 0);
});

test('loadは読み込み中を経てreadyになり、同時の呼び出しでWorkerを1つしか作らない', async () => {
  const workers: FakeWorker[] = [];
  const service = createReadingService({
    createWorker: () => {
      const worker = okWorker();
      workers.push(worker);
      return worker;
    },
    dictionary,
  });
  const states: string[] = [];
  service.subscribe(() => states.push(service.status().state));
  await Promise.all([service.load(), service.load(), service.tokenize('あ')]);
  assert.deepEqual(states, ['loading', 'ready']);
  assert.equal(workers.length, 1);
  assert.deepEqual(workers[0]?.requests[0], { id: 0, op: 'load', dictionary });
  assert.equal(workers[0]?.requests.filter((request) => request.op === 'load').length, 1);
});

test('tokenizeは語の列を返す', async () => {
  const service = createReadingService({ createWorker: okWorker, dictionary });
  assert.deepEqual(await service.tokenize('あ'), [{ surface: 'あ', byteStart: 0, byteEnd: 3, reading: 'ア', isUnknown: false }]);
});

test('読み込みの失敗はerrorとして区別でき、Workerを捨て、次の呼び出しで読み込み直す', async () => {
  let attempt = 0;
  const workers: FakeWorker[] = [];
  const service = createReadingService({
    createWorker: () => {
      attempt += 1;
      const failing = attempt === 1;
      const worker = new FakeWorker((request) =>
        failing ? { id: request.id, ok: false, message: '取得に失敗' } : { id: request.id, ok: true, op: 'load', source: 'cache', stored: true },
      );
      workers.push(worker);
      return worker;
    },
    dictionary,
  });
  await assert.rejects(service.load(), /取得に失敗/);
  assert.deepEqual(service.status(), { state: 'error', message: '取得に失敗' });
  assert.equal(workers[0]?.terminated, true);
  await service.load();
  assert.deepEqual(service.status(), { state: 'ready', source: 'cache', stored: true });
});

test('Workerを作れない環境はerrorになる', async () => {
  const service = createReadingService({
    createWorker: () => {
      throw new Error('Workerが無い');
    },
    dictionary,
  });
  await assert.rejects(service.tokenize('あ'), /Workerが無い/);
  assert.equal(service.status().state, 'error');
});

test('辞書のURLは公開パスの下に付く', () => {
  assert.equal(dictionaryUrl('/'), '/lindera-ipadic-6.2.0.zip');
  assert.equal(dictionaryUrl('/keydist/'), '/keydist/lindera-ipadic-6.2.0.zip');
  assert.equal(dictionaryUrl('/keydist'), '/keydist/lindera-ipadic-6.2.0.zip');
});
