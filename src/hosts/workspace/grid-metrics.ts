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
  if (isBlankPane(analyzerId)) return { w: 3, h: 4 };
  const body = minBodyHeightRemOf(findWorkspaceAnalyzer(analyzerId) ?? {});
  return { w: GRID_COLS / 2, h: rowsFor(PANE_CHROME_REM + body) };
}

/**
 * 利用者が縮められる下限。本体の窓（`pane-frame`の最小12rem）が残る大きさで、Analyzerが宣言する下限より低い
 * （縮められないという報告があったため、宣言の下限を縮める限界にしない）。
 */
export function minGridSize(analyzerId: string): GridSize {
  if (isBlankPane(analyzerId)) return { w: 1, h: 2 };
  return { w: 4, h: rowsFor(PANE_CHROME_REM + DEFAULT_MIN_BODY_HEIGHT_REM) };
}
