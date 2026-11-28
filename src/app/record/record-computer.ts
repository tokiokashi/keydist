import type { ResolvedInput } from '#engine/resolved-input.ts';
import type { RecordMeta } from '#engine/keystroke-record.ts';
import type { SentenceTap } from '#interpretation/timing/sentence-measurement.ts';
import { toWireInput } from '#engine/worker-wire.ts';
import { createRecordHandler } from './record-handler.ts';
import type { RecordFinishValue, RecordRangesValue, RecordRangeValue, RecordWorkerRequest, RecordWorkerResponse } from './record-worker-protocol.ts';

/** 打鍵の記録の計算の窓口。ブラウザではWorkerへ逃がし、Workerが無い環境（事前描画）では呼び出した側のスレッドで計算する。 */
export interface RecordComputer {
  ranges(input: ResolvedInput): Promise<RecordRangesValue>;
  range(input: ResolvedInput, rangeIndex: number): Promise<RecordRangeValue>;
  finish(
    input: ResolvedInput,
    rangeIndex: number,
    typed: readonly string[],
    taps: readonly SentenceTap[],
    meta: RecordMeta,
    windowed?: string,
  ): Promise<RecordFinishValue>;
}

export interface WorkerLike {
  postMessage(message: RecordWorkerRequest): void;
  terminate(): void;
  onmessage: ((event: { readonly data: RecordWorkerResponse }) => void) | null;
  onerror: ((event: { readonly message?: string }) => void) | null;
}

/**
 * 依頼を作る側。入力の配列は`engine/worker-wire.ts`の形で運ぶ。`sent`は、今のWorkerへ表を送り済みの識別子で、Workerごとに持つ。
 */
function requestsOver(call: <T>(build: (id: number, sent: Set<string>) => RecordWorkerRequest) => Promise<T>): RecordComputer {
  return {
    ranges: (input) =>
      call((id, sent) => ({
        id,
        kind: 'ranges',
        input: toWireInput(input, sent),
      })),
    range: (input, rangeIndex) =>
      call((id, sent) => ({
        id,
        kind: 'range',
        input: toWireInput(input, sent),
        rangeIndex,
      })),
    finish: (input, rangeIndex, typed, taps, meta, windowed) =>
      call((id, sent) => ({
        id,
        kind: 'finish',
        input: toWireInput(input, sent),
        rangeIndex,
        typed,
        taps,
        meta,
        windowed,
      })),
  };
}

/**
 * Workerへ依頼を送る窓口。Workerがエラーを出したら、待ちの依頼を拒否してWorkerを止め、次の依頼で作り直す。
 * 作り直したWorkerは配列を持たないので、送り済みの識別子も空にして、表をもう一度送る。
 */
export function createWorkerComputer(spawn: () => WorkerLike): RecordComputer {
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let worker: WorkerLike | undefined;
  let sent = new Set<string>();

  const stop = (stopping: WorkerLike): void => {
    if (worker === stopping) {
      worker = undefined;
      sent = new Set();
    }
    stopping.onmessage = null;
    stopping.onerror = null;
    stopping.terminate();
  };
  const attach = (created: WorkerLike): WorkerLike => {
    created.onmessage = (event) => {
      const entry = pending.get(event.data.id);
      if (entry === undefined) return;
      pending.delete(event.data.id);
      if (event.data.ok) entry.resolve(event.data.value);
      else entry.reject(new Error(event.data.message));
    };
    created.onerror = (event) => {
      for (const entry of pending.values()) entry.reject(new Error(event.message ?? '計算用のWorkerが止まりました'));
      pending.clear();
      stop(created);
    };
    return created;
  };
  return requestsOver(
    <T>(build: (id: number, sent: Set<string>) => RecordWorkerRequest) =>
      new Promise<T>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        try {
          worker ??= attach(spawn());
          worker.postMessage(build(id, sent));
        } catch (error) {
          pending.delete(id);
          if (worker !== undefined) stop(worker);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }),
  );
}

function createInlineComputer(): RecordComputer {
  const handle = createRecordHandler();
  const sent = new Set<string>();
  let nextId = 0;
  return requestsOver(async <T>(build: (id: number, sent: Set<string>) => RecordWorkerRequest) => {
    const response = handle(build(nextId++, sent));
    if (!response.ok) throw new Error(response.message);
    return response.value as T;
  });
}

let instance: RecordComputer | undefined;

/** 画面が共有する計算の窓口。実体は最初の依頼が来た時に作る（事前描画はモジュールを読むだけで依頼を出さない）。 */
export const sharedRecordComputer: RecordComputer = {
  ranges: (input) => computer().ranges(input),
  range: (input, rangeIndex) => computer().range(input, rangeIndex),
  finish: (input, rangeIndex, typed, taps, meta, windowed) => computer().finish(input, rangeIndex, typed, taps, meta, windowed),
};

function computer(): RecordComputer {
  if (instance === undefined) {
    // `new Worker(new URL(...))`の形はViteが静的に見つけて別チャンクにする。書き分けない。
    instance =
      typeof Worker === 'undefined'
        ? createInlineComputer()
        : createWorkerComputer(
            () =>
              new Worker(new URL('./record-worker.ts', import.meta.url), {
                type: 'module',
              }) as unknown as WorkerLike,
          );
  }
  return instance;
}
