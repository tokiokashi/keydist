import type { BandQuantityId } from '#interpretation/band-quantities.ts';
import { FIGURE_INSET, FONT_SIZE, INLINE_MIN_WIDTH, textWidth } from '../figure-text.ts';
import type { BandChartExtracted, BandChartOkRow, SkippedChar } from './extract.ts';
import { bandNoValueMessage } from './quantities.ts';

/**
 * 帯グラフの表示モデル（画面に依存しない純粋な関数）。
 * 抽出の行を対象の順に並べ、図の座標を決める。利用者が境目を選んだ時だけ、左端からその境目までの割合で行を並べ替える（`sortRows`）。
 * 順位や優劣は付けず、特定の配列の強調も持たない。
 * 座標の単位は画面のpxで、図は測った幅をそのままSVGの座標の幅にする（文字の大きさを幅で変えない）。
 */

/** 行の名前。ホストが集合に対して決めたもの。 */
export interface BandRowContext {
  readonly targetKey: string;
  readonly label: string;
  /** 集合によらない完全な名前。hover（`title`属性）に出す。 */
  readonly fullName: string;
}

/** 割合（0〜1）の表記。`digits`は小数の桁数。 */
export function percentText(share: number, digits: 0 | 1): string {
  return `${(share * 100).toFixed(digits)}%`;
}

export interface BandDisplayRow extends BandRowContext {
  readonly row: BandChartOkRow;
}

export interface BandExcludedRow extends BandRowContext {
  readonly status: 'computing' | 'failed' | 'no-value';
  readonly message: string;
}

export interface BandSkippedNote extends BandRowContext {
  readonly chars: readonly SkippedChar[];
}

export interface BandChartModel {
  /** 数えた量 */
  readonly quantity: BandQuantityId;
  /** 帯を描く行。対象の順。並べ替えを選んだ時は、境目までの割合の順 */
  readonly rows: readonly BandDisplayRow[];
  /** 帯を描けない行。対象の順 */
  readonly excluded: readonly BandExcludedRow[];
  /** 打てない文字がある配列。対象の順 */
  readonly skipped: readonly BandSkippedNote[];
  /** 評価に渡したテキストが基準の対象と違う配列。対象の順 */
  readonly differentText: readonly BandRowContext[];
  /** 評価に渡したテキストを比べる基準にした対象 */
  readonly reference: BandRowContext | undefined;
}

/** 並べ替えの指定。`boundary` は左端から数えた区分の数で、0は並べ替えない（対象の順のまま）。 */
export interface BandSort {
  readonly boundary: number;
  readonly direction: 'desc' | 'asc';
}

/** 割合が同じかを決める丸めの桁。足し算の誤差で同じ割合の行が入れ替わらないようにする。 */
const SORT_ROUND = 1e9;

/**
 * 左端から `boundary` 番目の区分までの割合の合計で行を並べる。
 * 割合が同じ行は対象の順のまま（安定）。割合の出せない行はここに来ない（`excluded` として別に並べ、並べ替えの対象外）。
 */
export function sortRows<Row extends { readonly row: BandChartOkRow }>(rows: readonly Row[], sort: BandSort): readonly Row[] {
  if (sort.boundary <= 0) return rows;
  const sign = sort.direction === 'desc' ? -1 : 1;
  const key = (row: Row) => Math.round(row.row.shares.slice(0, sort.boundary).reduce((sum, share) => sum + share, 0) * SORT_ROUND);
  return rows
    .map((row, index) => ({ row, index, key: key(row) }))
    .sort((a, b) => (a.key === b.key ? a.index - b.index : sign * (a.key - b.key)))
    .map((entry) => entry.row);
}

export const COMPUTING_MESSAGE = '計算中…';

export function bandChartModel(
  extracted: BandChartExtracted,
  order: readonly string[],
  rowContext: ReadonlyMap<string, BandRowContext>,
  sort?: BandSort,
): BandChartModel {
  const byKey = new Map(extracted.rows.map((row) => [row.targetKey, row] as const));
  const rows: BandDisplayRow[] = [];
  const excluded: BandExcludedRow[] = [];
  const skipped: BandSkippedNote[] = [];
  const differentText: BandRowContext[] = [];
  for (const targetKey of order) {
    const context: BandRowContext = {
      targetKey,
      label: rowContext.get(targetKey)?.label ?? '—',
      fullName: rowContext.get(targetKey)?.fullName ?? '',
    };
    const row = byKey.get(targetKey);
    if (row === undefined) {
      // extractedにまだ無いtargetKey（依頼の作り直し途中の一瞬）。値の欠落を偽らず、計算中と出す。
      excluded.push({ ...context, status: 'computing', message: COMPUTING_MESSAGE });
    } else if (row.kind === 'failed') {
      excluded.push({ ...context, status: 'failed', message: row.message });
    } else if (row.kind === 'no-value') {
      excluded.push({ ...context, status: 'no-value', message: bandNoValueMessage(extracted.quantity) });
      if (row.skippedChars.length > 0) skipped.push({ ...context, chars: row.skippedChars });
    } else {
      rows.push({ ...context, row });
      if (row.skippedChars.length > 0) skipped.push({ ...context, chars: row.skippedChars });
      if (!row.sameText) differentText.push(context);
    }
  }
  const referenceKey = extracted.referenceTargetKey;
  const reference =
    referenceKey === undefined
      ? undefined
      : { targetKey: referenceKey, label: rowContext.get(referenceKey)?.label ?? '—', fullName: rowContext.get(referenceKey)?.fullName ?? '' };
  return { quantity: extracted.quantity, rows: sort === undefined ? rows : sortRows(rows, sort), excluded, skipped, differentText, reference };
}

// ---------------------------------------------------------------------------
// 座標
// ---------------------------------------------------------------------------

/** 帯の中の割合の文字の大きさ [px]。 */
export const BAND_TEXT_SIZE = 11;
/** 帯の太さの上限 [px]。行が少ない時はこの太さで描く。 */
export const BAND_HEIGHT = 24;
/**
 * 帯の太さの下限 [px]。行が多くて収まらない時もここまでしか縮めず、これより先は図が下へ伸びる。
 * 隣の行との間隔の下限（`MIN_ROW_GAP`）と合わせて、名前の文字（12px）が隣の行と重ならない行の高さを残す。
 */
export const MIN_BAND_HEIGHT = 10;
/** 帯の中に割合を書ける最小の太さ [px]。割合の文字の高さに上下の余白を足した値。 */
const BAND_TEXT_MIN_HEIGHT = BAND_TEXT_SIZE + 4;
const INLINE_LABEL_MIN = 110;
const INLINE_LABEL_MAX = 200;
const INLINE_LABEL_GAP = 12;
/** 名前を帯の上に置く行で、名前の行の高さ。帯が細い時は名前の文字（12px）が入る高さまで縮める。 */
const STACKED_LABEL_HEIGHT = 18;
const STACKED_LABEL_HEIGHT_MIN = 14;
/** 行と行の間隔の下限 [px]。 */
const MIN_ROW_GAP = 4;
/** 図の上下の余白 [px]。 */
const FIGURE_PADDING = 2;

export interface BandRowGeometry {
  /** 名前の左端 */
  readonly labelX: number;
  /** 名前の中心の縦位置 */
  readonly labelY: number;
  /** 帯の上端 */
  readonly bandY: number;
  /** 行の上端と下端（行を押せる範囲） */
  readonly top: number;
  readonly bottom: number;
}

export interface BandLayout {
  /** 名前を帯の左に置くか（`inline`）、帯の上の行に置くか（`stacked`） */
  readonly mode: 'inline' | 'stacked';
  readonly width: number;
  readonly height: number;
  readonly bandX: number;
  readonly bandWidth: number;
  /** 帯の太さ */
  readonly bandHeight: number;
  /** 行を押せる範囲の高さ。次の行の押せる範囲に重ならない */
  readonly hitHeight: number;
  /** 名前に使える幅 */
  readonly labelWidth: number;
  readonly rows: readonly BandRowGeometry[];
}

interface RowMetrics {
  readonly mode: 'inline' | 'stacked';
  readonly bandHeight: number;
  /** 名前を帯の上に置く行の、名前の行の高さ。名前を帯の左に置く時は0 */
  readonly labelHeight: number;
  readonly gap: number;
  readonly pitch: number;
}

/** 帯の太さから、行の間隔と名前の行の高さを決める。太さが上限の時は、縮める前の値になる（隙間は名前を左に置く時10px、上に置く時12px）。 */
function rowMetrics(mode: 'inline' | 'stacked', bandHeight: number): RowMetrics {
  const labelHeight = mode === 'inline' ? 0 : bandHeight >= BAND_HEIGHT - 4 ? STACKED_LABEL_HEIGHT : STACKED_LABEL_HEIGHT_MIN;
  const gap = Math.max(MIN_ROW_GAP, Math.round((bandHeight * (mode === 'inline' ? 10 : 12)) / BAND_HEIGHT));
  return { mode, bandHeight, labelHeight, gap, pitch: labelHeight + bandHeight + gap };
}

function rowsHeight(metrics: RowMetrics, rowCount: number): number {
  return rowCount === 0 ? 0 : FIGURE_PADDING * 2 + rowCount * metrics.pitch - metrics.gap;
}

/**
 * 帯の行の配置。`maxHeight`を渡すと、行の全体がその高さに収まる最も太い帯で描く（上限は`BAND_HEIGHT`）。
 * 下限（`MIN_BAND_HEIGHT`）まで縮めても収まらない時は、下限の太さで描き、図は`maxHeight`を超えて伸びる。
 */
export function bandLayout(width: number, rowCount: number, maxHeight?: number): BandLayout {
  const mode = width >= INLINE_MIN_WIDTH ? 'inline' : 'stacked';
  let metrics = rowMetrics(mode, BAND_HEIGHT);
  if (maxHeight !== undefined) {
    for (let bandHeight = BAND_HEIGHT; bandHeight >= MIN_BAND_HEIGHT; bandHeight--) {
      metrics = rowMetrics(mode, bandHeight);
      if (rowsHeight(metrics, rowCount) <= maxHeight) break;
    }
  }
  const { bandHeight, labelHeight, pitch } = metrics;
  const labelWidth = mode === 'inline' ? Math.min(INLINE_LABEL_MAX, Math.max(INLINE_LABEL_MIN, Math.round(width * 0.3))) : width - FIGURE_INSET * 2;
  const bandX = mode === 'inline' ? FIGURE_INSET + labelWidth + INLINE_LABEL_GAP : FIGURE_INSET;
  const rows = Array.from({ length: rowCount }, (_, index): BandRowGeometry => {
    const top = FIGURE_PADDING + index * pitch;
    return mode === 'inline'
      ? { labelX: FIGURE_INSET, labelY: top + bandHeight / 2, bandY: top, top, bottom: top + pitch }
      : { labelX: FIGURE_INSET, labelY: top + labelHeight / 2, bandY: top + labelHeight, top, bottom: top + pitch };
  });
  return {
    mode,
    width,
    height: rowsHeight(metrics, rowCount),
    bandX,
    bandWidth: width - bandX - FIGURE_INSET,
    bandHeight,
    // 帯と名前の行に上下4pxの余白を足した範囲。隣の行との間隔は4px以上なので、押せる範囲は重ならない
    hitHeight: labelHeight + bandHeight + MIN_ROW_GAP,
    labelWidth,
    rows,
  };
}

export interface SegmentGeometry {
  readonly index: number;
  readonly x: number;
  readonly width: number;
  readonly share: number;
  /** 帯の中に割合を書くか。区分の幅か帯の太さが、文字の入らない狭さ・細さの時は書かない */
  readonly showText: boolean;
}

/** 区分の幅を、境目の位置の累積から求める（端数で隙間や重なりを作らない）。割合が0の区分は含めない。 */
export function segmentGeometries(
  shares: readonly number[],
  bandX: number,
  bandWidth: number,
  bandHeight: number = BAND_HEIGHT,
): readonly SegmentGeometry[] {
  const segments: SegmentGeometry[] = [];
  let cumulative = 0;
  shares.forEach((share, index) => {
    const start = bandX + cumulative * bandWidth;
    cumulative += share;
    const end = index === shares.length - 1 ? bandX + bandWidth : bandX + cumulative * bandWidth;
    const width = end - start;
    if (share <= 0 || width <= 0) return;
    segments.push({
      index,
      x: start,
      width,
      share,
      showText: bandHeight >= BAND_TEXT_MIN_HEIGHT && width >= textWidth(percentText(share, 0), BAND_TEXT_SIZE) + 8,
    });
  });
  return segments;
}

// ---------------------------------------------------------------------------
// 凡例
// ---------------------------------------------------------------------------

const LEGEND_SWATCH = 12;
const LEGEND_SWATCH_GAP = 6;
const LEGEND_ITEM_GAP = 16;
const LEGEND_ROW_HEIGHT = 20;

export interface LegendItem {
  readonly index: number;
  readonly label: string;
  readonly swatchX: number;
  readonly textX: number;
  /** 項目の中心の縦位置 */
  readonly y: number;
}

export interface LegendLayout {
  readonly width: number;
  readonly height: number;
  readonly swatch: number;
  readonly items: readonly LegendItem[];
}

/**
 * 凡例に出す区分の番号。表示している配列のどれかで数が0でない区分だけを、区分の順に返す。
 * 値を出せない行の配列は帯が無いので、判定に入れない（`rows` は帯を描く行だけ）。
 */
export function legendBandIndices(rows: readonly BandDisplayRow[], bandCount: number): readonly number[] {
  return Array.from({ length: bandCount }, (_, index) => index).filter((index) => rows.some((row) => row.row.counts[index]! > 0));
}

/** 凡例の項目（区分の名前）を左から並べ、幅に収まらなければ次の行へ折り返す。`indices` の区分だけを出し、色は区分の番号で決まる。 */
export function legendLayout(width: number, labels: readonly string[], indices: readonly number[] = labels.map((_, index) => index)): LegendLayout {
  const items: LegendItem[] = [];
  let x = FIGURE_INSET;
  let line = 0;
  indices.forEach((index) => {
    const label = labels[index]!;
    const itemWidth = LEGEND_SWATCH + LEGEND_SWATCH_GAP + textWidth(label, FONT_SIZE);
    if (x > FIGURE_INSET && x + itemWidth > width - FIGURE_INSET) {
      x = FIGURE_INSET;
      line++;
    }
    items.push({
      index,
      label,
      swatchX: x,
      textX: x + LEGEND_SWATCH + LEGEND_SWATCH_GAP,
      y: FIGURE_PADDING + line * LEGEND_ROW_HEIGHT + LEGEND_ROW_HEIGHT / 2,
    });
    x += itemWidth + LEGEND_ITEM_GAP;
  });
  return { width, height: FIGURE_PADDING * 2 + (line + 1) * LEGEND_ROW_HEIGHT, swatch: LEGEND_SWATCH, items };
}
