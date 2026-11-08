import type { BandQuantityId } from '#interpretation/band-quantities.ts';
import { FIGURE_INSET, FONT_SIZE, INLINE_MIN_WIDTH, textWidth } from '../figure-text.ts';
import type { BandChartExtracted, BandChartOkRow, SkippedChar } from './extract.ts';
import { bandNoValueMessage } from './quantities.ts';

/**
 * 帯グラフの表示モデル（画面に依存しない純粋な関数）。
 * 抽出の行を対象の順に並べ、図の座標を決める。順位・並べ替え・特定の配列の強調は持たない。
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
  /** 帯を描く行。対象の順 */
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

export const COMPUTING_MESSAGE = '計算中…';

export function bandChartModel(extracted: BandChartExtracted, order: readonly string[], rowContext: ReadonlyMap<string, BandRowContext>): BandChartModel {
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
  return { quantity: extracted.quantity, rows, excluded, skipped, differentText, reference };
}

// ---------------------------------------------------------------------------
// 座標
// ---------------------------------------------------------------------------

/** 帯の中の割合の文字の大きさ [px]。 */
export const BAND_TEXT_SIZE = 11;
export const BAND_HEIGHT = 24;
const INLINE_LABEL_MIN = 110;
const INLINE_LABEL_MAX = 200;
const INLINE_LABEL_GAP = 12;
const INLINE_ROW_PITCH = BAND_HEIGHT + 10;
const STACKED_LABEL_HEIGHT = 18;
const STACKED_ROW_PITCH = STACKED_LABEL_HEIGHT + BAND_HEIGHT + 12;
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
  /** 名前に使える幅 */
  readonly labelWidth: number;
  readonly rows: readonly BandRowGeometry[];
}

export function bandLayout(width: number, rowCount: number): BandLayout {
  const mode = width >= INLINE_MIN_WIDTH ? 'inline' : 'stacked';
  const pitch = mode === 'inline' ? INLINE_ROW_PITCH : STACKED_ROW_PITCH;
  const labelWidth = mode === 'inline' ? Math.min(INLINE_LABEL_MAX, Math.max(INLINE_LABEL_MIN, Math.round(width * 0.3))) : width - FIGURE_INSET * 2;
  const bandX = mode === 'inline' ? FIGURE_INSET + labelWidth + INLINE_LABEL_GAP : FIGURE_INSET;
  const rows = Array.from({ length: rowCount }, (_, index): BandRowGeometry => {
    const top = FIGURE_PADDING + index * pitch;
    return mode === 'inline'
      ? { labelX: FIGURE_INSET, labelY: top + BAND_HEIGHT / 2, bandY: top, top, bottom: top + pitch }
      : { labelX: FIGURE_INSET, labelY: top + STACKED_LABEL_HEIGHT / 2, bandY: top + STACKED_LABEL_HEIGHT, top, bottom: top + pitch };
  });
  return {
    mode,
    width,
    height: rowCount === 0 ? 0 : FIGURE_PADDING * 2 + rowCount * pitch - (mode === 'inline' ? 10 : 12),
    bandX,
    bandWidth: width - bandX - FIGURE_INSET,
    labelWidth,
    rows,
  };
}

export interface SegmentGeometry {
  readonly index: number;
  readonly x: number;
  readonly width: number;
  readonly share: number;
  /** 帯の中に割合を書くか。区分の幅が文字の入らない狭さの時は書かない */
  readonly showText: boolean;
}

/** 区分の幅を、境目の位置の累積から求める（端数で隙間や重なりを作らない）。割合が0の区分は含めない。 */
export function segmentGeometries(shares: readonly number[], bandX: number, bandWidth: number): readonly SegmentGeometry[] {
  const segments: SegmentGeometry[] = [];
  let cumulative = 0;
  shares.forEach((share, index) => {
    const start = bandX + cumulative * bandWidth;
    cumulative += share;
    const end = index === shares.length - 1 ? bandX + bandWidth : bandX + cumulative * bandWidth;
    const width = end - start;
    if (share <= 0 || width <= 0) return;
    segments.push({ index, x: start, width, share, showText: width >= textWidth(percentText(share, 0), BAND_TEXT_SIZE) + 8 });
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

/** 凡例の項目（区分の名前）を左から並べ、幅に収まらなければ次の行へ折り返す。 */
export function legendLayout(width: number, labels: readonly string[]): LegendLayout {
  const items: LegendItem[] = [];
  let x = FIGURE_INSET;
  let line = 0;
  labels.forEach((label, index) => {
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
