import { escapeText } from './chart.ts';
import type { AnalyzerPlaybackDynamicDisplay } from './analyzer-playback-surface-model.ts';
import type { PlaybackRateChartPoint } from './playback.ts';

const KANA_COLOR = 'var(--series-2)';
const ACTION_COLOR = 'var(--accent)';

function formatRate(value: number | undefined): string {
  return value === undefined ? '—' : value.toFixed(2);
}

export function playbackRateTooltip(point: PlaybackRateChartPoint): string {
  const input = point.inputText === '' ? '—' : escapeText(point.inputText);
  return `ステップ ${point.cursor}<br>集計入力: <code>${input}</code><br>`
    + `<span style="color:${KANA_COLOR}">かな/秒</span> <b>${formatRate(point.kanaPerSecond)}</b><br>`
    + `<span style="color:${ACTION_COLOR}">アクション/秒</span> <b>${formatRate(point.actionsPerSecond)}</b>`;
}

export function playbackRateBandVisibility(
  display: AnalyzerPlaybackDynamicDisplay,
  point: PlaybackRateChartPoint,
): { chain: boolean; arpeggio: boolean } {
  return {
    chain: Boolean(point.chain) && (display === 'chain' || display === 'both'),
    arpeggio: Boolean(point.arpeggio) && (display === 'arpeggio' || display === 'both'),
  };
}
