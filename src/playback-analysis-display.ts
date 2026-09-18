import { resolveKeyId, type Finger } from './geometry.ts';
import type { Stroke } from './evaluate.ts';
import type { AggregatedAnalysisResult } from './analysis-aggregate.ts';
import type { PlaybackKeyMotion } from './playback.ts';

type Hand = 'left' | 'right';

export interface PlaybackOrderSpan {
  readonly sourceIndex: number;
  readonly orders: ReadonlyMap<string, number>;
}

export interface PlaybackRedirectWindow {
  readonly redirectIndex: number;
  readonly startStrokeIndex: number;
  readonly endStrokeIndex: number;
  readonly pivotStrokeIndex: number;
}

function activeStrokeIndex(strokes: readonly Stroke[], cursor: number): number | undefined {
  const index = Math.min(Math.max(0, cursor), strokes.length) - 1;
  return index >= 0 ? index : undefined;
}

function participationKeys(
  stroke: Stroke,
  hand: Hand,
  outputOnly: boolean,
  excludeThumb = false,
): string[] {
  return stroke.participations
    .filter((participation) =>
      participation.hand === hand
      && (!outputOnly || participation.roles.includes('output'))
      && (!excludeThumb || (participation.finger !== 'LT' && participation.finger !== 'RT')))
    .flatMap((participation) => participation.keys.map((key) => resolveKeyId(key.id)));
}

function participationFinger(
  stroke: Stroke,
  hand: Hand,
  outputOnly: boolean,
  excludeThumb = false,
): Finger | undefined {
  return stroke.participations.find((participation) =>
    participation.hand === hand
    && (!outputOnly || participation.roles.includes('output'))
    && (!excludeThumb || (participation.finger !== 'LT' && participation.finger !== 'RT')))?.finger;
}

function ordersForRange(
  strokes: readonly Stroke[],
  hand: Hand,
  startStrokeIndex: number,
  endStrokeIndex: number,
  cursor: number,
  outputOnly: boolean,
  excludeThumb = false,
): ReadonlyMap<string, number> {
  const active = activeStrokeIndex(strokes, cursor);
  const orders = new Map<string, number>();
  if (active === undefined || active < startStrokeIndex || active >= endStrokeIndex) return orders;

  const visits = new Map<string, number[]>();
  for (let index = startStrokeIndex; index < endStrokeIndex; index++) {
    const order = index - startStrokeIndex + 1;
    for (const key of participationKeys(strokes[index], hand, outputOnly, excludeThumb)) {
      const seen = visits.get(key);
      if (!seen) visits.set(key, [order]);
      else if (seen[seen.length - 1] !== order) seen.push(order);
    }
  }

  const position = active - startStrokeIndex + 1;
  for (const [key, list] of visits) {
    orders.set(key, list.find((order) => order >= position) ?? list[list.length - 1]);
  }
  return orders;
}

/**
 * Analysis Chainを盤面表示へ投影する。Chain成立判定は一切行わない。
 */
export function playbackAnalysisChainOrders(
  analysis: AggregatedAnalysisResult,
  cursor: number,
): readonly PlaybackOrderSpan[] {
  return analysis.chains.flatMap((chain) => {
    const orders = ordersForRange(
      analysis.strokes,
      chain.hand,
      chain.startStrokeIndex,
      chain.endStrokeIndex,
      cursor,
      false,
      true,
    );
    return orders.size === 0 ? [] : [{ sourceIndex: chain.chainIndex, orders }];
  });
}

/**
 * ArpeggioSpanを個別のまま盤面表示へ投影する。
 * overlap / adjacent Spanをここで結合しない。
 */
export function playbackAnalysisArpeggioOrders(
  analysis: AggregatedAnalysisResult,
  cursor: number,
): readonly PlaybackOrderSpan[] {
  return analysis.arpeggioSpans.flatMap((span, sourceIndex) => {
    const orders = ordersForRange(
      analysis.strokes,
      span.hand,
      span.startStrokeIndex,
      span.endStrokeIndex,
      cursor,
      true,
    );
    return orders.size === 0 ? [] : [{ sourceIndex, orders }];
  });
}

function motionForRange(
  strokes: readonly Stroke[],
  hand: Hand,
  startStrokeIndex: number,
  endStrokeIndex: number,
  cursor: number,
  outputOnly: boolean,
  excludeThumb = false,
): PlaybackKeyMotion[] {
  const index = activeStrokeIndex(strokes, cursor);
  if (index === undefined || index <= startStrokeIndex || index >= endStrokeIndex) return [];
  const toKeys = participationKeys(strokes[index], hand, outputOnly, excludeThumb);
  const fromKeys = participationKeys(strokes[index - 1], hand, outputOnly, excludeThumb);
  const finger = participationFinger(strokes[index], hand, outputOnly, excludeThumb);
  return finger && fromKeys.length > 0 && toKeys.length > 0
    ? [{ fromKey: fromKeys[0], toKeys, finger }]
    : [];
}

export function playbackAnalysisChainMotions(
  analysis: AggregatedAnalysisResult,
  cursor: number,
): readonly PlaybackKeyMotion[] {
  return analysis.chains.flatMap((chain) =>
    motionForRange(
      analysis.strokes,
      chain.hand,
      chain.startStrokeIndex,
      chain.endStrokeIndex,
      cursor,
      false,
      true,
    ));
}

export function playbackAnalysisArpeggioMotions(
  analysis: AggregatedAnalysisResult,
  cursor: number,
): readonly PlaybackKeyMotion[] {
  return analysis.arpeggioSpans.flatMap((span) =>
    motionForRange(
      analysis.strokes,
      span.hand,
      span.startStrokeIndex,
      span.endStrokeIndex,
      cursor,
      true,
    ));
}

/** RedirectEventを3 Stroke windowとして表示用に参照する。 */
export function playbackRedirectWindows(
  analysis: AggregatedAnalysisResult,
  cursor: number,
): readonly PlaybackRedirectWindow[] {
  const active = activeStrokeIndex(analysis.strokes, cursor);
  if (active === undefined) return [];
  return analysis.redirects.flatMap((redirect) =>
    active >= redirect.pivotStrokeIndex - 1 && active <= redirect.pivotStrokeIndex + 1
      ? [{
        redirectIndex: redirect.redirectIndex,
        startStrokeIndex: redirect.pivotStrokeIndex - 1,
        endStrokeIndex: redirect.pivotStrokeIndex + 2,
        pivotStrokeIndex: redirect.pivotStrokeIndex,
      }]
      : []);
}

export function playbackStrokeAnnotation(
  analysis: AggregatedAnalysisResult,
  cursor: number,
) {
  const active = activeStrokeIndex(analysis.strokes, cursor);
  return active === undefined ? undefined : analysis.annotations[active];
}
