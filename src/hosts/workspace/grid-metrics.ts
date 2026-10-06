import { DEFAULT_MIN_BODY_HEIGHT_REM, minBodyHeightRemOf } from '#analyzers/min-body-height.ts';
import { GRID_COLS, type GridSize } from '#engine/workspace-grid.ts';
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
 * ペインを足した時の既定の大きさ。幅は列の半分（2つ並べて使うのが基本）、高さは本体が宣言する下限が収まる高さ。
 * 余白のペインは空きを埋める小さな枠。
 */
export function defaultGridSize(analyzerId: string): GridSize {
  if (isBlankPane(analyzerId)) return { w: GRID_COLS / 4, h: 4 };
  const body = minBodyHeightRemOf(findWorkspaceAnalyzer(analyzerId) ?? {});
  return { w: GRID_COLS / 2, h: rowsFor(PANE_CHROME_REM + body) };
}

/**
 * Analyzerのペインの横幅の下限（24列のうち2列）。見やすさのためではなく、操作できなくなるのを防ぐためだけの下限で、
 * 狭くて見づらければ利用者が広げる。
 */
const MIN_PANE_COLS = 2;

/**
 * 面が狭い時（縦積みに切り替わる760pxの直上など）は、2列が35px前後になり、⋯とつかみが枠からはみ出して届かなくなる。
 * そこだけ守る最小の幅 [px]。見出しの⋯の右端が枠の左から93pxにあり、右の辺の大きさを変えるつまみ（6px）に
 * 重ならない余裕を足して100pxとした（測った値）。面が広く、2列がこれより広ければ効かない（FHDでは2列が131px）。
 */
export const MIN_PANE_WIDTH_PX = 100;

/** 面の幅（px）で、1列ぶんの横の幅（列の幅 + 升の間）。 */
function colStepPx(containerWidth: number): number {
  return (containerWidth - 2 * GRID_PADDING_PX - (GRID_COLS - 1) * GRID_MARGIN_PX) / GRID_COLS + GRID_MARGIN_PX;
}

/** 横幅の下限の列数。2列と、`MIN_PANE_WIDTH_PX`が収まる列数の大きい方。面の幅が変わると計算し直す。 */
export function minPaneCols(containerWidth: number): number {
  const step = colStepPx(containerWidth);
  if (!(step > 0)) return GRID_COLS;
  return Math.min(GRID_COLS, Math.max(MIN_PANE_COLS, Math.ceil((MIN_PANE_WIDTH_PX + GRID_MARGIN_PX) / step)));
}

/**
 * 利用者が縮められる下限。高さは本体の窓（`pane-frame`の最小12rem）が残る大きさで、Analyzerが宣言する下限より低い
 * （縮められないという報告があったため、宣言の下限を縮める限界にしない）。
 * 保存済みの幅が下限を下回っていても並びは書き換えない（縮める時にだけ効く）。
 */
export function minGridSize(analyzerId: string, containerWidth: number): GridSize {
  const w = minPaneCols(containerWidth);
  if (isBlankPane(analyzerId)) return { w, h: 2 };
  return { w, h: rowsFor(PANE_CHROME_REM + DEFAULT_MIN_BODY_HEIGHT_REM) };
}
