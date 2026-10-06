/**
 * Keyboard Flowの描画エリア。物理配列を切り替えて見比べる時に動かしたくないのは、
 * 枠の形とキーの大きさなので、エリアの大きさと縮尺は物理配列によらず1つに固定する。
 *
 * 寸法は組み込みの物理配列8種のキー中心の広がりを実測して決めた
 * （幅は jis-column-staggered の14u、高さは column-staggered 系の3.34u）。
 * 組み込みが増減・変形して広がりが変わったら、`keyboard-flow-area.test.ts` が落ちる。
 *
 * 単位はSVGのユーザー座標。エリア全体は置かれた幅へ伸縮するので、ここの値は画面のpxではない。
 */

/** 1u あたりのユーザー座標の長さ。全物理配列で共通。 */
export const KEY_PITCH = 58;
/** キー中心の広がりの外側に取る余白（キーの半分・連打のバッジがはみ出さないため）。 */
export const AREA_PAD = 42;
/** 組み込みの物理配列でキー中心が一番広く広がる幅 [u]（jis-column-staggered）。 */
export const WIDEST_BUILTIN_SPAN_U = 14;
/** 同じく一番高く広がる高さ [u]（column-staggered 系）。 */
export const TALLEST_BUILTIN_SPAN_U = 3.34;

export const AREA_WIDTH = AREA_PAD * 2 + WIDEST_BUILTIN_SPAN_U * KEY_PITCH;
export const AREA_HEIGHT = AREA_PAD * 2 + Math.ceil(TALLEST_BUILTIN_SPAN_U * KEY_PITCH);

export interface KeyboardFlowFit {
  /** キー中心の最小x・yがエリアのどこへ来るか（中央寄せ後、縮める前）。 */
  readonly originX: number;
  readonly originY: number;
  /** 自作の物理配列がエリアに収まらない時だけ1未満。組み込みは常に1。 */
  readonly shrink: number;
}

/** キー中心の広がり [u] から、エリアの中央へ置く位置と、収まらない時の縮め率を決める。 */
export function fitKeyboardToArea(spanX: number, spanY: number): KeyboardFlowFit {
  const contentW = spanX * KEY_PITCH;
  const contentH = spanY * KEY_PITCH;
  const availW = AREA_WIDTH - AREA_PAD * 2;
  const availH = AREA_HEIGHT - AREA_PAD * 2;
  const shrink = Math.min(
    1,
    contentW > 0 ? availW / contentW : 1,
    contentH > 0 ? availH / contentH : 1,
  );
  return {
    originX: (AREA_WIDTH - contentW) / 2,
    originY: (AREA_HEIGHT - contentH) / 2,
    shrink,
  };
}

/**
 * 縮めた時に優先するのは線の見え方。線は画面上でこの太さを下回らないよう、
 * 縮尺が下がるほどユーザー座標の側で太くする。
 */
export const MIN_LINE_SCREEN_PX = 1.25;
/** 同キー連打のラベルは、縮んでもこの大きさの文字で読めるまま残す。 */
export const MIN_REPEAT_LABEL_SCREEN_PX = 8;
/** 連打ラベル（バッジ）の文字の基準の大きさ（ユーザー座標）。CSSの `.flow-key-badge text` と揃える。 */
export const REPEAT_LABEL_FONT_UNITS = 6.2;

/** 線の太さ（ユーザー座標）。`zoom` は 画面上のSVG幅 / AREA_WIDTH。 */
export function flowLineWidth(baseWidth: number, zoom: number): number {
  if (!(zoom > 0)) return baseWidth;
  return Math.max(baseWidth, MIN_LINE_SCREEN_PX / zoom);
}

/**
 * 連打ラベルを、画面上で読める大きさを保つよう拡大する率（縮んだ時だけ1を超える）。
 * `maxScale` は図を他と分け合って縮める置き場（Workspaceのペイン）の上限。図が縮んでもラベルだけ大きいままだと、
 * キーに対してラベルが大きくなって後ろの線を覆うので、拡大率に上限を置いて図と一緒に縮める。
 * 上限が無い時（個別画面）は従来どおり読める大きさを優先する。
 */
export function repeatLabelScale(zoom: number, maxScale = Number.POSITIVE_INFINITY): number {
  if (!(zoom > 0)) return 1;
  return Math.max(1, Math.min(maxScale, MIN_REPEAT_LABEL_SCREEN_PX / (REPEAT_LABEL_FONT_UNITS * zoom)));
}
