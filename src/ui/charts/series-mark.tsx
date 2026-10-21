import type { ReactNode } from 'react';
import { isStrokeOnlyMark, targetMarkPath, type TargetMark } from '#ui/theme/target-marks.ts';

/** 点の半径。形が変わっても外接がこの前後に収まる（`target-marks.ts`）。 */
export const MARK_RADIUS = 3;

/** 系列の点・凡例の見本。形は対象ごとに違い、色を見分けられなくても区別できる。 */
export function SeriesMark({
  mark,
  color,
  x,
  y,
  className,
  children,
}: {
  readonly mark: TargetMark;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly className: string;
  readonly children?: ReactNode;
}) {
  const d = targetMarkPath(mark.shape, MARK_RADIUS);
  return (
    <path
      className={className}
      data-mark={mark.shape}
      transform={`translate(${x},${y})`}
      d={d}
      // 色は`var(--target-color-N)`が来るので、属性でなくstyleで渡す（属性ではvar()が解けない）
      style={isStrokeOnlyMark(mark.shape) ? { fill: 'none', stroke: color } : { fill: color }}
      strokeWidth={isStrokeOnlyMark(mark.shape) ? 1.8 : undefined}
    >
      {children}
    </path>
  );
}
