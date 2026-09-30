import type { SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import type { EngineComputer } from '#engine/computer.ts';
import {
  createExtractRequest,
  createTraceRequest,
  type ExtractionRequestState,
  type TraceRequestState,
} from '#engine/engine-requests.ts';
import type { EngineRequestChannel, EngineRequestOptions } from '#engine/request.ts';
import type { ResolvedInputResult } from '#engine/resolved-input.ts';

/**
 * ペイン1個ぶんの、engineへの依頼チャンネル一式（抽出 + Trace単体）。
 *
 * Traceを別途購読するのは、`ExtractionRequestState`（`engine/cache.ts`の`getExtraction`が
 * 返す`EngineExtractionResult`）が抽出結果（`extracted`）しか持たず、`Trace.errors`
 * （配列定義の不備。#544 §8-5「Traceのerrorsは値としてペインに表示する」）を含まない
 * ため。Traceは`EngineComputer`の中で抽出と同じキャッシュを共有するので、二重に計算は走らない
 * （`engine/cache.ts`の`getExtraction`が内部で`getTrace`を呼ぶのと同じキャッシュ）。
 */
export interface AnalyzerPaneChannels<Options> {
  readonly options: Options;
  readonly extraction: EngineRequestChannel;
  readonly trace: EngineRequestChannel;
}

export interface AnalyzerPaneChannelParams<Options, Extracted> {
  readonly cache: EngineComputer;
  readonly definition: SingleAnalyzerDefinition<Options, Extracted>;
  readonly options: Options;
  readonly resolution: ResolvedInputResult;
  readonly onExtraction: (state: ExtractionRequestState<Extracted>) => void;
  readonly onTrace: (state: TraceRequestState) => void;
  /** 既定は`microtaskScheduler`。テストで決定的に進めたい時に差し替える。 */
  readonly requestOptions?: EngineRequestOptions;
}

/**
 * 抽出とTraceの2つの依頼チャンネルを同期する（#544 §7「解析設定は抽出に効くものと
 * 見た目だけのものを宣言する。見た目だけの変更では抽出を走らせない」の配線）。
 *
 * - `options`の参照が変わった時だけ抽出チャンネルを作り直す。作り直しても
 *   `definition.extract`が実際に再実行されるかどうかは`EngineComputer.getExtraction`が
 *   `definition.extractKeyOf(options)`で決めるので、見た目だけの項目が変わって
 *   `extractKeyOf`の値が変わらなければ、チャンネルを作り直してもキャッシュが当たり
 *   `extract`は呼ばれない（`analyzer-channels.test.ts`で確認する）。ここでは
 *   「optionsが変わるたびに購読し直す」という素直な配線だけを担う
 * - Traceチャンネルは`options`に依存しないので、`resolution`が変わった時だけ
 *   同じチャンネルへ`request`し直す（作り直さない）
 * - 呼び出し側（Reactの副作用）が`current`（前回の戻り値）をそのまま次回へ渡し続ける
 *   ことで、チャンネルの生成・破棄がReactのレンダーと無関係に1本ずつ保たれる
 */
export function syncAnalyzerPaneChannels<Options, Extracted>(
  current: AnalyzerPaneChannels<Options> | undefined,
  params: AnalyzerPaneChannelParams<Options, Extracted>,
): AnalyzerPaneChannels<Options> {
  const trace = current?.trace
    ?? createTraceRequest(params.cache, params.onTrace, params.requestOptions);
  trace.request(params.resolution);

  if (current !== undefined && Object.is(current.options, params.options)) {
    current.extraction.request(params.resolution);
    return { options: current.options, extraction: current.extraction, trace };
  }

  current?.extraction.unsubscribe();
  const extraction = createExtractRequest(
    params.cache,
    params.definition,
    params.options,
    params.onExtraction,
    params.requestOptions,
  );
  extraction.request(params.resolution);
  return { options: params.options, extraction, trace };
}

/** ペインが不要になった時（アンマウント・対象の切り替えで作り直す時）の後始末。 */
export function closeAnalyzerPaneChannels(
  channels: AnalyzerPaneChannels<unknown> | undefined,
): void {
  channels?.extraction.unsubscribe();
  channels?.trace.unsubscribe();
}

/**
 * 抽出の状態の遷移を畳む。解析設定の変更で抽出の依頼を作り直すと、最初の通知は値の無い
 * `computing`になる。そのまま本体を外すと、本体が持つ状態（図のそばで開いた表示の調整）が、
 * 抽出に効く項目を動かすたびに閉じてしまう。直前の結果があれば`stale`（直前の結果を表示）に
 * 置き換えて、本体を残す。
 */
export function foldExtractionState<Extracted>(
  previous: ExtractionRequestState<Extracted>,
  next: ExtractionRequestState<Extracted>,
): ExtractionRequestState<Extracted> {
  return next.status === 'computing' && (previous.status === 'ready' || previous.status === 'stale')
    ? { status: 'stale', value: previous.value }
    : next;
}
