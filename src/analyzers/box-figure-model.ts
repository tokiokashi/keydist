import type { SegmentPerCharBox } from '#interpretation/bunsetsu-stats.ts';
import { formatTickValue, multiple, niceTicks } from './axis-ticks.ts';
import { textWidth } from './figure-text.ts';
import type { ScaleRange } from './shared-scale.ts';

/**
 * 縦の箱ひげ図の表示モデルのうち、Analyzerによらない部分（画面に依存しない純粋な関数）。
 * 目盛りと図の座標を決める。順位・並べ替え・特定の配列の強調・基準の線は持たない。
 * 座標の単位は画面のpxで、図は測った幅をそのままSVGの座標の幅にする（文字の大きさを幅で変えない）。
 */

/** 行の名前。ホストが集合に対して決めたもの。 */
export interface BoxRowContext {
  readonly targetKey: string;
  readonly label: string;
  /** 集合によらない完全な名前。hover（`title`属性）に出す。 */
  readonly fullName: string;
}

/** 箱ひげ図に描く5つの値（10%点・25%点・中央値・75%点・90%点）。 */
export type BoxQuantiles = Pick<SegmentPerCharBox, 'lowerWhisker' | 'lowerQuartile' | 'median' | 'upperQuartile' | 'upperWhisker'> & {
  /** 値が決まった文節の数。図の座標は読まない */
  readonly count?: number;
};

/** 図に描く1列。箱ひげ図の図の部品（`box-figure.tsx`）が受け取る形。 */
export interface BoxFigureRow extends BoxRowContext {
  readonly row: { readonly box: BoxQuantiles };
}

/** 目盛りの目標の本数。 */
const TICK_TARGET = 5;

/** このペインの箱が占める範囲。0から、ひげの上端の最大まで。箱を描く行が無ければ `undefined`（他のペインの範囲を広げない）。 */
export function boxOwnRange(rows: readonly BoxFigureRow[]): ScaleRange | undefined {
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
  /** 軸の上端の値。下端は0 */
  readonly max: number;
  readonly ticks: readonly BoxTick[];
}

/**
 * 距離の目盛り。0から始め、上端は`max`を含む最小の目盛りの値にする（枠の上端に目盛りが来る）。
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

/** 箱の幅の上限 [px]。 */
export const MAX_BOX_WIDTH = 28;
/** ひげの端の横線の幅の上限 [px]。 */
export const MAX_WHISKER_CAP_WIDTH = 14;
/** 図の目盛りの数字・軸の名前の文字の大きさ [px]。散布図と同じ。 */
export const AXIS_FONT_SIZE = 11;

/** 縦軸（目盛りの数字と軸の名前）の列の幅 [px]。横にスクロールしても残す。 */
export const AXIS_WIDTH = 58;
/** 1列（箱と名前）の幅の下限と上限 [px]。下限は縦書きの名前の字が隣と重ならない幅。 */
export const MIN_COLUMN_WIDTH = 32;
export const MAX_COLUMN_WIDTH = 48;
/** 枠の上端 [px]。 */
const FRAME_TOP = 8;
/** 枠の高さ [px]。 */
const FRAME_HEIGHT = 240;
/** 枠と名前の間 [px]。 */
const LABEL_GAP = 8;
/** 名前の下の余白 [px]。 */
const LABEL_BOTTOM_PAD = 8;
/** 名前の縦の長さの上限 [px]。組み込みの全配列の名前が切れない長さで、これを超える自作の名前だけを切り詰める。 */
export const LABEL_MAX_LENGTH = 140;

export interface BoxColumnGeometry {
  /** 列の左端と右端 */
  readonly left: number;
  readonly right: number;
  /** 列の中心の横位置 */
  readonly centerX: number;
}

export interface BoxPlotLayout {
  readonly axisWidth: number;
  /** スクロールする図（枠と列）の幅。列が多ければ領域の幅を超える */
  readonly plotWidth: number;
  /** 縦軸の列と図で共通の高さ */
  readonly height: number;
  /** 描画領域の枠。横方向は図の左端から右端まで */
  readonly frame: { readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number };
  readonly columnWidth: number;
  readonly boxWidth: number;
  readonly capWidth: number;
  readonly columns: readonly BoxColumnGeometry[];
  /** 名前の先頭の縦位置（縦書きの文字は、ここから下へ並ぶ） */
  readonly labelTopY: number;
}

/** `available`は縦軸の列を除いた、図を置く領域の幅。`labelLength`は表示する名前のうち一番長いものの縦の長さ。 */
export function boxPlotLayout(available: number, columnCount: number, labelLength: number): BoxPlotLayout {
  const columnWidth = columnCount === 0 ? MAX_COLUMN_WIDTH : Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.floor(available / columnCount)));
  const plotWidth = columnWidth * columnCount;
  const y0 = FRAME_TOP;
  const y1 = y0 + FRAME_HEIGHT;
  const columns = Array.from({ length: columnCount }, (_, index): BoxColumnGeometry => {
    const left = index * columnWidth;
    return { left, right: left + columnWidth, centerX: left + columnWidth / 2 };
  });
  return {
    axisWidth: AXIS_WIDTH,
    plotWidth,
    height: y1 + LABEL_GAP + labelLength + LABEL_BOTTOM_PAD,
    frame: { x0: 0.5, x1: plotWidth - 0.5, y0, y1 },
    columnWidth,
    boxWidth: Math.min(MAX_BOX_WIDTH, Math.round(columnWidth * 0.6)),
    capWidth: Math.min(MAX_WHISKER_CAP_WIDTH, Math.round(columnWidth * 0.3)),
    columns,
    labelTopY: y1 + LABEL_GAP,
  };
}

/** 値の縦位置。0が枠の下端、軸の右端に当たる最大の値が枠の上端。 */
export function valueY(value: number, axisMax: number, y0: number, y1: number): number {
  return y1 - (value / axisMax) * (y1 - y0);
}

/** 箱ひげ図の1列の、縦方向の位置。 */
export interface BoxGeometry {
  readonly lowerWhisker: number;
  readonly lowerQuartile: number;
  readonly median: number;
  readonly upperQuartile: number;
  readonly upperWhisker: number;
}

export function boxGeometry(box: BoxQuantiles, axisMax: number, y0: number, y1: number): BoxGeometry {
  return {
    lowerWhisker: valueY(box.lowerWhisker, axisMax, y0, y1),
    lowerQuartile: valueY(box.lowerQuartile, axisMax, y0, y1),
    median: valueY(box.median, axisMax, y0, y1),
    upperQuartile: valueY(box.upperQuartile, axisMax, y0, y1),
    upperWhisker: valueY(box.upperWhisker, axisMax, y0, y1),
  };
}

/** 距離の表記（小数2桁）。 */
export function distanceText(value: number): string {
  return value.toFixed(2);
}

/** 縦書きの名前の1まとまり。`upright`は字を立てて置く1字、そうでなければ右へ90度倒して続けて置く字の並び。 */
export interface LabelRun {
  readonly text: string;
  readonly upright: boolean;
  /** 名前の先頭からの距離 [px]（まとまりの先頭の位置） */
  readonly offset: number;
  /** まとまりの縦の長さ [px]。倒す並びは、この長さに字を詰めて置く */
  readonly length: number;
}

/** 倒して置く並びと、次の字の間（em）。 */
const RUN_GAP_EM = 0.15;
/** 縦書きで空白が取る長さ（em）。半字より狭くする。 */
const SPACE_EM = 0.25;
/** 英大文字が取る幅（em）。倒した並びの長さの見積もりに使う。 */
const UPPERCASE_EM = 0.72;

/** 縦書きで倒して置く全角の字（伸ばす棒・括弧のように、字の向きが縦書きで変わるもの）。 */
const ROTATED_WIDE = new Set([...'ー〜～―（）「」『』']);

function isUpright(character: string): boolean {
  const code = character.codePointAt(0)!;
  return code >= 0x1100 && !(code >= 0xff61 && code <= 0xff9f) && !ROTATED_WIDE.has(character);
}

/** 倒して置く1字の長さ [px]。 */
function rotatedWidth(character: string, fontSize: number): number {
  if (ROTATED_WIDE.has(character)) return fontSize;
  if (character >= 'A' && character <= 'Z') return UPPERCASE_EM * fontSize;
  return textWidth(character, fontSize);
}

/**
 * 名前を縦書きの並びにする。かな・漢字は1字ずつ立て、英数字と記号、全角の括弧と伸ばす棒は並びごと右へ90度倒す。空白は詰める。
 * 倒す並びは、見積もった長さ（`length`）に字を詰めて置くので、次の字と重ならない。
 * 字体の縦書きの字形に頼らず、字の位置を自分で決める（字形の無い環境でも字が重ならない）。
 */
export function verticalLabelRuns(label: string, fontSize: number): readonly LabelRun[] {
  const runs: LabelRun[] = [];
  let offset = 0;
  let rotated = '';
  let rotatedStart = 0;
  let rotatedLength = 0;
  const flush = () => {
    if (rotated === '') return;
    runs.push({ text: rotated, upright: false, offset: rotatedStart, length: rotatedLength });
    offset += fontSize * RUN_GAP_EM;
    rotated = '';
    rotatedLength = 0;
  };
  for (const character of label) {
    if (/\s/.test(character)) {
      flush();
      offset += fontSize * SPACE_EM;
    } else if (isUpright(character)) {
      flush();
      runs.push({ text: character, upright: true, offset, length: fontSize });
      offset += fontSize;
    } else {
      if (rotated === '') rotatedStart = offset;
      rotated += character;
      const width = rotatedWidth(character, fontSize);
      rotatedLength += width;
      offset += width;
    }
  }
  flush();
  return runs;
}

/** 縦書きにした名前の縦の長さ [px]。 */
export function verticalLabelLength(label: string, fontSize: number): number {
  const runs = verticalLabelRuns(label, fontSize);
  const last = runs[runs.length - 1];
  return last === undefined ? 0 : last.offset + last.length;
}

/** 縦書きの長さが`maxLength`に収まるよう、末尾を「…」に替える。収まる名前はそのまま返す。 */
export function fitVerticalLabel(label: string, maxLength: number, fontSize: number): string {
  if (verticalLabelLength(label, fontSize) <= maxLength) return label;
  const characters = [...label];
  while (characters.length > 0 && verticalLabelLength(`${characters.join('')}…`, fontSize) > maxLength) characters.pop();
  return `${characters.join('')}…`;
}
