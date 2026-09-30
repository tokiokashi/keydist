import type { SetAnalyzerDefinition, SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import type { EngineExtractionResult, EngineTraceResult } from './pipeline.ts';
import type { EngineSetMemberInput, MaybePromise } from './request.ts';
import type { ResolvedInput } from './resolved-input.ts';

/**
 * ペインが結果を求める窓口（#544 §8-1「engineのAPIは非同期で、重くなったらWorkerへ移せる」）。
 *
 * `EngineCache`は同期の値を返すので、そのままこのインタフェースを満たす（`signal`は無視する）。
 * Workerへ計算を逃がす実装（`worker-client.ts`）は同じ形でPromiseを返し、`signal`が
 * 打ち切られたら走っている計算も止める。どちらを使っても、同じ入力から同じ値が返る
 * （計算の中身は同じ`pipeline.ts`の純関数で、送受信は構造化複製のみ）。
 *
 * `getInterpretation`はここに含めない。今ペインが使うのはTrace（図・診断）と抽出だけで、
 * 解釈は抽出の内部で使われる。
 */
export interface EngineComputer {
  getTrace(input: ResolvedInput, signal?: AbortSignal): MaybePromise<EngineTraceResult>;
  getExtraction<Options, Extracted>(
    input: ResolvedInput,
    definition: SingleAnalyzerDefinition<Options, Extracted>,
    options: Options,
    signal?: AbortSignal,
  ): MaybePromise<EngineExtractionResult<Extracted>>;
  getSetExtraction<Options, Extracted>(
    members: readonly EngineSetMemberInput[],
    definition: SetAnalyzerDefinition<Options, Extracted>,
    options: Options,
    signal?: AbortSignal,
  ): MaybePromise<EngineExtractionResult<Extracted>>;
}
