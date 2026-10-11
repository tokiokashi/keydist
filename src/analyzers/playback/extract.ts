import { defineSingleAnalyzer, type SingleAnalyzerDefinition, type SingleAnalyzerExtractContext } from '#analyzers/contract.ts';
import { plainDisciplineContext } from '#analyzers/discipline-material.ts';
import type { Geometry } from '#input/shapes/geometry.ts';
import type { AggregatedAnalysisResult } from '#interpretation/structure/aggregate.ts';
import type { Metrics } from '#interpretation/metrics.ts';
import {
  playbackRateChartData,
  type PlaybackRateChartPoint,
  type PlaybackRateConditions,
  type PlaybackTimingStep,
} from '#interpretation/timing/playback.ts';
import { ALTERNATE_PLAYBACK_OPTIONS, DEFAULT_PLAYBACK_OPTIONS, playbackOptions, type PlaybackOptions } from './options.ts';
import { playbackScheduleOf } from './session.ts';
import { playbackTimingConditions, type PlaybackTimingConditions } from './timing-conditions.ts';

/**
 * 打鍵再生の抽出。再生は打鍵の列と構造解析の結果（Chain・Arpeggio・Redirect・遷移）を読んで
 * 1打鍵ずつ見せるだけなので、新しい指標は作らない。構造解析の結果をそのまま持つ。
 * 構造解析の条件（Chain・Arpeggioの数え方）は条件の実効値から解決済みで、`analysis.aggregate.conditions` に載っている。
 *
 * 再生の時間表と速度の推移は、同じ時間の条件（`timing`）から1回だけ組み立て、再生とグラフの両方がこの値を読む。
 */
export interface PlaybackExtracted {
  readonly analysis: AggregatedAnalysisResult;
  /** 先読みN入力。これから押すキーと入力の履歴の先読み幅に使う */
  readonly windowSize: number;
  /** 再生の時間を決める条件 */
  readonly timing: PlaybackTimingConditions;
  /** 各ステップの開始・終了時刻（確定した時間表） */
  readonly schedule: readonly PlaybackTimingStep[];
  /** 再生位置ごとの、かな毎秒・アクション毎秒の平均と、ChainとArpeggioの区間。先頭（位置0）を含む */
  readonly rateChart: readonly PlaybackRateChartPoint[];
  /**
   * 打鍵の列と構造解析の入力が同じなら同じ値になる識別子。平均方式などの抽出だけの条件を変えて抽出が
   * 作り直されても変わらないので、再生位置を保つかどうかの判定に使う
   */
  readonly basisId: string;
}

export function computePlaybackExtraction({ analysis, metrics, geometry, timing, rateConditions, basisId }: {
  readonly analysis: AggregatedAnalysisResult;
  readonly metrics: Metrics;
  readonly geometry: Geometry;
  readonly timing: PlaybackTimingConditions;
  readonly rateConditions: PlaybackRateConditions;
  readonly basisId: string;
}): PlaybackExtracted {
  const schedule = playbackScheduleOf(analysis, geometry, timing);
  const rateChart = playbackRateChartData(
    analysis,
    timing.stepsPerSecond,
    timing.sameFingerDelay,
    rateConditions.window,
    timing.calibration,
    timing.speedMultiplier,
    schedule,
    rateConditions.average,
    rateConditions.halfLifeSeconds,
  );
  return { analysis, windowSize: metrics.conditions.windowSize, timing, schedule, rateChart, basisId };
}

/** engine（`engine/cache.ts` の `getExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const playbackDefinition: SingleAnalyzerDefinition<PlaybackOptions, PlaybackExtracted> = defineSingleAnalyzer({
  id: 'playback',
  options: playbackOptions,
  extract(context: SingleAnalyzerExtractContext<PlaybackOptions>): PlaybackExtracted {
    return computePlaybackExtraction({
      analysis: context.analysis,
      metrics: context.metrics,
      geometry: context.geometry,
      timing: playbackTimingConditions(),
      rateConditions: context.conditions.playbackRate,
      basisId: context.basisId,
    });
  },
  optionsDiscipline: {
    sample: DEFAULT_PLAYBACK_OPTIONS,
    alternates: ALTERNATE_PLAYBACK_OPTIONS,
    context: plainDisciplineContext,
  },
});
