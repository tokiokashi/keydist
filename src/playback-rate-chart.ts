import { escapeAttr, escapeText } from './chart.ts';
import type { PlaybackRateChartPoint } from './playback.ts';

type PlaybackDisplay = 'chain' | 'arpeggio' | 'both';

const WIDTH = 760;
const HEIGHT = 260;
const MARGIN = { top: 30, right: 18, bottom: 30, left: 54 };
const KANA_COLOR = 'var(--series-2)';
const ACTION_COLOR = 'var(--accent)';

function formatRate(value: number | undefined): string {
  return value === undefined ? '—' : value.toFixed(2);
}

function linePath(
  points: readonly PlaybackRateChartPoint[],
  valueOf: (point: PlaybackRateChartPoint) => number | undefined,
  xOf: (cursor: number) => number,
  yOf: (value: number) => number,
): string {
  return points
    .filter((point) => valueOf(point) !== undefined)
    .map((point, index) => {
      const value = valueOf(point)!;
      return `${index === 0 ? 'M' : 'L'}${xOf(point.cursor)},${yOf(value)}`;
    })
    .join(' ');
}

function tooltip(point: PlaybackRateChartPoint): string {
  const input = point.inputText === '' ? '—' : escapeText(point.inputText);
  return `ステップ ${point.cursor}<br>集計入力: <code>${input}</code><br>`
    + `<span style="color:${KANA_COLOR}">かな/秒</span> <b>${formatRate(point.kanaPerSecond)}</b><br>`
    + `<span style="color:${ACTION_COLOR}">アクション/秒</span> <b>${formatRate(point.actionsPerSecond)}</b>`;
}

/** 打鍵再生の直近速度を、カーソルごとのクリック可能な折れ線グラフへ描画する。 */
export function renderPlaybackRateChart(
  points: readonly PlaybackRateChartPoint[],
  display: PlaybackDisplay = 'both',
): string {
  const total = points.at(-1)?.cursor ?? 0;
  if (total === 0) return '<p class="playback-rate-chart-empty">打鍵データがありません。</p>';

  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xOf = (cursor: number) => MARGIN.left + (cursor / total) * plotWidth;
  const finiteValues = points.flatMap((point) => [point.kanaPerSecond, point.actionsPerSecond])
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  const yMax = Math.max(1, ...finiteValues) * 1.1;
  const yOf = (value: number) => MARGIN.top + (1 - value / yMax) * plotHeight;

  const grid = [0, 0.5, 1]
    .map((ratio) => {
      const value = yMax * ratio;
      const y = yOf(value);
      return `<line x1="${MARGIN.left}" y1="${y}" x2="${WIDTH - MARGIN.right}" y2="${y}" stroke="var(--line)"/>`
        + `<text x="${MARGIN.left - 8}" y="${y + 4}" text-anchor="end" font-size="11"`
        + ` fill="var(--muted)" font-variant-numeric="tabular-nums">${value.toFixed(1)}</text>`;
    })
    .join('');

  const kanaPath = linePath(points, (point) => point.kanaPerSecond, xOf, yOf);
  const actionPath = linePath(points, (point) => point.actionsPerSecond, xOf, yOf);
  const paths = `${kanaPath ? `<path d="${kanaPath}" fill="none" stroke="${KANA_COLOR}" stroke-width="2" stroke-linejoin="round"/>` : ''}`
    + `${actionPath ? `<path d="${actionPath}" fill="none" stroke="${ACTION_COLOR}" stroke-width="2" stroke-linejoin="round"/>` : ''}`;

  const band = (kind: 'chain' | 'arpeggio', color: string): string => {
    if (display !== 'both' && display !== kind) return '';
    return points
      .filter((point) => point[kind] === true)
      .map((point) => {
        const start = Math.max(0, point.cursor - 1);
        const x = xOf(start);
        const width = xOf(point.cursor) - x;
        return `<rect x="${x}" y="${MARGIN.top}" width="${width}" height="${plotHeight}" fill="${color}" opacity="0.10" pointer-events="none"/>`;
      })
      .join('');
  };
  const bands = band('chain', 'var(--series-2)') + band('arpeggio', 'var(--series-3)');

  const legend = `<g aria-label="凡例">`
    + `<line x1="${MARGIN.left}" y1="14" x2="${MARGIN.left + 18}" y2="14" stroke="${KANA_COLOR}" stroke-width="3"/>`
    + `<text x="${MARGIN.left + 24}" y="18" font-size="12" fill="var(--fg)">かな/秒</text>`
    + `<line x1="${MARGIN.left + 100}" y1="14" x2="${MARGIN.left + 118}" y2="14" stroke="${ACTION_COLOR}" stroke-width="3"/>`
    + `<text x="${MARGIN.left + 124}" y="18" font-size="12" fill="var(--fg)">アクション/秒</text>`
    + '</g>';

  const xTicks = [...new Set([0, Math.round(total / 2), total])];
  const xLabels = xTicks
    .map((cursor) => `<text x="${xOf(cursor)}" y="${HEIGHT - 8}" text-anchor="middle" font-size="11"`
      + ` fill="var(--muted)" font-variant-numeric="tabular-nums">${cursor}</text>`)
    .join('');

  const hitWidth = plotWidth / total;
  const hitAreas = points
    .map((point) => {
      const x = xOf(point.cursor);
      const left = point.cursor === 0 ? MARGIN.left : x - hitWidth / 2;
      const width = point.cursor === 0 || point.cursor === total ? hitWidth / 2 : hitWidth;
      return `<rect data-playback-rate-cursor="${point.cursor}" data-playback-rate-x="${x}"`
        + ` data-tip="${escapeAttr(tooltip(point))}" x="${left}" y="${MARGIN.top}" width="${width}"`
        + ` height="${plotHeight}" fill="transparent" pointer-events="all"/>`;
    })
    .join('');

  const markers = points
    .flatMap((point) => [
      point.kanaPerSecond === undefined ? '' : `<circle cx="${xOf(point.cursor)}" cy="${yOf(point.kanaPerSecond)}" r="2.5" fill="${KANA_COLOR}" pointer-events="none"/>`,
      point.actionsPerSecond === undefined ? '' : `<circle cx="${xOf(point.cursor)}" cy="${yOf(point.actionsPerSecond)}" r="2.5" fill="${ACTION_COLOR}" pointer-events="none"/>`,
    ])
    .join('');

  const currentLine = `<line data-playback-rate-cursor-line x1="${xOf(0)}" y1="${MARGIN.top}" x2="${xOf(0)}" y2="${HEIGHT - MARGIN.bottom}"`
    + ` stroke="var(--fg)" stroke-width="1.5" stroke-dasharray="3 3" pointer-events="none"/>`;
  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="かな毎秒とアクション毎秒の推移"`
    + ` data-playback-rate-total="${total}">${legend}${grid}${bands}${paths}${markers}${currentLine}${xLabels}${hitAreas}</svg>`;
}

/** 再生カーソルの変更を、再描画なしでグラフへ反映する。 */
export function updatePlaybackRateChartCursor(root: HTMLElement, cursor: number): void {
  const current = root.querySelector<SVGElement>('[data-playback-rate-current="true"]');
  current?.removeAttribute('data-playback-rate-current');
  const point = root.querySelector<SVGElement>(`[data-playback-rate-cursor="${CSS.escape(String(cursor))}"]`);
  if (!point) return;
  point.setAttribute('data-playback-rate-current', 'true');
  const line = root.querySelector<SVGLineElement>('[data-playback-rate-cursor-line]');
  const x = point.getAttribute('data-playback-rate-x');
  if (line && x !== null) {
    line.setAttribute('x1', x);
    line.setAttribute('x2', x);
  }
}
