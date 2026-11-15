import type { ResolvedInput } from '#engine/resolved-input.ts';
import type { RecordMeta } from '#engine/keystroke-record.ts';
import type { SentenceTap } from '#interpretation/timing/sentence-measurement.ts';
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

interface WorkerLike {
  postMessage(message: RecordWorkerRequest): void;
  onmessage: ((event: { readonly data: RecordWorkerResponse }) => void) | null;
  onerror: ((event: { readonly message?: string }) => void) | null;
}

function createWorkerComputer(worker: WorkerLike): RecordComputer {
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  worker.onmessage = (event) => {
    const entry = pending.get(event.data.id);
    if (entry === undefined) return;
    pending.delete(event.data.id);
    if (event.data.ok) entry.resolve(event.data.value);
    else entry.reject(new Error(event.data.message));
  };
  worker.onerror = (event) => {
    for (const entry of pending.values()) entry.reject(new Error(event.message ?? '計算用のWorkerが止まりました'));
    pending.clear();
  };
  const call = <T>(build: (id: number) => RecordWorkerRequest): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      worker.postMessage(build(id));
    });
  return {
    ranges: (input) => call((id) => ({ id, kind: 'ranges', input })),
    range: (input, rangeIndex) => call((id) => ({ id, kind: 'range', input, rangeIndex })),
    finish: (input, rangeIndex, typed, taps, meta, windowed) => call((id) => ({ id, kind: 'finish', input, rangeIndex, typed, taps, meta, windowed })),
  };
}

function createInlineComputer(): RecordComputer {
  const handle = createRecordHandler();
  let nextId = 0;
  const call = async <T>(build: (id: number) => RecordWorkerRequest): Promise<T> => {
    const response = handle(build(nextId++));
    if (!response.ok) throw new Error(response.message);
    return response.value as T;
  };
  return {
    ranges: (input) => call((id) => ({ id, kind: 'ranges', input })),
    range: (input, rangeIndex) => call((id) => ({ id, kind: 'range', input, rangeIndex })),
    finish: (input, rangeIndex, typed, taps, meta, windowed) => call((id) => ({ id, kind: 'finish', input, rangeIndex, typed, taps, meta, windowed })),
  };
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
        : createWorkerComputer(new Worker(new URL('./record-worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike);
  }
  return instance;
}
