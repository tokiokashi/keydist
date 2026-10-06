import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import { sampleText, type TextLanguage } from '#input/text/samples.ts';
import { bigramFlowDefinition } from '#analyzers/bigram-flow/extract.ts';
import { DEFAULT_BIGRAM_FLOW_OPTIONS } from '#analyzers/bigram-flow/options.ts';
import { comparisonDefinition } from '#analyzers/comparison/extract.ts';
import { DEFAULT_COMPARISON_OPTIONS } from '#analyzers/comparison/options.ts';
import { nSensitivityDefinition } from '#analyzers/n-sensitivity/extract.ts';
import { DEFAULT_N_SENSITIVITY_OPTIONS } from '#analyzers/n-sensitivity/options.ts';
import { createEngineCache } from './cache.ts';
import { resolveEngineInput, type ResolvedInput } from './resolved-input.ts';
import type { EngineSetMemberInput } from './request.ts';
import { EMPTY_SETTINGS_OVERRIDES } from './settings-items.ts';
import { createWorkerEngineComputer, EngineAbortError, TRACE_MIRROR_MAX_ENTRIES, type WorkerLike } from './worker-client.ts';
import { createEngineWorkerHandler } from './worker-handler.ts';
import type { EngineWorkerRequest, EngineWorkerResponse } from './worker-protocol.ts';

/**
 * Worker越しの計算が、メインスレッドの`EngineCache`と**完全に同じ値**を返すこと。
 * 本物のWorkerは使わず、メッセージをブラウザと同じ構造化複製に通して`worker-handler.ts`へ
 * 渡す偽物を使う。複製できない値（関数・クラスのインスタンス等）が混ざっていれば、
 * ここで`DataCloneError`になる。
 */

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

const LAYOUT_IDS = ['qwerty', 'dvorak', 'colemak-dh'];

function resolveAll(text: string, language: TextLanguage): Array<{ id: string; input: ResolvedInput; member: EngineSetMemberInput }> {
  const setups = new Map<string, Setup>(
    LAYOUT_IDS.map((id) => [`setup-${id}`, { id: `setup-${id}`, number: 1, layoutId: id, shapeId: 'row-staggered' }]),
  );
  return LAYOUT_IDS.map((id) => {
    const target: AnalysisTarget = { kind: 'setup', setupId: `setup-${id}` };
    const resolution = resolveEngineInput({
      target,
      setups,
      catalog: CATALOG,
      userLayouts: new Map(),
      overrides: EMPTY_SETTINGS_OVERRIDES,
      text,
      language,
    });
    assert.ok(resolution.ok);
    return { id, input: resolution.ok ? resolution.input : (undefined as never), member: { target, resolution } };
  });
}

const REGISTRY = {
  single: [bigramFlowDefinition],
  set: [comparisonDefinition, nSensitivityDefinition],
};

/** 依頼を構造化複製してhandlerへ渡し、結果も複製して返す偽Worker。 */
function createFakeWorker(options: { manual?: boolean } = {}) {
  const handle = createEngineWorkerHandler(createEngineCache(), REGISTRY);
  const received: EngineWorkerRequest[] = [];
  let terminated = false;
  const held: Array<() => void> = [];
  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(message) {
      received.push(message);
      const request = structuredClone(message);
      const deliver = () => {
        if (terminated) return;
        const response: EngineWorkerResponse = structuredClone(handle(request));
        worker.onmessage?.({ data: response });
      };
      if (options.manual) held.push(deliver);
      else setImmediate(deliver);
    },
    terminate() {
      terminated = true;
    },
  };
  return { worker, received, held, isTerminated: () => terminated };
}

test('Worker越しのTrace・抽出は、メインスレッドの計算と完全に一致する（英文・日本語のローマ字入力）', async () => {
  for (const [language, sample] of [['en', 'default'], ['ja', 'legacy']] as const) {
    const entries = resolveAll(sampleText(language, sample), language);
    const local = createEngineCache();
    const remote = createWorkerEngineComputer(() => createFakeWorker().worker);

    assert.deepStrictEqual(await remote.getTrace(entries[0]!.input), local.getTrace(entries[0]!.input), `trace ${language}`);
    assert.deepStrictEqual(
      await remote.getExtraction(entries[0]!.input, bigramFlowDefinition, DEFAULT_BIGRAM_FLOW_OPTIONS),
      local.getExtraction(entries[0]!.input, bigramFlowDefinition, DEFAULT_BIGRAM_FLOW_OPTIONS),
      `bigram-flow ${language}`,
    );
    const members = entries.map((entry) => entry.member);
    assert.deepStrictEqual(
      await remote.getSetExtraction(members, comparisonDefinition, DEFAULT_COMPARISON_OPTIONS),
      local.getSetExtraction(members, comparisonDefinition, DEFAULT_COMPARISON_OPTIONS),
      `comparison ${language}`,
    );
    assert.deepStrictEqual(
      await remote.getSetExtraction(members, nSensitivityDefinition, DEFAULT_N_SENSITIVITY_OPTIONS),
      local.getSetExtraction(members, nSensitivityDefinition, DEFAULT_N_SENSITIVITY_OPTIONS),
      `n-sensitivity ${language}`,
    );
    remote.dispose();
  }
});

test('解決に失敗したメンバーを含む集合も、失敗を値のまま運んで一致する', async () => {
  const entries = resolveAll('hello world', 'en');
  const missing: AnalysisTarget = { kind: 'setup', setupId: 'setup-missing' };
  const members: EngineSetMemberInput[] = [
    entries[0]!.member,
    { target: missing, resolution: { ok: false, error: { kind: 'target-missing', target: missing } } },
  ];
  const remote = createWorkerEngineComputer(() => createFakeWorker().worker);
  assert.deepStrictEqual(
    await remote.getSetExtraction(members, comparisonDefinition, DEFAULT_COMPARISON_OPTIONS),
    createEngineCache().getSetExtraction(members, comparisonDefinition, DEFAULT_COMPARISON_OPTIONS),
  );
  remote.dispose();
});

test('Workerには1度に1件だけ送り、待ちのうちに打ち切られた依頼は送らない', async () => {
  const fake = createFakeWorker({ manual: true });
  const remote = createWorkerEngineComputer(() => fake.worker);
  const [entry] = resolveAll('hello', 'en');

  const first = remote.getTrace(entry!.input);
  const controller = new AbortController();
  const second = remote.getTrace(entry!.input, controller.signal);
  const third = remote.getTrace(entry!.input);
  assert.equal(fake.received.length, 1, '実行中は次を送らない');

  controller.abort();
  await assert.rejects(second, EngineAbortError);

  fake.held.shift()!();
  await first;
  assert.equal(fake.received.length, 2, '打ち切った依頼を飛ばして3件目を送る');
  assert.equal(fake.received[1]!.id !== fake.received[0]!.id, true);
  fake.held.shift()!();
  await third;
  assert.equal(fake.isTerminated(), false);
  remote.dispose();
});

test('実行中の依頼を打ち切るとWorkerを止め、次の依頼は新しいWorkerが受ける', async () => {
  const workers: Array<ReturnType<typeof createFakeWorker>> = [];
  const remote = createWorkerEngineComputer(() => {
    const fake = createFakeWorker({ manual: true });
    workers.push(fake);
    return fake.worker;
  });
  const [entry] = resolveAll('hello', 'en');

  const controller = new AbortController();
  const stale = remote.getTrace(entry!.input, controller.signal);
  const next = remote.getTrace(entry!.input);
  assert.equal(workers.length, 1);

  controller.abort();
  await assert.rejects(stale, EngineAbortError);
  assert.equal(workers[0]!.isTerminated(), true);
  assert.equal(workers.length, 2, '続きは新しいWorkerへ');
  assert.equal(workers[1]!.received.length, 1);

  workers[1]!.held.shift()!();
  assert.deepStrictEqual(await next, createEngineCache().getTrace(entry!.input));
  remote.dispose();
});

test('打ち切り済みのsignalを渡した依頼は、Workerへ送らずに拒否する', async () => {
  const fake = createFakeWorker();
  const remote = createWorkerEngineComputer(() => fake.worker);
  const [entry] = resolveAll('hello', 'en');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(remote.getTrace(entry!.input, controller.signal), EngineAbortError);
  assert.equal(fake.received.length, 0);
});

test('Worker内の例外（未登録のAnalyzer等）は、メッセージ付きのErrorで拒否される', async () => {
  const [entry] = resolveAll('hello', 'en');
  const remote = createWorkerEngineComputer(() => createFakeWorker().worker);
  const unknown = { ...bigramFlowDefinition, id: 'unknown-analyzer' };
  await assert.rejects(
    remote.getExtraction(entry!.input, unknown, DEFAULT_BIGRAM_FLOW_OPTIONS),
    (error: Error) => {
      assert.match(error.message, /未登録のAnalyzerです: unknown-analyzer/);
      // 不具合報告に使う原文のstackも、Workerの中のものが届く。
      assert.match(error.stack ?? '', /worker-handler/);
      return true;
    },
  );
  // 失敗の後も、同じWorkerで次の依頼を受けられる。
  assert.ok(await remote.getTrace(entry!.input));
  remote.dispose();
});

test('Workerの読み込み失敗・異常終了は拒否になり、待ちの依頼は次のWorkerで続く', async () => {
  const [entry] = resolveAll('hello', 'en');
  const workers: Array<ReturnType<typeof createFakeWorker>> = [];
  const remote = createWorkerEngineComputer(() => {
    const fake = createFakeWorker({ manual: true });
    workers.push(fake);
    return fake.worker;
  });

  const broken = remote.getTrace(entry!.input);
  const after = remote.getTrace(entry!.input);
  workers[0]!.worker.onerror?.({ message: '読み込めない' });
  await assert.rejects(broken, /読み込めない/);
  assert.equal(workers[0]!.isTerminated(), true);
  assert.equal(workers.length, 2);

  workers[1]!.held.shift()!();
  assert.ok(await after);
  remote.dispose();
});

test('Workerを作れない環境では、依頼が拒否される', async () => {
  const [entry] = resolveAll('hello', 'en');
  const remote = createWorkerEngineComputer(() => {
    throw new Error('Workerを起動できません');
  });
  await assert.rejects(remote.getTrace(entry!.input), /Workerを起動できません/);
});

test('disposeは待ちと実行中の依頼を打ち切り扱いで拒否し、Workerを止める', async () => {
  const fake = createFakeWorker({ manual: true });
  const remote = createWorkerEngineComputer(() => fake.worker);
  const [entry] = resolveAll('hello', 'en');
  const running = remote.getTrace(entry!.input);
  const waiting = remote.getTrace(entry!.input);
  remote.dispose();
  await assert.rejects(running, EngineAbortError);
  await assert.rejects(waiting, EngineAbortError);
  assert.equal(fake.isTerminated(), true);
});

test('受け取った結果はメインスレッドに写り、同じ中身の入力なら別のオブジェクトでも同期に引ける', async () => {
  const fake = createFakeWorker();
  const remote = createWorkerEngineComputer(() => fake.worker);
  const [first] = resolveAll('hello world', 'en');
  // 計算前は引けない（peekは計算を始めない）
  assert.equal(remote.peekTrace?.(first!.input), undefined);
  assert.equal(remote.peekExtraction?.(first!.input, bigramFlowDefinition, DEFAULT_BIGRAM_FLOW_OPTIONS), undefined);
  assert.equal(fake.received.length, 0);

  const trace = await remote.getTrace(first!.input);
  const extraction = await remote.getExtraction(first!.input, bigramFlowDefinition, DEFAULT_BIGRAM_FLOW_OPTIONS);
  const sent = fake.received.length;

  // 解決し直した（中身は同じで参照は別の）入力でも、送らずに同じ値が返る
  const [again] = resolveAll('hello world', 'en');
  assert.notEqual(again!.input, first!.input);
  assert.strictEqual(remote.peekTrace?.(again!.input), trace);
  assert.strictEqual(remote.peekExtraction?.(again!.input, bigramFlowDefinition, DEFAULT_BIGRAM_FLOW_OPTIONS), extraction);
  assert.equal(fake.received.length, sent);

  // 中身が違えば引けない（配列が違う・テキストが違う）
  assert.equal(remote.peekTrace?.(resolveAll('hello world', 'en')[1]!.input), undefined);
  assert.equal(remote.peekTrace?.(resolveAll('hello worlds', 'en')[0]!.input), undefined);
  remote.dispose();
});

test('集合の抽出も、メンバーの中身と並びが同じなら同期に引け、並びが変われば引けない', async () => {
  const remote = createWorkerEngineComputer(() => createFakeWorker().worker);
  const members = resolveAll('hello world', 'en').map((entry) => entry.member);
  assert.equal(remote.peekSetExtraction?.(members, comparisonDefinition, DEFAULT_COMPARISON_OPTIONS), undefined);
  const result = await remote.getSetExtraction(members, comparisonDefinition, DEFAULT_COMPARISON_OPTIONS);

  const rebuilt = resolveAll('hello world', 'en').map((entry) => entry.member);
  assert.strictEqual(remote.peekSetExtraction?.(rebuilt, comparisonDefinition, DEFAULT_COMPARISON_OPTIONS), result);
  assert.equal(remote.peekSetExtraction?.([...rebuilt].reverse(), comparisonDefinition, DEFAULT_COMPARISON_OPTIONS), undefined);
  assert.equal(remote.peekSetExtraction?.(rebuilt, nSensitivityDefinition, DEFAULT_N_SENSITIVITY_OPTIONS), undefined);
  remote.dispose();
});

test('打ち切られた依頼の結果は写らない', async () => {
  const fake = createFakeWorker({ manual: true });
  const remote = createWorkerEngineComputer(() => fake.worker);
  const [entry] = resolveAll('hello', 'en');
  const controller = new AbortController();
  const pending = remote.getTrace(entry!.input, controller.signal);
  controller.abort();
  await assert.rejects(pending, EngineAbortError);
  assert.equal(remote.peekTrace?.(entry!.input), undefined);
  remote.dispose();
});

test('Traceの写しは8件まで（古いものから捨てる）。A→B→Aの往復と、直近8件の行き来は同期に引ける', async () => {
  assert.equal(TRACE_MIRROR_MAX_ENTRIES, 8);
  const remote = createWorkerEngineComputer(() => createFakeWorker().worker);
  const inputs = Array.from({ length: TRACE_MIRROR_MAX_ENTRIES + 1 }, (_, i) => resolveAll(`hello ${i}`, 'en')[0]!.input);

  // A→B→A: 間に1件挟んでも、最初の入力へ戻る時に引ける
  await remote.getTrace(inputs[0]!);
  await remote.getTrace(inputs[1]!);
  assert.ok(remote.peekTrace?.(inputs[0]!) !== undefined, 'A→B→Aで戻れない');

  // 9件目で、最も長く触っていない1件（ここでは直前にpeekしたAではなく、Bより古いもの）が押し出される
  for (const input of inputs.slice(2)) await remote.getTrace(input);
  assert.equal(remote.peekTrace?.(inputs[1]!), undefined, '上限を超えたのに古い写しが残っている');
  for (const index of [0, 2, 3, 4, 5, 6, 7, 8]) {
    assert.ok(remote.peekTrace?.(inputs[index]!) !== undefined, `直近8件のうち${index}番目が引けない`);
  }
  remote.dispose();
});
