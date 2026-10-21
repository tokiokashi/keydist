import type { Trace } from '#trace/generate.ts';
import { median, quantileNearestRank, segmentValues } from './segments.ts';
import { buildSpanIndex, type SpanIndex } from './span-metrics.ts';

/**
 * 文節の中の文字と、文節の境目の文字に分けた、距離の統計（定義は `docs/segment-metrics.md`「文節の中と境目の統計」）。
 * 距離モデルの値は変えない。`SpanIndex` が文字位置に帰属させた距離を、文字の種類で分けて集計し直すだけにする。
 *
 * 文字は評価に渡したテキストの文字位置 `p`（先頭が0）で数える。位置 `b` の区切りは文字 `b − 1` と文字 `b` の間を指し、
 * 文字 `b` が境目の文字になる。文節は隣り合う区切りの間（テキストの先頭と末尾を含む）の文字の並び。
 * `boundary-context.ts` の `boundaryInterior` とは、打鍵できなかった文字（`Trace.skipped`）を境目の文字にも内側の文字にも数えない点が違う。
 */

/** 上位の一覧の行数。 */
export const BUNSETSU_STATS_TOP_COUNT = 20;

/**
 * 打鍵できなかった文字の位置。`Trace.skippedPositions`（Trace生成が `skipped` を数えた時に記録した、評価に渡すテキストの文字位置）を、
 * 長さ `inputChars` の `1` と `0` の列にする。ローマ字配列では、一部の英字だけ打てたかなも入るので、数は `Trace.skipped` と一致するとは限らない。
 */
export function skippedPositionsOf(trace: Trace): Uint8Array {
  const skipped = new Uint8Array(trace.inputChars);
  for (const position of trace.skippedPositions) skipped[position] = 1;
  return skipped;
}

/** Traceから作る、文字位置ごとの索引と打鍵できなかった文字の位置。テキストと区切りによらないので、使い回せる。 */
export interface BunsetsuTraceBasis {
  readonly index: SpanIndex;
  readonly skipped: Uint8Array;
}

export function buildBunsetsuTraceBasis(trace: Trace): BunsetsuTraceBasis {
  return { index: buildSpanIndex(trace), skipped: skippedPositionsOf(trace) };
}

// ---------------------------------------------------------------------------
// テキストだけで決まる量
// ---------------------------------------------------------------------------

/** テキストと文節の区切りだけで決まる量（配列によらない）。 */
export interface BunsetsuTextTable {
  /** 評価に渡したテキストの文字数 */
  readonly charCount: number;
  /** 文節の数。テキストが空なら0 */
  readonly segmentCount: number;
  /** 境目の文字の数（区切りの数） */
  readonly boundaryChars: number;
  /** 境目の文字が全文字に占める割合。文字数が0なら `undefined` */
  readonly boundaryCharShare: number | undefined;
  /** またぐbigramの出現の数（区切りの数と同じ） */
  readonly crossCount: number;
  /** またぐbigramの出現のうち、同じ並びが文節の中にも1回以上出る並びの出現の数 */
  readonly crossAlsoInsideCount: number;
  /** `crossAlsoInsideCount / crossCount`。区切りが無ければ `undefined` */
  readonly crossAlsoInsideShare: number | undefined;
}

/** 頻出の文節の1行。文字列は評価に渡したテキストの上の文節。 */
export interface FrequentSegment {
  readonly text: string;
  readonly count: number;
}

/** 頻出のまたぐbigramの1行。 */
export interface FrequentBigram {
  /** 連続する2文字（文字 `p − 1` と `p`） */
  readonly pair: string;
  /** またいだ出現の数 */
  readonly crossCount: number;
  /** 文節の中の出現の数 */
  readonly insideCount: number;
}

/** 文節の文字列の出現。 */
interface SegmentOccurrences {
  /** 出現ごとの先頭の文字位置 */
  readonly starts: readonly number[];
  /** 文節の文字数 */
  readonly length: number;
}

/** 上位の一覧の行。行の文字列は、配列ごとの値を引く鍵になる。 */
export interface BunsetsuListRows {
  readonly segments: readonly FrequentSegment[];
  readonly bigrams: readonly FrequentBigram[];
}

export interface BunsetsuTextStructure extends BunsetsuListRows {
  readonly table: BunsetsuTextTable;
  /** 文字数2以上の文節の文字列ごとの出現（上位に限らない全部） */
  readonly segmentOccurrences: ReadonlyMap<string, SegmentOccurrences>;
  /** bigramの並びごとの、またいだ出現・文節の中の出現の2文字目の位置（上位に限らない全部） */
  readonly crossPositions: ReadonlyMap<string, readonly number[]>;
  readonly insidePositions: ReadonlyMap<string, readonly number[]>;
}

/** 出現回数の多い順に並べる。同じ回数は、`entries` に入れた順（最初に出た順）のまま。 */
function topByCount<T extends { readonly count: number }>(entries: readonly T[], limit: number): T[] {
  // Array.prototype.sortは安定
  return [...entries].sort((a, b) => b.count - a.count).slice(0, limit);
}

/**
 * 評価に渡したテキストの文字の列と文節の区切りから、テキストの表と、2つの上位の一覧の行を求める。
 * `bunsetsu` は評価に渡したテキストの文字位置の昇順の列（0とテキストの長さを含まない）。
 */
export function analyzeBunsetsuText(chars: readonly string[], bunsetsu: readonly number[]): BunsetsuTextStructure {
  const total = chars.length;
  const boundarySet = new Set(bunsetsu);

  // 文節の文字列ごとの出現。文字数1の文節は除く
  const segmentMap = new Map<string, { starts: number[]; length: number }>();
  if (total > 0) {
    let start = 0;
    for (let i = 0; i <= bunsetsu.length; i++) {
      const end = i < bunsetsu.length ? bunsetsu[i]! : total;
      if (end - start >= 2) {
        const text = chars.slice(start, end).join('');
        const known = segmentMap.get(text);
        if (known === undefined) segmentMap.set(text, { starts: [start], length: end - start });
        else known.starts.push(start);
      }
      start = end;
    }
  }
  const segments = topByCount(
    [...segmentMap].map(([text, entry]) => ({ text, count: entry.starts.length })),
    BUNSETSU_STATS_TOP_COUNT,
  );

  // bigramごとの出現。またぐ出現は最初にまたいだ順に並べる（Mapは挿入順）
  const crossMap = new Map<string, number[]>();
  const insideMap = new Map<string, number[]>();
  let crossCount = 0;
  for (let position = 1; position < total; position++) {
    const pair = chars[position - 1]! + chars[position]!;
    const cross = boundarySet.has(position);
    if (cross) crossCount++;
    const map = cross ? crossMap : insideMap;
    const known = map.get(pair);
    if (known === undefined) map.set(pair, [position]);
    else known.push(position);
  }
  let crossAlsoInsideCount = 0;
  for (const [pair, positions] of crossMap) if (insideMap.has(pair)) crossAlsoInsideCount += positions.length;
  const bigrams = topByCount(
    [...crossMap].map(([pair, positions]) => ({
      pair,
      count: positions.length,
      crossCount: positions.length,
      insideCount: insideMap.get(pair)?.length ?? 0,
    })),
    BUNSETSU_STATS_TOP_COUNT,
  );

  return {
    table: {
      charCount: total,
      segmentCount: total === 0 ? 0 : bunsetsu.length + 1,
      boundaryChars: bunsetsu.length,
      boundaryCharShare: total === 0 ? undefined : bunsetsu.length / total,
      crossCount,
      crossAlsoInsideCount,
      crossAlsoInsideShare: crossCount === 0 ? undefined : crossAlsoInsideCount / crossCount,
    },
    segments: segments.map(({ text, count }) => ({ text, count })),
    bigrams: bigrams.map(({ pair, crossCount, insideCount }) => ({ pair, crossCount, insideCount })),
    segmentOccurrences: segmentMap,
    crossPositions: crossMap,
    insidePositions: insideMap,
  };
}

// ---------------------------------------------------------------------------
// 配列ごとの量
// ---------------------------------------------------------------------------

/** 文字の集まりの、1文字あたりの距離と文字ごとの距離の標準偏差（母標準偏差）。 */
export interface CharDistanceSummary {
  /** 数えた文字の数（打鍵できなかった文字を除く） */
  readonly chars: number;
  /** 1文字あたりの距離 [u/文字]。文字が無ければ `undefined` */
  readonly perChar: number | undefined;
  /** 文字ごとの距離の標準偏差 [u]。文字が無ければ `undefined` */
  readonly deviation: number | undefined;
}

/** 1文節の距離（先頭の文字を含む、文節の文字に帰属する距離の和）の分布。 */
export interface SegmentDistanceSummary {
  readonly count: number;
  /** 母標準偏差 [u] */
  readonly deviation: number | undefined;
  /** 90%点（補間しない） [u] */
  readonly p90: number | undefined;
}

/** 文節ごとの1文字あたりの距離（先頭の文字を含み、打鍵できなかった文字も分母に数える）の分布。 */
export interface SegmentPerCharSummary {
  /** 値が決まった文節の数 */
  readonly count: number;
  readonly median: number | undefined;
  readonly p90: number | undefined;
}

/** 全文の距離を、文字の種類ごとに分けた和。 */
export interface DistanceParts {
  /** テキストの先頭の文字（打鍵できた時） */
  readonly first: number;
  readonly boundary: number;
  readonly interior: number;
  /** 打鍵できなかった文字。ステップが帰属しなければ0。ローマ字で一部だけ打てたかなには、打てた部分の距離が入る */
  readonly skipped: number;
  /** 全文の距離。4つの和に一致する */
  readonly total: number;
}

export interface BigramCell {
  /** またいだ出現の平均距離 [u/文字]（2文字目の文字に帰属する距離。打鍵できなかった文字を除く） */
  readonly cross: number | undefined;
  /** 文節の中の出現の平均距離。文節の中に出ない並びでは `undefined` */
  readonly inside: number | undefined;
}

export interface BunsetsuLayoutStats {
  /** 打鍵できなかった文字の数 */
  readonly skippedChars: number;
  /** 打鍵できなかった文字のうち、区切りの直後の1文字になったものの数 */
  readonly skippedAfterBoundary: number;
  readonly distanceParts: DistanceParts;
  /** 境目の文字に帰属する距離 / 全距離。全距離が0なら `undefined` */
  readonly boundaryDistanceShare: number | undefined;
  readonly boundary: CharDistanceSummary;
  readonly interior: CharDistanceSummary;
  readonly segmentDistance: SegmentDistanceSummary;
  readonly segmentPerChar: SegmentPerCharSummary;
  /** 頻出の文節の行ごとの、内側の文字（先頭の文字と打鍵できなかった文字を除く）の1文字あたりの距離。全出現を合わせた、距離の和 / 文字数の和 */
  readonly frequentSegmentCells: readonly (number | undefined)[];
  readonly frequentBigramCells: readonly BigramCell[];
}

function summarize(values: readonly number[]): CharDistanceSummary {
  if (values.length === 0) return { chars: 0, perChar: undefined, deviation: undefined };
  let sum = 0;
  for (const value of values) sum += value;
  const mean = sum / values.length;
  let squares = 0;
  for (const value of values) squares += (value - mean) ** 2;
  return { chars: values.length, perChar: mean, deviation: Math.sqrt(squares / values.length) };
}

function populationDeviation(values: readonly number[]): number | undefined {
  return summarize(values).deviation;
}

function meanAt(distanceAt: Float64Array, skipped: Uint8Array, positions: readonly number[]): number | undefined {
  let sum = 0;
  let count = 0;
  for (const position of positions) {
    if (skipped[position] === 1) continue;
    sum += distanceAt[position]!;
    count++;
  }
  return count === 0 ? undefined : sum / count;
}

/**
 * 配列（Trace）ごとの量。`bunsetsu` と `structure` は同じテキストから求めたものでなければならない。
 * 1文節の距離と、文節ごとの1文字あたりの距離は、打鍵できなかった文字を分母に数える（Run Chartの区間の値と同じ定義）。
 * 境目の文字と内側の文字の統計と、境目の距離の割合では、打鍵できなかった文字をどちらにも数えない。
 */
export function bunsetsuLayoutStats(
  basis: BunsetsuTraceBasis,
  bunsetsu: readonly number[],
  structure: BunsetsuTextStructure,
  rows: BunsetsuListRows = structure,
): BunsetsuLayoutStats {
  const { index, skipped } = basis;
  const total = index.inputChars;
  const boundarySet = new Set(bunsetsu);

  let skippedChars = 0;
  let skippedAfterBoundary = 0;
  const parts = { first: 0, boundary: 0, interior: 0, skipped: 0 };
  const boundaryValues: number[] = [];
  const interiorValues: number[] = [];
  for (let position = 0; position < total; position++) {
    const distance = index.distanceAt[position]!;
    const isBoundary = boundarySet.has(position);
    if (skipped[position] === 1) {
      skippedChars++;
      if (isBoundary) skippedAfterBoundary++;
      parts.skipped += distance;
    } else if (position === 0) {
      parts.first += distance;
    } else if (isBoundary) {
      parts.boundary += distance;
      boundaryValues.push(distance);
    } else {
      parts.interior += distance;
      interiorValues.push(distance);
    }
  }
  const wholeDistance = index.distanceUpTo[total]!;

  // 1文節の距離
  const segmentDistances: number[] = [];
  if (total > 0) {
    let start = 0;
    for (let i = 0; i <= bunsetsu.length; i++) {
      const end = i < bunsetsu.length ? bunsetsu[i]! : total;
      segmentDistances.push(index.distanceUpTo[end]! - index.distanceUpTo[start]!);
      start = end;
    }
  }
  const sortedSegmentDistances = Float64Array.from(segmentDistances).sort();
  const perChar = segmentValues(index, 'perCharUnits', bunsetsu);

  const frequentSegmentCells = rows.segments.map((row) => {
    const occurrences = structure.segmentOccurrences.get(row.text);
    if (occurrences === undefined) return undefined;
    let sum = 0;
    let count = 0;
    for (const start of occurrences.starts) {
      for (let position = start + 1; position < start + occurrences.length; position++) {
        if (skipped[position] === 1) continue;
        sum += index.distanceAt[position]!;
        count++;
      }
    }
    return count === 0 ? undefined : sum / count;
  });
  const frequentBigramCells = rows.bigrams.map(
    (row): BigramCell => ({
      cross: meanAt(index.distanceAt, skipped, structure.crossPositions.get(row.pair) ?? []),
      inside: meanAt(index.distanceAt, skipped, structure.insidePositions.get(row.pair) ?? []),
    }),
  );

  const boundary = summarize(boundaryValues);
  return {
    skippedChars,
    skippedAfterBoundary,
    distanceParts: { ...parts, total: wholeDistance },
    boundaryDistanceShare: wholeDistance === 0 ? undefined : parts.boundary / wholeDistance,
    boundary,
    interior: summarize(interiorValues),
    segmentDistance: {
      count: segmentDistances.length,
      deviation: populationDeviation(segmentDistances),
      p90: quantileNearestRank(sortedSegmentDistances, 0.9),
    },
    segmentPerChar: { count: perChar.length, median: median(perChar), p90: quantileNearestRank(perChar, 0.9) },
    frequentSegmentCells,
    frequentBigramCells,
  };
}
