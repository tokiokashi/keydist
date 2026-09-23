import type { PanelRect } from './workspace-state.ts';

export interface ViewportSize {
  width: number;
  height: number;
}

export interface PanelSizeConstraints {
  minWidth?: number;
  minHeight?: number;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function clampPanelRectToViewport(
  rect: PanelRect,
  viewport: ViewportSize,
  constraints: PanelSizeConstraints = {},
): PanelRect {
  const viewportWidth = finiteNonNegative(viewport.width);
  const viewportHeight = finiteNonNegative(viewport.height);
  const minWidth = Math.min(finiteNonNegative(constraints.minWidth ?? 0), viewportWidth);
  const minHeight = Math.min(finiteNonNegative(constraints.minHeight ?? 0), viewportHeight);
  const width = Math.min(Math.max(finiteNonNegative(rect.width), minWidth), viewportWidth);
  const height = Math.min(Math.max(finiteNonNegative(rect.height), minHeight), viewportHeight);
  const maxX = Math.max(0, viewportWidth - width);
  const maxY = Math.max(0, viewportHeight - height);

  return {
    x: Math.min(Math.max(finiteNonNegative(rect.x), 0), maxX),
    y: Math.min(Math.max(finiteNonNegative(rect.y), 0), maxY),
    width,
    height,
  };
}
