import { DEFAULT_MIN_BODY_HEIGHT_REM, minBodyHeightRemOf } from '#analyzers/min-body-height.ts';
import { DEFAULT_PANE_COLS, DEFAULT_SMALL_PANE_COLS, type GridColumnRange, type GridSize, type WorkspaceGrid } from '#engine/workspace-grid.ts';
import { findWorkspaceAnalyzer, isBlankPane } from './analyzer-registry.ts';

/**
 * 格子の升目の大きさ（画素）。ペインの高さは升目の整数倍になるので、升目を細かくして（28px）
 * 大きさを滑らかに選べるようにし、間（8px）で枠を分ける。
 * 値は実物を見て決めた。変えると、保存した升目の数と実際の高さの対応が変わる。
 */
export const GRID_ROW_HEIGHT_PX = 28;
export const GRID_MARGIN_PX = 8;
export const GRID_PADDING_PX = 8;

/** 見出し1行と上下の余白を合わせた、ペインの本体以外の高さ [rem]。 */
const PANE_CHROME_REM = 4.2;

function rowsFor(rem: number): number {
  const px = rem * 16;
  return Math.ceil((px + GRID_MARGIN_PX) / (GRID_ROW_HEIGHT_PX + GRID_MARGIN_PX));
}

/**
 * ペインを足した時の既定の大きさ。幅は`DEFAULT_PANE_COLS`、高さは本体が宣言する下限が収まる高さ。
 * 余白のペインは空きを埋める小さな枠。
 */
export function defaultGridSize(analyzerId: string): GridSize {
  if (isBlankPane(analyzerId)) return { w: DEFAULT_SMALL_PANE_COLS, h: 4 };
  const body = minBodyHeightRemOf(findWorkspaceAnalyzer(analyzerId) ?? {});
  return { w: DEFAULT_PANE_COLS, h: rowsFor(PANE_CHROME_REM + body) };
}

/**
 * 1列ぶんの横の幅（列の幅 + 升の間）[px]。面の幅に依らない固定の値で、ペインの画素の幅は持っている列の数だけで決まる。
 * 68pxは、FHD（1920px）でサイドバーを固定して開いた面（1680px）に、縦のスクロールバー（最大約15px）があっても、
 * 24列のサンプルの並びが横にスクロールせずに収まる最大の値に近い整数（24列で1640px。69pxだと1664pxで余裕が1pxしか残らない）。
 */
export const GRID_COL_STEP_PX = 68;

/** `cols`列の並びを置く幅 [px]。外周の余白と列の間を含む。ライブラリへ渡す幅は、この幅で1列の幅が`GRID_COL_STEP_PX - GRID_MARGIN_PX`になる。 */
export function gridWidthPx(cols: number): number {
  return cols * GRID_COL_STEP_PX - GRID_MARGIN_PX + 2 * GRID_PADDING_PX;
}

/** 幅 `areaWidth`[px]の面に収まる列の数。 */
export function colsFitting(areaWidth: number): number {
  const cols = Math.floor((areaWidth - 2 * GRID_PADDING_PX + GRID_MARGIN_PX) / GRID_COL_STEP_PX);
  return Number.isFinite(cols) ? Math.max(1, cols) : 1;
}

/**
 * 格子の列の数。面に収まる列の数と、並びの右端の列（`rightmost`）、ドラッグ中に伸ばした列（`reach`）の最も大きい値。
 * 並びの右端より小さくしない（ライブラリは列の外にはみ出した枠を列の中へ寄せるので、並びが書き換わる）。
 */
export function gridCols(areaWidth: number, rightmost: number, reach: number): number {
  return Math.max(colsFitting(areaWidth), rightmost, reach);
}

/** 並びの右端の列（`x + w`の最大。ペインが無ければ0）。 */
export function rightmostCol(grid: WorkspaceGrid): number {
  return grid.reduce((max, item) => Math.max(max, item.x + item.w), 0);
}

/**
 * 面の見えている列の範囲。左右の端で一部しか見えていない列は含めない（そこへ置いたペインが切れて見えないように）。
 * `scrollLeft`は面の横のスクロールの位置、`clientWidth`は面の見えている幅 [px]。
 */
export function visibleColRange(scrollLeft: number, clientWidth: number): GridColumnRange {
  const start = Math.max(0, Math.ceil((scrollLeft - GRID_PADDING_PX) / GRID_COL_STEP_PX));
  // 右の外周の余白（`GRID_PADDING_PX`）も見えている幅から除く。スクロールしていない面では`colsFitting`と一致する
  const end = Math.floor((scrollLeft + clientWidth - 2 * GRID_PADDING_PX + GRID_MARGIN_PX) / GRID_COL_STEP_PX);
  return { start, end: Math.max(start + 1, end) };
}

/**
 * ドラッグ・大きさの変更で、動かしている枠の右端（`edge`列）が列の右端（`cols`）に届いた時に、さらに右へ置けるよう伸ばす列の数。
 * 届いた時にだけ伸ばし、操作を終えたら並びの右端と面に収まる列の数へ戻る。
 */
export const DRAG_EXTEND_COLS = 4;

export function extendedReach(cols: number, edge: number, reach: number): number {
  return edge >= cols ? Math.max(reach, cols + DRAG_EXTEND_COLS) : reach;
}

/**
 * Analyzerのペインの横幅の下限（列の数）。見やすさのためではなく、操作できなくなるのを防ぐためだけの下限で、
 * 狭くて見づらければ利用者が広げる。
 */
const MIN_PANE_COLS = 2;

/**
 * 枠の左端から⋯の右端までが93pxにあり、右の辺の大きさを変えるつまみ（6px）に重ならない余裕を足して100pxとした（測った値）。
 * ⋯とつかみが枠からはみ出して届かなくなる幅を避ける、ペインの最小の幅 [px]。
 */
export const MIN_PANE_WIDTH_PX = 100;

/** 横幅の下限の列数。`MIN_PANE_COLS`と、`MIN_PANE_WIDTH_PX`が収まる列数の大きい方。 */
export function minPaneCols(): number {
  return Math.max(MIN_PANE_COLS, Math.ceil((MIN_PANE_WIDTH_PX + GRID_MARGIN_PX) / GRID_COL_STEP_PX));
}

/**
 * 利用者が縮められる下限。高さは本体の窓（`pane-frame`の最小12rem）が残る大きさで、Analyzerが宣言する下限より低い
 * （縮められないという報告があったため、宣言の下限を縮める限界にしない）。
 * 保存済みの幅が下限を下回っていても並びは書き換えない（縮める時にだけ効く）。
 */
export function minGridSize(analyzerId: string): GridSize {
  const w = minPaneCols();
  if (isBlankPane(analyzerId)) return { w, h: 2 };
  return { w, h: rowsFor(PANE_CHROME_REM + DEFAULT_MIN_BODY_HEIGHT_REM) };
}
