import type { SegmentPerCharBox } from '#interpretation/bunsetsu-stats.ts';
import { formatTickValue, multiple, niceTicks } from '../axis-ticks.ts';
import { FIGURE_INSET, INLINE_MIN_WIDTH } from '../figure-text.ts';
import type { ScaleRange } from '../shared-scale.ts';
import type { BoxPlotExtracted, BoxPlotOkRow } from './extract.ts';

/**
 * 箱ひげ図の表示モデル（画面に依存しない純粋な関数）。
 * 抽出の行を対象の順に並べ、目盛りと図の座標を決める。順位・並べ替え・特定の配列の強調・基準の線は持たない。
 * 座標の単位は画面のpxで、図は測った幅をそのままSVGの座標の幅にする（文字の大きさを幅で変えない）。
 */

/** 行の名前。ホストが集合に対して決めたもの。 */
export interface BoxRowContext {
  readonly targetKey: string;
  readonly label: string;
  /** 集合によらない完全な名前。hover（`title`属性）に出す。 */
  readonly fullName: string;
}

export interface BoxDisplayRow extends BoxRowContext {
  readonly row: BoxPlotOkRow;
}

export interface BoxExcludedRow extends BoxRowContext {
  readonly status: 'computing' | 'failed' | 'no-value' | 'no-segmentation';
  readonly message: string;
}

/** 文節の数の示し方。全配列で同じテキストと区切りなら1つ、違う配列があれば配列ごと。 */
export type SegmentCountNote =
  | { readonly kind: 'shared'; readonly count: number }
  | { readonly kind: 'per-row'; readonly entries: readonly (BoxRowContext & { readonly count: number })[] };

export interface BoxPlotModel {
  /** 箱を描く行。対象の順 */
  readonly rows: readonly BoxDisplayRow[];
  /** 箱を描けない行。対象の順 */
  readonly excluded: readonly BoxExcludedRow[];
  /** 評価に渡したテキストまたは区切りが基準の対象と違う配列。対象の順 */
  readonly differentText: readonly BoxRowContext[];
  /** テキストと区切りを比べる基準にした対象 */
  readonly reference: BoxRowContext | undefined;
  /** 文節の数。箱を描く行が無ければ `undefined` */
  readonly segmentCounts: SegmentCountNote | undefined;
}

export const NO_VALUE_MESSAGE = '値を出せる文節がありません';
export const NO_SEGMENTATION_MESSAGE = '文節の区切りがないので、値を出しません。';
export const COMPUTING_MESSAGE = '計算中…';

export function boxPlotModel(extracted: BoxPlotExtracted, order: readonly string[], rowContext: ReadonlyMap<string, BoxRowContext>): BoxPlotModel {
  const byKey = new Map(extracted.rows.map((row) => [row.targetKey, row] as const));
  const contextOf = (targetKey: string): BoxRowContext => ({
    targetKey,
    label: rowContext.get(targetKey)?.label ?? '—',
    fullName: rowContext.get(targetKey)?.fullName ?? '',
  });
  const rows: BoxDisplayRow[] = [];
  const excluded: BoxExcludedRow[] = [];
  const differentText: BoxRowContext[] = [];
  for (const targetKey of order) {
    const context = contextOf(targetKey);
    const row = byKey.get(targetKey);
    if (row === undefined) {
      // extractedにまだ無いtargetKey（依頼の作り直し途中の一瞬）。値の欠落を偽らず、計算中と出す。
      excluded.push({ ...context, status: 'computing', message: COMPUTING_MESSAGE });
    } else if (row.kind === 'failed') {
      excluded.push({ ...context, status: 'failed', message: row.message });
    } else if (row.kind === 'no-segmentation') {
      excluded.push({ ...context, status: 'no-segmentation', message: NO_SEGMENTATION_MESSAGE });
    } else if (row.kind === 'no-value') {
      excluded.push({ ...context, status: 'no-value', message: NO_VALUE_MESSAGE });
    } else {
      rows.push({ ...context, row });
      if (!row.sameText) differentText.push(context);
    }
  }
  let segmentCounts: SegmentCountNote | undefined;
  if (rows.length > 0) {
    segmentCounts =
      differentText.length === 0
        ? { kind: 'shared', count: rows[0]!.row.box.count }
        : {
            kind: 'per-row',
            entries: rows.map((row) => ({ targetKey: row.targetKey, label: row.label, fullName: row.fullName, count: row.row.box.count })),
          };
  }
  const referenceKey = extracted.referenceTargetKey;
  return { rows, excluded, differentText, reference: referenceKey === undefined ? undefined : contextOf(referenceKey), segmentCounts };
}

// ---------------------------------------------------------------------------
// 目盛り
// ---------------------------------------------------------------------------

/** ペインどうしで目盛りを揃えるキー（`docs/architecture.md`「ペインどうしで揃える目盛り」）。見る量は1つだけ。 */
export const BOX_PLOT_SCALE_KEY = 'box-plot:segment-per-char';

/** 目盛りの目標の本数。 */
const TICK_TARGET = 5;

/** このペインの箱が占める範囲。0から、ひげの上端の最大まで。箱を描く行が無ければ `undefined`（他のペインの範囲を広げない）。 */
export function boxOwnRange(rows: readonly BoxDisplayRow[]): ScaleRange | undefined {
  if (rows.length === 0) return undefined;
  let max = 0;
  for (const { row } of rows) max = Math.max(max, row.box.upperWhisker);
  return { min: 0, max };
}

export interface BoxTick {
  readonly value: number;
  readonly text: string;
}

export interface BoxAxis {
  /** 軸の右端の値。左端は0 */
  readonly max: number;
  readonly ticks: readonly BoxTick[];
}

/**
 * 距離の目盛り。0から始め、右端は`max`を含む最小の目盛りの値にする（枠の右端に目盛りが来る）。
 * 全ペインで揃えた範囲の最大を渡せば、ペインどうしで同じ目盛りになる。
 */
export function boxAxis(max: number): BoxAxis {
  const top = max > 0 && Number.isFinite(max) ? max : 1;
  const { step } = niceTicks({ lo: 0, hi: top }, TICK_TARGET);
  const count = Math.ceil(top / step - 1e-9);
  const ticks = Array.from({ length: count + 1 }, (_, index) => multiple(index, step));
  return { max: ticks[count]!, ticks: ticks.map((value) => ({ value, text: formatTickValue(value, step) })) };
}

// ---------------------------------------------------------------------------
// 座標
// ---------------------------------------------------------------------------

/** 箱の高さ [px]。 */
export const BOX_HEIGHT = 16;
/** ひげの端の縦線の高さ [px]。 */
export const WHISKER_CAP_HEIGHT = 8;
/** 図の目盛りの数字・軸の名前の文字の大きさ [px]。散布図と同じ。 */
export const AXIS_FONT_SIZE = 11;

const INLINE_LABEL_MIN = 110;
const INLINE_LABEL_MAX = 200;
const INLINE_LABEL_GAP = 12;
const INLINE_PITCH = 30;
const STACKED_LABEL_HEIGHT = 16;
const STACKED_PADDING = 6;
const STACKED_PITCH = STACKED_PADDING + STACKED_LABEL_HEIGHT + BOX_HEIGHT + STACKED_PADDING + 4;
/** 枠の上端 [px]。 */
const FRAME_TOP = 4;
/** 枠の右の余白 [px]。右端の目盛りの数字が欠けない幅。 */
const FRAME_RIGHT_MARGIN = 16;
/** 名前を行の上に置く時の、枠の左右の余白 [px]。左端の目盛りの数字が欠けない幅。 */
const STACKED_FRAME_MARGIN = 14;
const STACKED_LABEL_INSET = 6;
const TICK_LABEL_OFFSET = 16;
const AXIS_TITLE_OFFSET = 34;
const BOTTOM_MARGIN = 6;

export interface BoxRowGeometry {
  /** 名前の左端 */
  readonly labelX: number;
  /** 名前の中心の縦位置 */
  readonly labelY: number;
  /** 箱の中心の縦位置 */
  readonly centerY: number;
  /** 行の上端と下端（行を押せる範囲） */
  readonly top: number;
  readonly bottom: number;
}

export interface BoxPlotLayout {
  /** 名前を枠の左に置くか（`inline`）、行の上に置くか（`stacked`） */
  readonly mode: 'inline' | 'stacked';
  readonly width: number;
  readonly height: number;
  /** 描画領域の枠 */
  readonly frame: { readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number };
  /** 名前に使える幅 */
  readonly labelWidth: number;
  readonly rows: readonly BoxRowGeometry[];
  /** 目盛りの数字の縦位置（文字の基準線） */
  readonly tickLabelY: number;
  /** 軸の名前の縦位置（文字の基準線） */
  readonly axisTitleY: number;
}

export function boxPlotLayout(width: number, rowCount: number): BoxPlotLayout {
  const mode = width >= INLINE_MIN_WIDTH ? 'inline' : 'stacked';
  const pitch = mode === 'inline' ? INLINE_PITCH : STACKED_PITCH;
  const labelWidth =
    mode === 'inline'
      ? Math.min(INLINE_LABEL_MAX, Math.max(INLINE_LABEL_MIN, Math.round(width * 0.3)))
      : width - STACKED_FRAME_MARGIN * 2 - STACKED_LABEL_INSET * 2;
  const x0 = mode === 'inline' ? FIGURE_INSET + labelWidth + INLINE_LABEL_GAP : STACKED_FRAME_MARGIN;
  const x1 = mode === 'inline' ? width - FRAME_RIGHT_MARGIN : width - STACKED_FRAME_MARGIN;
  const y0 = FRAME_TOP;
  const y1 = y0 + rowCount * pitch;
  const rows = Array.from({ length: rowCount }, (_, index): BoxRowGeometry => {
    const top = y0 + index * pitch;
    return mode === 'inline'
      ? { labelX: FIGURE_INSET, labelY: top + pitch / 2, centerY: top + pitch / 2, top, bottom: top + pitch }
      : {
          labelX: x0 + STACKED_LABEL_INSET,
          labelY: top + STACKED_PADDING + STACKED_LABEL_HEIGHT / 2,
          centerY: top + STACKED_PADDING + STACKED_LABEL_HEIGHT + BOX_HEIGHT / 2,
          top,
          bottom: top + pitch,
        };
  });
  return {
    mode,
    width,
    height: y1 + AXIS_TITLE_OFFSET + BOTTOM_MARGIN,
    frame: { x0, x1, y0, y1 },
    labelWidth,
    rows,
    tickLabelY: y1 + TICK_LABEL_OFFSET,
    axisTitleY: y1 + AXIS_TITLE_OFFSET,
  };
}

/** 箱ひげ図の1行の、横方向の位置。値を軸の右端`max`に対する割合で枠の中に置く。 */
export interface BoxGeometry {
  readonly lowerWhisker: number;
  readonly lowerQuartile: number;
  readonly median: number;
  readonly upperQuartile: number;
  readonly upperWhisker: number;
}

export function boxGeometry(box: SegmentPerCharBox, axisMax: number, x0: number, x1: number): BoxGeometry {
  const position = (value: number) => x0 + (value / axisMax) * (x1 - x0);
  return {
    lowerWhisker: position(box.lowerWhisker),
    lowerQuartile: position(box.lowerQuartile),
    median: position(box.median),
    upperQuartile: position(box.upperQuartile),
    upperWhisker: position(box.upperWhisker),
  };
}

/** 距離の表記（小数2桁）。 */
export function distanceText(value: number): string {
  return value.toFixed(2);
}
