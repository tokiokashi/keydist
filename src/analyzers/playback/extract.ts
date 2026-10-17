import { defineSingleAnalyzer, type ExtractionAssets, type SingleAnalyzerDefinition, type SingleAnalyzerExtractContext } from '#analyzers/contract.ts';
import { plainDisciplineContext } from '#analyzers/discipline-material.ts';
import type { Geometry } from '#input/shapes/geometry.ts';
import type { AggregatedAnalysisResult } from '#interpretation/structure/aggregate.ts';
import type { PlaybackCalibration } from '#interpretation/timing/calibration.ts';
import type { Metrics } from '#interpretation/metrics.ts';
import {
  playbackOverheadUse,
  playbackRateChartData,
  playbackTimeTotals,
  type PlaybackOverheadUse,
  type PlaybackRateChartPoint,
  type PlaybackTimeTotals,
  type PlaybackTimingStep,
} from '#interpretation/timing/playback.ts';
import { planPunctuationWaits, type PunctuationWaitUse } from '#interpretation/timing/punctuation-wait.ts';
import { ALTERNATE_PLAYBACK_OPTIONS, DEFAULT_PLAYBACK_OPTIONS, playbackOptions, type PlaybackOptions } from './options.ts';
import { playbackScheduleOf } from './session.ts';
import {
  personalSpeedUseOf,
  playbackAssetsKeyOf,
  playbackTimingConditions,
  type PersonalSpeedUse,
  type PlaybackTimingConditions,
} from './timing-conditions.ts';

/**
 * 打鍵再生の抽出。再生は打鍵の列と構造解析の結果（Chain・Arpeggio・Redirect・遷移）を読んで
 * 1打鍵ずつ見せるだけなので、新しい指標は作らない。構造解析の結果をそのまま持つ。
 * 構造解析の条件（Chain・Arpeggioの数え方）は条件の実効値から解決済みで、`analysis.aggregate.conditions` に載っている。
 *
 * 再生の時間表と速度の推移は、同じ時間の設定（`timing`）から1回だけ組み立て、再生とグラフの両方がこの値を読む。
 */
export interface PlaybackExtracted {
  readonly analysis: AggregatedAnalysisResult;
  /** 先読みNかな。これから押すキーと入力の履歴の先読み幅に使う */
  readonly windowSize: number;
  /** 再生の時間を決める条件 */
  readonly timing: PlaybackTimingConditions;
  /** 部分の設定で項目を外す前の保存値。適用する設定の時だけ持つ。既定と違う部分の設定を示す判定に使う */
  readonly savedCalibration: PlaybackCalibration | undefined;
  /** 個人速度の扱い。適用する設定で保存値が無い（`missing`）時、再生のペインがそのことを知らせる */
  readonly personalSpeedUse: PersonalSpeedUse;
  /** 再生するステップの列に、0でない打鍵の上乗せ・同時押しの上乗せを入れるステップがあるか。「足している」旨を示す判定に使う */
  readonly overheadUse: PlaybackOverheadUse;
  /** 各ステップの開始・終了時刻（確定した時間表）。読点・句点の前後の待機を含む */
  readonly schedule: readonly PlaybackTimingStep[];
  /** 打鍵時間（待機を除く）と総時間（待機を含む）。テキスト全体の値 */
  readonly timeTotals: PlaybackTimeTotals;
  /** 読点・句点の前後の待機のうち、0でなく、テキストに足す位置がある項目。「既定と違う設定」の知らせの判定に使う */
  readonly waitUse: PunctuationWaitUse;
  /** 再生位置ごとの、かな毎秒・アクション毎秒の平均と、ChainとArpeggioの区間。先頭（位置0）を含む */
  readonly rateChart: readonly PlaybackRateChartPoint[];
  /**
   * 打鍵の列と構造解析の入力が同じなら同じ値になる識別子。平均方式などの解析設定を変えて抽出が
   * 作り直されても変わらないので、再生位置を保つかどうかの判定に使う
   */
  readonly basisId: string;
}

export function computePlaybackExtraction({
  analysis,
  metrics,
  geometry,
  options,
  assets,
  basisId,
  text,
}: {
  readonly analysis: AggregatedAnalysisResult;
  /** 評価に渡したテキスト。読み飛ばした読点・句点の位置を知るために読む */
  readonly text: string;
  readonly metrics: Metrics;
  readonly geometry: Geometry;
  readonly options: PlaybackOptions;
  readonly assets: ExtractionAssets;
  readonly basisId: string;
}): PlaybackExtracted {
  const timing = playbackTimingConditions(options, assets);
  const waitPlan = planPunctuationWaits(text, analysis.strokes, options, assets.textLanguage === 'ja');
  const schedule = playbackScheduleOf(analysis, geometry, timing, waitPlan.gapMs);
  const rateChart = playbackRateChartData(
    analysis,
    timing.stepsPerSecond,
    timing.sameFingerDelay,
    options.rateWindow,
    timing.calibration,
    timing.speedMultiplier,
    schedule,
    options.rateAverage,
    options.rateHalfLifeSeconds,
  );
  return {
    analysis,
    windowSize: metrics.conditions.windowSize,
    timing,
    overheadUse: playbackOverheadUse(analysis, timing.sameFingerDelay, timing.calibration),
    savedCalibration: options.applyPersonalSpeed ? assets.personalSpeed : undefined,
    personalSpeedUse: personalSpeedUseOf(options, assets),
    schedule,
    timeTotals: playbackTimeTotals(schedule, waitPlan.gapMs[waitPlan.gapMs.length - 1]),
    waitUse: waitPlan.use,
    rateChart,
    basisId,
  };
}

/** engine（`engine/cache.ts` の `getExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const playbackDefinition: SingleAnalyzerDefinition<PlaybackOptions, PlaybackExtracted> = defineSingleAnalyzer({
  id: 'playback',
  options: playbackOptions,
  assetsKeyOf: playbackAssetsKeyOf,
  extract(context: SingleAnalyzerExtractContext<PlaybackOptions>): PlaybackExtracted {
    return computePlaybackExtraction({
      analysis: context.analysis,
      text: context.text,
      metrics: context.metrics,
      geometry: context.geometry,
      options: context.options,
      assets: context.assets,
      basisId: context.basisId,
    });
  },
  optionsDiscipline: {
    sample: DEFAULT_PLAYBACK_OPTIONS,
    alternates: ALTERNATE_PLAYBACK_OPTIONS,
    context: plainDisciplineContext,
  },
});
