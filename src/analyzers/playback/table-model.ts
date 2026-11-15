import type { TextLanguage } from '#input/text/language.ts';
import type { PlaybackRateChartPoint } from '#interpretation/timing/playback.ts';
import type { FigureTableModel } from '../figure-table.ts';
import { kanaUnitOf } from '../unit-words.ts';
import { formatRate, rateChartInBand, rateChartVisiblePoints, type RateChartDisplay, type RateChartSpan } from './rate-chart-model.ts';

/** 速度グラフの表の表題。切り替えのボタンの読み上げ名にも使う。 */
export function rateChartTableCaption(language: TextLanguage): string {
  return `${kanaUnitOf(language)}毎秒とアクション毎秒の推移`;
}

/**
 * 速度グラフの値の表。行は図が出している区間の点（`rateChartVisiblePoints`）で、再生位置の順に並べる。
 * 値は図の読み取り（`rateChartReadout`）と同じ`formatRate`で書く。
 * 帯を図に出している種類（`display`）だけ、その点が帯に入るかの列を付ける。
 */
export function rateChartTableModel(
  allPoints: readonly PlaybackRateChartPoint[],
  display: RateChartDisplay,
  language: TextLanguage,
  span?: RateChartSpan,
): FigureTableModel {
  const { start, points } = rateChartVisiblePoints(allPoints, span);
  const bands = (['chain', 'arpeggio'] as const).filter((kind) => display[kind]);
  return {
    caption: rateChartTableCaption(language),
    rowHeader: '再生位置',
    columns: ['集計入力', `${kanaUnitOf(language)}/秒`, 'アクション/秒', ...bands.map((kind) => (kind === 'chain' ? 'Chain' : 'Arpeggio'))],
    rows: points.map((point) => ({
      key: String(point.cursor),
      header: String(point.cursor),
      cells: [
        point.inputText === '' ? '—' : point.inputText,
        formatRate(point.kanaPerSecond),
        formatRate(point.actionsPerSecond),
        ...bands.map((kind) => (rateChartInBand(point, kind, start) ? '含む' : '—')),
      ],
    })),
  };
}
