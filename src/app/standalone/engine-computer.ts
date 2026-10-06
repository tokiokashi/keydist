import type { SetAnalyzerDefinition, SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import { createEngineCache } from '#engine/cache.ts';
import type { EngineComputer } from '#engine/computer.ts';
import type { EngineSetMemberInput } from '#engine/request.ts';
import type { ResolvedInput } from '#engine/resolved-input.ts';
import { createWorkerEngineComputer, type WorkerLike } from '#engine/worker-client.ts';

/**
 * 単体ページが共有する計算の窓口。
 *
 * 長いテキストの計算（1万字で数秒〜十数秒）をメインスレッドで走らせると入力もスクロールも
 * 止まるので、ブラウザではWorkerへ逃がす。数値は変わらない（Workerの中でも同じ`EngineCache`が
 * 同じ純関数を呼び、メッセージは値の複製だけ）。`Worker`が無い環境（事前描画・古い実行環境）
 * では、従来どおりメインスレッドで計算する。
 *
 * 実体は最初の依頼が来た時に作る（事前描画はモジュールを読むだけで依頼を出さないため、
 * Workerを起動しない）。3つの単体ページで1つを共有するので、同じ条件のTraceは
 * ページを切り替えてもWorker内のキャッシュに当たる。
 */
let instance: EngineComputer | undefined;

function create(): EngineComputer {
  if (typeof Worker === 'undefined') return createEngineCache();
  // `new Worker(new URL(...))`の形はViteが静的に見つけて別チャンクにする。書き分けない。
  return createWorkerEngineComputer(
    () => new Worker(new URL('./engine-worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
  );
}

function computer(): EngineComputer {
  instance ??= create();
  return instance;
}

export const sharedEngineComputer: EngineComputer = {
  getTrace(input: ResolvedInput, signal?: AbortSignal) {
    return computer().getTrace(input, signal);
  },
  getExtraction<Options, Extracted>(
    input: ResolvedInput,
    definition: SingleAnalyzerDefinition<Options, Extracted>,
    options: Options,
    signal?: AbortSignal,
  ) {
    return computer().getExtraction(input, definition, options, signal);
  },
  getSetExtraction<Options, Extracted>(
    members: readonly EngineSetMemberInput[],
    definition: SetAnalyzerDefinition<Options, Extracted>,
    options: Options,
    signal?: AbortSignal,
  ) {
    return computer().getSetExtraction(members, definition, options, signal);
  },
  // 結果を引くだけで計算は始めない。実体（Worker）が未作成なら何も無いので、ここで作らない。
  peekTrace(input: ResolvedInput) {
    return instance?.peekTrace?.(input);
  },
  peekExtraction<Options, Extracted>(
    input: ResolvedInput,
    definition: SingleAnalyzerDefinition<Options, Extracted>,
    options: Options,
  ) {
    return instance?.peekExtraction?.(input, definition, options);
  },
  peekSetExtraction<Options, Extracted>(
    members: readonly EngineSetMemberInput[],
    definition: SetAnalyzerDefinition<Options, Extracted>,
    options: Options,
  ) {
    return instance?.peekSetExtraction?.(members, definition, options);
  },
};
