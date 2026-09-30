import type { SetAnalyzerDefinition } from '#analyzers/contract.ts';
import type { EngineComputer } from '#engine/computer.ts';
import { createSetExtractRequest, type ExtractionRequestState } from '#engine/engine-requests.ts';
import type { EngineRequestOptions, EngineSetMemberInput, EngineSetRequestChannel } from '#engine/request.ts';

/**
 * 集合対象のペイン1個ぶんの、engineへの依頼チャンネル（#544 Phase 3）。
 *
 * `analyzer-channels.ts`（単一対象）の集合版。単一対象と違い、集合対象では
 * Trace単体の依頼を別チャンネルで持たない: `Trace.errors`（配列定義の不備）は
 * メンバーごとに別々になりうるので、単一の`trace`チャンネルへ畳めない。
 * 各メンバーのTrace生成の不備は、抽出結果（`ComparisonExtracted`）側が
 * メンバーごとの失敗として運ぶのではなく、集合対象の`AnalyzerSetMember`には
 * まだ`Trace.errors`を運ぶ経路が無い（#544 Phase 3「決めきれなかった点」として
 * PR本文へ残す: 必要になったら`AnalyzerSetMember`へ`traceErrors`を足す）。
 */
export interface AnalyzerSetPaneChannels<Options> {
  readonly options: Options;
  readonly extraction: EngineSetRequestChannel;
}

export interface AnalyzerSetPaneChannelParams<Options, Extracted> {
  readonly cache: EngineComputer;
  readonly definition: SetAnalyzerDefinition<Options, Extracted>;
  readonly options: Options;
  readonly members: readonly EngineSetMemberInput[];
  readonly onExtraction: (state: ExtractionRequestState<Extracted>) => void;
  /** 既定は`microtaskScheduler`。テストで決定的に進めたい時に差し替える。 */
  readonly requestOptions?: EngineRequestOptions;
}

/**
 * `analyzer-channels.ts`の`syncAnalyzerPaneChannels`と同じ形: `options`の参照が変わった
 * 時だけチャンネルを作り直し、`members`は毎回`request()`する（`members`は呼び出し側
 * （Reactの副作用）が値が変わった時だけ新しい配列参照を作る前提）。
 */
export function syncAnalyzerSetPaneChannels<Options, Extracted>(
  current: AnalyzerSetPaneChannels<Options> | undefined,
  params: AnalyzerSetPaneChannelParams<Options, Extracted>,
): AnalyzerSetPaneChannels<Options> {
  if (current !== undefined && Object.is(current.options, params.options)) {
    current.extraction.request(params.members);
    return current;
  }

  current?.extraction.unsubscribe();
  const extraction = createSetExtractRequest(
    params.cache,
    params.definition,
    params.options,
    params.onExtraction,
    params.requestOptions,
  );
  extraction.request(params.members);
  return { options: params.options, extraction };
}

/** ペインが不要になった時（アンマウント・対象の作り直し）の後始末。 */
export function closeAnalyzerSetPaneChannels(channels: AnalyzerSetPaneChannels<unknown> | undefined): void {
  channels?.extraction.unsubscribe();
}
