import { defineSingleAnalyzer, type SingleAnalyzerDefinition, type SingleAnalyzerExtractContext } from '#analyzers/contract.ts';
import { plainDisciplineContext } from '#analyzers/discipline-material.ts';
import { analyzeHandRhythm, type HandRhythmAggregate, type HandRhythmResult } from '#interpretation/structure/hand-rhythm.ts';
import { DEFAULT_HAND_RHYTHM_OPTIONS, handRhythmOptions, type HandRhythmOptions } from './options.ts';

/**
 * 左右の手の交互の抽出（仕様 §10.7）。
 *
 * 数の定義は `interpretation/structure/hand-rhythm.ts` が持つので、ここでは集計をそのまま運び、
 * 連続の長さごとの数を並べ直すだけにする。新しい数値の定義は作らない。
 */

/** 連続の長さ（打鍵数）とその長さの連続の数。長さの昇順。 */
export interface RunLengthCount {
  readonly length: number;
  readonly count: number;
}

export interface HandRhythmExtracted {
  /** `analyzeHandRhythm` の集計。値は加工しない */
  readonly aggregate: HandRhythmAggregate;
  /** 切り替え・同じ手の続き・両手を含む組の合計（分類できない組は含めない） */
  readonly pairCount: number;
  /** 交互打鍵の連続の長さごとの数。数の合計は `aggregate.alternation.runs` と一致する */
  readonly alternationLengths: readonly RunLengthCount[];
  /** 同じ手の連続（左右の手を合わせる）の長さごとの数。数の合計は同じ手の連続の数と一致する */
  readonly sameHandLengths: readonly RunLengthCount[];
}

/** 区間の長さを数えて、長さの昇順に並べる。 */
export function lengthCountsOf(runs: readonly { readonly startStrokeIndex: number; readonly endStrokeIndex: number }[]): RunLengthCount[] {
  const counts = new Map<number, number>();
  for (const run of runs) {
    const length = run.endStrokeIndex - run.startStrokeIndex;
    counts.set(length, (counts.get(length) ?? 0) + 1);
  }
  return [...counts].map(([length, count]) => ({ length, count })).sort((a, b) => a.length - b.length);
}

export function handRhythmExtractionOf(result: HandRhythmResult): HandRhythmExtracted {
  const { aggregate } = result;
  return {
    aggregate,
    pairCount: aggregate.switches + aggregate.continuations + aggregate.bothHandPairs,
    alternationLengths: lengthCountsOf(result.alternatingRuns),
    sameHandLengths: lengthCountsOf(result.sameHandRuns),
  };
}

/** 抽出の入力。解析設定は無い。 */
export type HandRhythmExtractInput = Pick<SingleAnalyzerExtractContext<HandRhythmOptions>, 'trace' | 'metrics'>;

export function computeHandRhythmExtraction({ trace, metrics }: HandRhythmExtractInput): HandRhythmExtracted {
  // 値は`Trace`だけで決まる。条件のスナップショットには、`Trace`を生成した時のPolicyを渡す。
  return handRhythmExtractionOf(
    analyzeHandRhythm(trace.strokes, metrics.conditions.triggerRealizationPolicy, metrics.conditions.actionRealizationPolicy),
  );
}

/** engine（`engine/cache.ts` の `getExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const handRhythmDefinition: SingleAnalyzerDefinition<HandRhythmOptions, HandRhythmExtracted> = defineSingleAnalyzer({
  id: 'hand-rhythm',
  options: handRhythmOptions,
  extract: computeHandRhythmExtraction,
  optionsDiscipline: {
    sample: DEFAULT_HAND_RHYTHM_OPTIONS,
    alternates: DEFAULT_HAND_RHYTHM_OPTIONS,
    context: plainDisciplineContext,
  },
});
