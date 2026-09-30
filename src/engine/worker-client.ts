import type { SetAnalyzerDefinition, SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import type { EngineComputer } from './computer.ts';
import type { EngineExtractionResult, EngineTraceResult } from './pipeline.ts';
import type { EngineSetMemberInput } from './request.ts';
import type { ResolvedInput } from './resolved-input.ts';
import { LruCache } from './lru-cache.ts';
import { setExtractionKeyOf, singleExtractionKeyOf, traceKeyOf } from './keys.ts';
import type { EngineWorkerRequest, EngineWorkerResponse } from './worker-protocol.ts';

/**
 * ブラウザの`Worker`のうち、ここが使う部分だけ。Nodeのテストでは、メッセージを構造化複製して
 * `worker-handler.ts`へ渡す偽物に差し替える。
 */
export interface WorkerLike {
  postMessage(message: EngineWorkerRequest): void;
  terminate(): void;
  onmessage: ((event: { readonly data: EngineWorkerResponse }) => void) | null;
  onerror: ((event: { readonly message?: string }) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
}

/** メインスレッドに写しておく結果の最大件数（`engine/cache.ts`の既定と同じ）。 */
const MIRROR_MAX_ENTRIES = 32;

/** 常にPromiseを返す`EngineComputer`（`EngineComputer`は同期の値も許すので、こちらで狭める）。 */
export interface WorkerEngineComputer extends EngineComputer {
  getTrace(input: ResolvedInput, signal?: AbortSignal): Promise<EngineTraceResult>;
  getExtraction<Options, Extracted>(
    input: ResolvedInput,
    definition: SingleAnalyzerDefinition<Options, Extracted>,
    options: Options,
    signal?: AbortSignal,
  ): Promise<EngineExtractionResult<Extracted>>;
  getSetExtraction<Options, Extracted>(
    members: readonly EngineSetMemberInput[],
    definition: SetAnalyzerDefinition<Options, Extracted>,
    options: Options,
    signal?: AbortSignal,
  ): Promise<EngineExtractionResult<Extracted>>;
  /** Workerを止める。待ちと実行中の依頼は打ち切り扱いで拒否する。 */
  dispose(): void;
}

interface Job {
  readonly id: number;
  readonly build: (id: number) => EngineWorkerRequest;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
  readonly signal: AbortSignal | undefined;
  readonly onAbort: () => void;
}

function errorOf(response: Extract<EngineWorkerResponse, { ok: false }>): Error {
  const error = new Error(response.message);
  if (response.stack !== undefined) error.stack = response.stack;
  return error;
}

/** 打ち切られた依頼の拒否理由。依頼側は古い結果として捨てるので、画面には出ない。 */
export class EngineAbortError extends Error {
  constructor() {
    super('計算を打ち切りました');
    this.name = 'AbortError';
  }
}

/**
 * Workerへ計算を逃がす`EngineComputer`（#544 §8-1）。
 *
 * - **Workerには1度に1件だけ送る。** 待ちの依頼はここで持つ。Workerは同期の計算を最後まで
 *   走らせてからしかメッセージを読めないので、送ってしまった依頼は後から取り消せない。
 *   待ちのうちに打ち切られた依頼は、送らずに捨てる
 * - **走っている依頼が打ち切られたら、Workerを止めて立て直す。** 古い入力の計算（長いテキスト
 *   では数秒〜十数秒）が終わるまで新しい依頼を待たせないため。立て直すとWorker内の
 *   キャッシュは空になるが、入力が変わった後の計算は元々キャッシュに当たらない
 * - Traceと抽出を続けて頼む場合、1件ずつ順に送るので、後の依頼は先の依頼が積んだ
 *   Worker内のキャッシュに当たり、同じTraceを二度作らない
 */
export function createWorkerEngineComputer(spawn: () => WorkerLike): WorkerEngineComputer {
  // Workerから受け取った結果を、メインスレッドにも中身のキー（`engine/keys.ts`）で写しておく。
  // 一度計算した入力へ戻る時（タブの切り替え・配列の選び直し・ペインの作り直し）に、Workerへの
  // 1往復を挟まず`peek*`で同期に引き、ペインを「計算中」にしない。Workerの結果は値の複製なので、
  // ここで持つ値は`get*`が返した値そのもの（数値は変わらない）。件数は`EngineCache`と同じ規模。
  const traceMirror = new LruCache<string, EngineTraceResult>(MIRROR_MAX_ENTRIES);
  const extractionMirror = new LruCache<string, EngineExtractionResult<unknown>>(MIRROR_MAX_ENTRIES);
  let worker: WorkerLike | undefined;
  let current: Job | undefined;
  const queue: Job[] = [];
  let nextId = 1;

  function stopWorker(): void {
    const stopping = worker;
    worker = undefined;
    if (stopping === undefined) return;
    stopping.onmessage = null;
    stopping.onerror = null;
    stopping.onmessageerror = null;
    stopping.terminate();
  }

  function finish(job: Job, settle: () => void): void {
    job.signal?.removeEventListener('abort', job.onAbort);
    settle();
  }

  function attach(created: WorkerLike): WorkerLike {
    created.onmessage = (event) => {
      if (created !== worker || current === undefined || event.data.id !== current.id) return;
      const job = current;
      current = undefined;
      const response = event.data;
      finish(job, () => (response.ok ? job.resolve(response.value) : job.reject(errorOf(response))));
      pump();
    };
    const failCurrent = (message: string): void => {
      if (created !== worker) return;
      const job = current;
      current = undefined;
      stopWorker();
      if (job !== undefined) finish(job, () => job.reject(new Error(message)));
      pump();
    };
    created.onerror = (event) => failCurrent(event.message || '計算用のWorkerでエラーが起きました');
    created.onmessageerror = () => failCurrent('計算結果を受け取れませんでした');
    return created;
  }

  function pump(): void {
    while (current === undefined && queue.length > 0) {
      const job = queue.shift()!;
      try {
        if (worker === undefined) worker = attach(spawn());
        current = job;
        worker.postMessage(job.build(job.id));
      } catch (error) {
        current = undefined;
        stopWorker();
        finish(job, () => job.reject(error));
      }
    }
  }

  function enqueue<T>(build: (id: number) => EngineWorkerRequest, signal: AbortSignal | undefined): Promise<T> {
    if (signal?.aborted) return Promise.reject(new EngineAbortError());
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        id: nextId++,
        build,
        resolve: resolve as (value: unknown) => void,
        reject,
        signal,
        onAbort: () => {
          if (current === job) {
            // 走っている計算は止められないので、Workerごと止める。
            current = undefined;
            stopWorker();
            finish(job, () => reject(new EngineAbortError()));
            pump();
            return;
          }
          const index = queue.indexOf(job);
          if (index >= 0) queue.splice(index, 1);
          finish(job, () => reject(new EngineAbortError()));
        },
      };
      signal?.addEventListener('abort', job.onAbort, { once: true });
      queue.push(job);
      pump();
    });
  }

  /** 結果が届いたらミラーに積んでから返す。失敗（拒否）は積まない。 */
  function remember<T>(mirror: LruCache<string, T>, key: string, pending: Promise<T>): Promise<T> {
    return pending.then((value) => {
      mirror.set(key, value);
      return value;
    });
  }

  return {
    getTrace(input: ResolvedInput, signal?: AbortSignal): Promise<EngineTraceResult> {
      return remember(traceMirror, traceKeyOf(input), enqueue((id) => ({ id, kind: 'trace', input }), signal));
    },
    peekTrace(input: ResolvedInput): EngineTraceResult | undefined {
      return traceMirror.get(traceKeyOf(input));
    },
    peekExtraction<Options, Extracted>(
      input: ResolvedInput,
      definition: SingleAnalyzerDefinition<Options, Extracted>,
      options: Options,
    ): EngineExtractionResult<Extracted> | undefined {
      return extractionMirror.get(singleExtractionKeyOf(input, definition.id, definition.extractKeyOf(options))) as
        EngineExtractionResult<Extracted> | undefined;
    },
    peekSetExtraction<Options, Extracted>(
      members: readonly EngineSetMemberInput[],
      definition: SetAnalyzerDefinition<Options, Extracted>,
      options: Options,
    ): EngineExtractionResult<Extracted> | undefined {
      return extractionMirror.get(setExtractionKeyOf(members, definition.id, definition.extractKeyOf(options))) as
        EngineExtractionResult<Extracted> | undefined;
    },
    getExtraction<Options, Extracted>(
      input: ResolvedInput,
      definition: SingleAnalyzerDefinition<Options, Extracted>,
      options: Options,
      signal?: AbortSignal,
    ): Promise<EngineExtractionResult<Extracted>> {
      return remember(
        extractionMirror as LruCache<string, EngineExtractionResult<Extracted>>,
        singleExtractionKeyOf(input, definition.id, definition.extractKeyOf(options)),
        enqueue((id) => ({ id, kind: 'extraction', input, definitionId: definition.id, options }), signal),
      );
    },
    getSetExtraction<Options, Extracted>(
      members: readonly EngineSetMemberInput[],
      definition: SetAnalyzerDefinition<Options, Extracted>,
      options: Options,
      signal?: AbortSignal,
    ): Promise<EngineExtractionResult<Extracted>> {
      return remember(
        extractionMirror as LruCache<string, EngineExtractionResult<Extracted>>,
        setExtractionKeyOf(members, definition.id, definition.extractKeyOf(options)),
        enqueue((id) => ({ id, kind: 'set-extraction', members, definitionId: definition.id, options }), signal),
      );
    },
    dispose(): void {
      for (const job of queue.splice(0)) finish(job, () => job.reject(new EngineAbortError()));
      const running = current;
      current = undefined;
      stopWorker();
      if (running !== undefined) finish(running, () => running.reject(new EngineAbortError()));
    },
  };
}
