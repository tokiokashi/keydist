import assert from 'node:assert/strict';
import test from 'node:test';
import { createEngineRequest, createEngineSetRequest, type EngineRequestState } from './request.ts';
import type { EngineScheduler } from './scheduler.ts';
import type { ResolvedInput, ResolvedInputResult } from './resolved-input.ts';

/**
 * `compute`がPromiseを返す場合（Worker越しの実装）の依頼の振る舞い。
 * 同期の`compute`の振る舞いは`request.test.ts`が見ている。
 */

/** 依頼をその場で実行するスケジューラ（`request()`の外側で1回だけ走らせるため、flushで手動実行）。 */
function manualScheduler(): EngineScheduler & { flush(): void } {
  let queue: Array<{ cancelled: boolean; task: () => void }> = [];
  return {
    schedule(task) {
      const entry = { cancelled: false, task };
      queue.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    flush() {
      const run = queue;
      queue = [];
      for (const entry of run) if (!entry.cancelled) entry.task();
    },
  };
}

function ok(tag: string): ResolvedInputResult {
  return { ok: true, input: { __tag: tag } as unknown as ResolvedInput };
}

function tagOf(input: ResolvedInput): string {
  return (input as unknown as { __tag: string }).__tag;
}

/** 呼ばれた順に、外から解決・拒否できるPromise。 */
function deferredComputes() {
  const calls: Array<{
    tag: string;
    signal: AbortSignal;
    resolve(value: string): void;
    reject(error: unknown): void;
  }> = [];
  return {
    calls,
    compute(input: ResolvedInput, signal: AbortSignal): Promise<string> {
      return new Promise<string>((resolve, reject) => {
        calls.push({ tag: tagOf(input), signal, resolve, reject });
      });
    },
  };
}

test('Promiseの計算は、解決した時点でreadyになる', async () => {
  const scheduler = manualScheduler();
  const states: EngineRequestState<string>[] = [];
  const deferred = deferredComputes();
  const channel = createEngineRequest<string>(deferred.compute, (s) => states.push(s), { scheduler });

  channel.request(ok('a'));
  scheduler.flush();
  assert.deepEqual(states.at(-1), { status: 'computing' });

  deferred.calls[0]!.resolve('value-a');
  await Promise.resolve();
  assert.deepEqual(states.at(-1), { status: 'ready', value: 'value-a' });
});

test('新しい依頼が来たら、計算中の依頼へ打ち切りを伝え、古い結果は届けない', async () => {
  const scheduler = manualScheduler();
  const states: EngineRequestState<string>[] = [];
  const deferred = deferredComputes();
  const channel = createEngineRequest<string>(deferred.compute, (s) => states.push(s), { scheduler });

  channel.request(ok('a'));
  scheduler.flush();
  channel.request(ok('b'));
  assert.equal(deferred.calls[0]!.signal.aborted, true);

  scheduler.flush();
  // 古い方が後から解決しても、結果として出さない。
  deferred.calls[1]!.resolve('value-b');
  deferred.calls[0]!.resolve('value-a');
  await Promise.resolve();
  assert.deepEqual(states.filter((s) => s.status === 'ready'), [{ status: 'ready', value: 'value-b' }]);
});

test('計算中に新しい依頼を出すと、直前の結果をstaleで持ち続ける', async () => {
  const scheduler = manualScheduler();
  const states: EngineRequestState<string>[] = [];
  const deferred = deferredComputes();
  const channel = createEngineRequest<string>(deferred.compute, (s) => states.push(s), { scheduler });

  channel.request(ok('a'));
  scheduler.flush();
  deferred.calls[0]!.resolve('value-a');
  await Promise.resolve();

  channel.request(ok('b'));
  assert.deepEqual(states.at(-1), { status: 'stale', value: 'value-a' });
});

test('Promiseの拒否はfailed（exception）になり、古い依頼の拒否は捨てる', async () => {
  const scheduler = manualScheduler();
  const states: EngineRequestState<string>[] = [];
  const deferred = deferredComputes();
  const channel = createEngineRequest<string>(deferred.compute, (s) => states.push(s), { scheduler });

  channel.request(ok('a'));
  scheduler.flush();
  channel.request(ok('b'));
  deferred.calls[0]!.reject(new Error('古い依頼の失敗'));
  scheduler.flush();
  await Promise.resolve();
  assert.notEqual(states.at(-1)?.status, 'failed');

  const failure = new Error('計算に失敗');
  deferred.calls[1]!.reject(failure);
  await Promise.resolve();
  assert.deepEqual(states.at(-1), { status: 'failed', error: { kind: 'exception', error: failure } });
});

test('unsubscribeは計算中の依頼を打ち切り、以後は何も届けない', async () => {
  const scheduler = manualScheduler();
  const states: EngineRequestState<string>[] = [];
  const deferred = deferredComputes();
  const channel = createEngineRequest<string>(deferred.compute, (s) => states.push(s), { scheduler });

  channel.request(ok('a'));
  scheduler.flush();
  channel.unsubscribe();
  assert.equal(deferred.calls[0]!.signal.aborted, true);

  deferred.calls[0]!.resolve('value-a');
  await Promise.resolve();
  assert.equal(states.some((s) => s.status === 'ready'), false);
});

test('集合対象の依頼でも同じく、Promiseの結果を届け、古い依頼は打ち切る', async () => {
  const scheduler = manualScheduler();
  const states: EngineRequestState<string>[] = [];
  const pending: Array<{ signal: AbortSignal; resolve(value: string): void }> = [];
  const channel = createEngineSetRequest<string>(
    (_members, signal) => new Promise<string>((resolve) => pending.push({ signal, resolve })),
    (s) => states.push(s),
    { scheduler },
  );

  channel.request([]);
  scheduler.flush();
  channel.request([]);
  assert.equal(pending[0]!.signal.aborted, true);
  scheduler.flush();
  pending[0]!.resolve('old');
  pending[1]!.resolve('new');
  await Promise.resolve();
  assert.deepEqual(states.filter((s) => s.status === 'ready'), [{ status: 'ready', value: 'new' }]);
});
