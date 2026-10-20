import type { ReadingToken } from './analyzer.ts';
import { DICTIONARY_SPEC } from './dictionary-spec.ts';
import type { DictionaryLocation, ReadingWorkerRequest, ReadingWorkerResponse } from './protocol.ts';

/** 読み込みの状態。呼び出し側は読み込み中と失敗を区別して画面に出す。 */
export type ReadingStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; source: 'cache' | 'network'; stored: boolean }
  | { state: 'error'; message: string };

export interface ReadingService {
  status(): ReadingStatus;
  subscribe(listener: () => void): () => void;
  /** wasmと辞書を読み込む。最初に呼ばれるまで通信しない。失敗した後に呼ぶと読み込み直す。 */
  load(): Promise<void>;
  /** テキストを語に分けて返す。まだ読み込んでいなければ先に読み込む。 */
  tokenize(text: string): Promise<ReadingToken[]>;
}

export interface WorkerLike {
  postMessage(message: ReadingWorkerRequest): void;
  terminate(): void;
  onmessage: ((event: { data: ReadingWorkerResponse }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}

export interface ReadingServiceOptions {
  /** 最初の `load` で呼ぶ。Workerを作れない環境では例外を投げてよい（読み込みの失敗として扱う）。 */
  createWorker: () => WorkerLike;
  dictionary: DictionaryLocation;
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

type Pending = { resolve: (response: ReadingWorkerResponse) => void; reject: (error: Error) => void };

/** 失敗の応答は例外にし、成功の応答は依頼と同じ種類のものだけを通す。 */
function expectResponse<Op extends 'load' | 'tokenize'>(response: ReadingWorkerResponse, op: Op): Extract<ReadingWorkerResponse, { ok: true; op: Op }> {
  if (!response.ok) throw new Error(response.message);
  if (response.op !== op) throw new Error('読みの解析の応答が想定と違う');
  return response as Extract<ReadingWorkerResponse, { ok: true; op: Op }>;
}

export function createReadingService(options: ReadingServiceOptions): ReadingService {
  let status: ReadingStatus = { state: 'idle' };
  const listeners = new Set<() => void>();
  let worker: WorkerLike | undefined;
  let loading: Promise<void> | undefined;
  let nextId = 0;
  const pending = new Map<number, Pending>();

  const setStatus = (next: ReadingStatus) => {
    status = next;
    for (const listener of [...listeners]) listener();
  };

  const failPending = (error: Error) => {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };

  const call = (request: DistributiveOmit<ReadingWorkerRequest, 'id'>, target: WorkerLike): Promise<ReadingWorkerResponse> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      target.postMessage({ ...request, id } as ReadingWorkerRequest);
    });

  const discardWorker = () => {
    worker?.terminate();
    worker = undefined;
    loading = undefined;
  };

  const start = async (): Promise<void> => {
    setStatus({ state: 'loading' });
    try {
      const created = options.createWorker();
      worker = created;
      created.onmessage = (event) => {
        const entry = pending.get(event.data.id);
        if (entry === undefined) return;
        pending.delete(event.data.id);
        entry.resolve(event.data);
      };
      created.onerror = (event) => failPending(new Error(event.message ?? '読みの解析を始められませんでした'));
      const response = await call({ op: 'load', dictionary: options.dictionary }, created);
      const loaded = expectResponse(response, 'load');
      setStatus({ state: 'ready', source: loaded.source, stored: loaded.stored });
    } catch (error) {
      discardWorker();
      setStatus({ state: 'error', message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };

  const load = (): Promise<void> => {
    loading ??= start();
    return loading;
  };

  return {
    status: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    async tokenize(text) {
      await load();
      const target = worker;
      if (target === undefined) throw new Error('読みの解析が終了している');
      const response = await call({ op: 'tokenize', text }, target);
      return expectResponse(response, 'tokenize').tokens;
    },
  };
}

/** 辞書のzipの公開URL。`base` は公開パス（`/` か `/keydist/`）。 */
export function dictionaryUrl(base: string): string {
  return `${base.endsWith('/') ? base : `${base}/`}${DICTIONARY_SPEC.fileName}`;
}

let shared: ReadingService | undefined;

/**
 * アプリ全体で共有する読みの解析の入口。
 * このモジュールを読み込んでも、`load` か `tokenize` が呼ばれるまでWorker・wasm・辞書は動かない。
 */
export function readingService(): ReadingService {
  shared ??= createReadingService({
    // `new Worker(new URL(...))` の形はViteが静的に見つけて別チャンクにする。書き分けない。
    createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
    dictionary: { url: dictionaryUrl(import.meta.env.BASE_URL), version: DICTIONARY_SPEC.version },
  });
  return shared;
}
