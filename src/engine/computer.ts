import type { SetAnalyzerDefinition, SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import type { EngineExtractionResult, EngineTraceSummaryResult } from './pipeline.ts';
import type { NgramTableSet } from '#interpretation/ngram-table-asset.ts';
import type { UserNgramTableRequest } from '#interpretation/user-ngram-table.ts';
import type { EngineSetMemberInput, MaybePromise } from './request.ts';
import type { ResolvedInput } from './resolved-input.ts';

/**
 * ペインが結果を求める窓口。
 *
 * `EngineCache`は同期の値を返すので、そのままこのインタフェースを満たす（`signal`は無視する）。
 * Workerへ計算を逃がす実装（`worker-client.ts`）は同じ形でPromiseを返し、`signal`が
 * 打ち切られたら走っている計算も止める。どちらを使っても、同じ入力から同じ値が返る
 * （計算の中身は同じ`pipeline.ts`の純関数で、送受信は構造化複製のみ）。
 *
 * `getInterpretation`はここに含めない。今ペインが使うのはTraceの要約（診断）と抽出だけで、
 * 解釈は抽出の内部で使われる。
 *
 * Traceそのものは返さない。打鍵の列は長いテキストで数百MBになり、Workerから複製して受け取るとメインスレッドが
 * 配列の数だけ抱えてしまう。打鍵の列を読む抽出は、必要な分を自分の結果に載せる。
 */
export interface EngineComputer {
  getTraceSummary(input: ResolvedInput, signal?: AbortSignal): MaybePromise<EngineTraceSummaryResult>;
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
  /**
   * 利用者のテキストの文節の読みの表を作る（`interpretation/user-ngram-table.ts`）。数え上げは長いテキストで時間がかかるので、
   * Workerへ逃がす実装ではWorkerの中で行う。同じ入力には同じ値を返す。
   */
  getNgramTable(request: UserNgramTableRequest, signal?: AbortSignal): MaybePromise<NgramTableSet>;

  /**
   * 計算済みの結果があれば、待たずに同期で返す（無ければ`undefined`。計算は始めない）。
   * Workerへ計算を逃がす実装は結果がメインスレッドに無く、依頼のたびにWorkerへ1往復する。
   * 往復の間、ペインは「計算中」を挟んでしまうので、同じ入力の結果を一度受け取っていれば
   * メインスレッド側で引けるようにする。同期の実装（`EngineCache`）は依頼がそのまま同期に返るので持たない。
   * 返す値は、同じ入力で`getTraceSummary`等が返す値と同じ（キーは`engine/keys.ts`の共通の入口）。
   */
  peekTraceSummary?(input: ResolvedInput): EngineTraceSummaryResult | undefined;
  peekExtraction?<Options, Extracted>(
    input: ResolvedInput,
    definition: SingleAnalyzerDefinition<Options, Extracted>,
    options: Options,
  ): EngineExtractionResult<Extracted> | undefined;
  peekNgramTable?(request: UserNgramTableRequest): NgramTableSet | undefined;
  peekSetExtraction?<Options, Extracted>(
    members: readonly EngineSetMemberInput[],
    definition: SetAnalyzerDefinition<Options, Extracted>,
    options: Options,
  ): EngineExtractionResult<Extracted> | undefined;
}
