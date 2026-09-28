import assert from 'node:assert/strict';
import test from 'node:test';
import { createEngineRequest, type EngineRequestState } from './request.ts';
import type { EngineScheduler } from './scheduler.ts';
import type { ResolvedInput, ResolvedInputError, ResolvedInputResult } from './resolved-input.ts';

/**
 * テスト用の決定的なスケジューラ。`flush()`を呼ぶまでタスクを実行しない。
 * `cancellable: false`にすると、キャンセルされても`flush()`で必ず実行する
 * （scheduler自身がキャンセルに協力しない場合でも、`request.ts`側のrevisionチェックだけで
 * 「古い結果を届けない」を守れることを確かめるため）。
 */
function createManualScheduler(options: { cancellable?: boolean } = {}): EngineScheduler & {
  flush(): void;
  pendingCount(): number;
} {
  const cancellable = options.cancellable ?? true;
  let queue: Array<{ cancelled: boolean; task: () => void }> = [];
  return {
    schedule(task) {
      const entry = { cancelled: false, task };
      queue.push(entry);
      return () => {
        if (cancellable) entry.cancelled = true;
      };
    },
    flush() {
      const toRun = queue;
      queue = [];
      for (const entry of toRun) {
        if (!entry.cancelled) entry.task();
      }
    },
    pendingCount: () => queue.filter((entry) => !entry.cancelled).length,
  };
}

// ダミーの解決済み入力・エラー。中身は使わず、compute側へそのまま渡って
// 「どの依頼由来の値か」をテストで見分けるためのタグとして使う。
function okResolution(tag: string): ResolvedInputResult {
  return { ok: true, input: { __tag: tag } as unknown as ResolvedInput };
}

function ngResolution(): ResolvedInputResult {
  const error: ResolvedInputError = { kind: 'incompatible-text', layout: {} as never, language: 'ja' };
  return { ok: false, error };
}

function tagOf(input: ResolvedInput): string {
  return (input as unknown as { __tag: string }).__tag;
}

test('request→flushで結果がreadyとしてlistenerへ届く', () => {
  const scheduler = createManualScheduler();
  const states: EngineRequestState<string>[] = [];
  const channel = createEngineRequest<string>((input) => `computed:${tagOf(input)}`, (s) => states.push(s), { scheduler });

  channel.request(okResolution('a'));
  assert.deepEqual(states.at(-1), { status: 'computing' });

  scheduler.flush();
  assert.deepEqual(states.at(-1), { status: 'ready', value: 'computed:a' });
});

test('unsubscribe後は進行中の計算があってもlistenerへ届かない', () => {
  const scheduler = createManualScheduler();
  const states: EngineRequestState<string>[] = [];
  const channel = createEngineRequest<string>((input) => `computed:${tagOf(input)}`, (s) => states.push(s), { scheduler });

  channel.request(okResolution('a'));
  channel.unsubscribe();
  scheduler.flush();

  assert.ok(states.every((s) => s.status !== 'ready'), 'unsubscribe後にreadyが届いてはいけない');
});

test('unsubscribe後のrequestは無視される', () => {
  const scheduler = createManualScheduler();
  const states: EngineRequestState<string>[] = [];
  const channel = createEngineRequest<string>((input) => `computed:${tagOf(input)}`, (s) => states.push(s), { scheduler });

  channel.unsubscribe();
  channel.request(okResolution('a'));
  scheduler.flush();

  assert.equal(states.length, 0);
});

test('同じキーへの依頼はcompute関数の共有先（cache）で1回に共有される', () => {
  const scheduler = createManualScheduler();
  let computeCalls = 0;
  const shared = new Map<string, string>();
  const compute = (input: ResolvedInput): string => {
    const key = tagOf(input);
    const cached = shared.get(key);
    if (cached !== undefined) return cached;
    computeCalls++;
    const value = `computed:${key}`;
    shared.set(key, value);
    return value;
  };

  const statesA: EngineRequestState<string>[] = [];
  const statesB: EngineRequestState<string>[] = [];
  const channelA = createEngineRequest<string>(compute, (s) => statesA.push(s), { scheduler });
  const channelB = createEngineRequest<string>(compute, (s) => statesB.push(s), { scheduler });

  channelA.request(okResolution('same-key'));
  channelB.request(okResolution('same-key'));
  scheduler.flush();

  assert.equal(computeCalls, 1, '中身が同じキーへの計算は共有され1回しか走らない');
  assert.deepEqual(statesA.at(-1), { status: 'ready', value: 'computed:same-key' });
  assert.deepEqual(statesB.at(-1), { status: 'ready', value: 'computed:same-key' });
});

test('計算中に新しい依頼が来たら、前のreadyな値をstaleとして保持しつつ再計算する', () => {
  const scheduler = createManualScheduler();
  const states: EngineRequestState<string>[] = [];
  const channel = createEngineRequest<string>((input) => `computed:${tagOf(input)}`, (s) => states.push(s), { scheduler });

  channel.request(okResolution('a'));
  scheduler.flush();
  assert.deepEqual(states.at(-1), { status: 'ready', value: 'computed:a' });

  channel.request(okResolution('b'));
  // flush前: 直前のreadyな値をstaleとして即座に見せる（ちらつかせないため）。
  assert.deepEqual(states.at(-1), { status: 'stale', value: 'computed:a' });

  scheduler.flush();
  assert.deepEqual(states.at(-1), { status: 'ready', value: 'computed:b' });
});

test('打ち切り: 連続した依頼のうち最後の結果だけが届く', () => {
  const scheduler = createManualScheduler();
  const states: EngineRequestState<string>[] = [];
  const channel = createEngineRequest<string>((input) => `computed:${tagOf(input)}`, (s) => states.push(s), { scheduler });

  channel.request(okResolution('a'));
  channel.request(okResolution('b'));
  channel.request(okResolution('c'));
  // 前の2つはスケジュール前にキャンセルされ、スケジュール待ちは最後の1件だけになる。
  assert.equal(scheduler.pendingCount(), 1);

  scheduler.flush();

  const readyStates = states.filter((s) => s.status === 'ready');
  assert.equal(readyStates.length, 1, 'readyは最後の依頼分だけ1回届く');
  assert.deepEqual(readyStates[0], { status: 'ready', value: 'computed:c' });
});

test('再入: listener内でrequest()を呼んでも取り消しの管理が壊れない', () => {
  const scheduler = createManualScheduler();
  const states: EngineRequestState<string>[] = [];
  let reentered = false;
  const channel = createEngineRequest<string>((input) => `computed:${tagOf(input)}`, (s) => {
    states.push(s);
    // 'b'向けの依頼がstaleを出した瞬間、listenerの中からさらに'c'への依頼を出す
    // （テキストがさらに変わった、のような状況を模す）。
    if (!reentered && s.status === 'stale') {
      reentered = true;
      channel.request(okResolution('c'));
    }
  }, { scheduler });

  channel.request(okResolution('a'));
  scheduler.flush();
  assert.deepEqual(states.at(-1), { status: 'ready', value: 'computed:a' });

  channel.request(okResolution('b'));
  // 'b'向けのタスクは再入した'c'向けの依頼によって正しく打ち切られ、
  // スケジュール待ちは'c'向けの1件だけになっているはず（2件たまってはいけない）。
  assert.equal(scheduler.pendingCount(), 1, '再入後もスケジュール待ちは1件のまま');

  scheduler.flush();
  const readyStates = states.filter((s) => s.status === 'ready');
  assert.deepEqual(readyStates.at(-1), { status: 'ready', value: 'computed:c' });
  assert.ok(
    readyStates.every((s) => s.status !== 'ready' || s.value !== 'computed:b'),
    '打ち切られた依頼（b）の結果はreadyとして届かない',
  );
});

test('再入: listener内でunsubscribe()を呼んだら、直後に積んだタスクも取り消されている', () => {
  const scheduler = createManualScheduler();
  const states: EngineRequestState<string>[] = [];
  const channel = createEngineRequest<string>((input) => `computed:${tagOf(input)}`, (s) => {
    states.push(s);
    if (s.status === 'computing') {
      channel.unsubscribe();
    }
  }, { scheduler });

  channel.request(okResolution('a'));
  // listener内のunsubscribe()が、この呼び出しがちょうど積んだタスクも取り消しているはず。
  assert.equal(scheduler.pendingCount(), 0, 'unsubscribe後にスケジュール待ちが残ってはいけない');

  scheduler.flush();
  assert.ok(states.every((s) => s.status !== 'ready'), 'unsubscribe後はreadyが届かない');
});

test('古い結果は後から届かない（schedulerがキャンセルに協力しなくても、revisionチェックで守られる）', () => {
  const scheduler = createManualScheduler({ cancellable: false });
  const states: EngineRequestState<string>[] = [];
  const channel = createEngineRequest<string>((input) => `computed:${tagOf(input)}`, (s) => states.push(s), { scheduler });

  channel.request(okResolution('old'));
  channel.request(okResolution('new'));
  // schedulerが協力しないので、両方のタスクがキューに残っている。
  assert.equal(scheduler.pendingCount(), 2);

  scheduler.flush();

  const readyStates = states.filter((s) => s.status === 'ready');
  assert.equal(readyStates.length, 1, '古い依頼分のタスクが後から実行されても、結果としては届かない');
  assert.deepEqual(readyStates[0], { status: 'ready', value: 'computed:new' });
});

test('解決済み入力自体の失敗は、計算を挟まず値として即座に届く', () => {
  const scheduler = createManualScheduler();
  const states: EngineRequestState<string>[] = [];
  const channel = createEngineRequest<string>(() => {
    throw new Error('resolutionが失敗している依頼はcomputeへ渡らないはず');
  }, (s) => states.push(s), { scheduler });

  channel.request(ngResolution());

  assert.equal(scheduler.pendingCount(), 0, '解決失敗はスケジュールしない');
  const last = states.at(-1);
  assert.ok(last?.status === 'failed');
  if (last?.status === 'failed') {
    assert.equal(last.error.kind, 'resolution');
  }
});

test('計算中の例外はfailedとして値で届く', () => {
  const scheduler = createManualScheduler();
  const states: EngineRequestState<string>[] = [];
  const channel = createEngineRequest<string>(() => {
    throw new Error('boom');
  }, (s) => states.push(s), { scheduler });

  channel.request(okResolution('a'));
  scheduler.flush();

  const last = states.at(-1);
  assert.ok(last?.status === 'failed');
  if (last?.status === 'failed') {
    assert.equal(last.error.kind, 'exception');
    assert.ok(last.error.error instanceof Error);
  }
});

test('購読していない（requestを呼んでいない）間はcomputeが走らない', () => {
  const scheduler = createManualScheduler();
  let computeCalls = 0;
  createEngineRequest<string>(() => {
    computeCalls++;
    return 'x';
  }, () => {}, { scheduler });

  scheduler.flush();
  assert.equal(computeCalls, 0);
});
