import { THUMB_ROW, type Geometry } from '#input/shapes/geometry.ts';
import { visibleGeometryKeys } from '#input/layouts/physical-keys.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { HeatmapColorScale } from './options.ts';
import { heatIntensity } from './layer-view.ts';

/**
 * ヒートマップの図1枚。キーの色は押下数から決め、キーの上にマウスを乗せると押下数が出る
 * （SVGの `<title>`）。優劣を示す色・強調は付けない。
 */

/** 層を切り替えるキーの枠。色は層ごとに決まる番号。 */
export interface HeatmapShiftStyle {
  readonly layerIndex: number;
  readonly colorSlot: number;
}

export interface HeatmapDiagramProps {
  readonly layout: Layout;
  readonly geometry: Geometry;
  /** 図の見出し */
  readonly title: string;
  /** 図を区別する印（テストと読み上げに使う） */
  readonly diagramId: string;
  /** キーid → 刻印 */
  readonly legends: ReadonlyMap<string, string>;
  /** ツールチップに出す押下数 */
  readonly keyCounts: ReadonlyMap<string, number>;
  /** 色を決める押下数 */
  readonly colorCounts: ReadonlyMap<string, number>;
  readonly maxCount: number;
  readonly scale: HeatmapColorScale;
  /** キーid → 枠 */
  readonly shiftStyles: ReadonlyMap<string, HeatmapShiftStyle>;
  readonly hidden?: boolean;
  readonly ariaSuffix: string;
}

const KEY_SIZE = 30;
const PAD = 6;
const THUMB_WIDTH = 1.9;

export function HeatmapDiagram({
  layout,
  geometry,
  title,
  diagramId,
  legends,
  keyCounts,
  colorCounts,
  maxCount,
  scale,
  shiftStyles,
  hidden = false,
  ariaSuffix,
}: HeatmapDiagramProps) {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  const keys = visibleGeometryKeys(layout, geometry).map((key) => {
    const thumb = key.row === THUMB_ROW;
    const widthU = thumb ? THUMB_WIDTH : (key.width ?? 1);
    const width = widthU * KEY_SIZE;
    const x = (key.x - (widthU - 1) / 2) * KEY_SIZE;
    const y = key.y * KEY_SIZE;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + KEY_SIZE);

    const label = legends.get(key.id) ?? '';
    const intensity = heatIntensity(colorCounts.get(key.id) ?? 0, maxCount, scale);
    const shift = shiftStyles.get(key.id);
    return { key, x, y, width, label, count: keyCounts.get(key.id) ?? 0, intensity, shift, thumb };
  });

  const viewX = minX - PAD / 2;
  const viewY = minY - PAD / 2;
  const width = maxX - minX + PAD;
  const height = maxY - minY + PAD;
  const caption = `${title}・打鍵頻度`;

  return (
    <figure className="heatmap-diagram" data-heatmap-diagram={diagramId} style={{ width, maxWidth: '100%' }} hidden={hidden}>
      <figcaption>{caption}</figcaption>
      <svg viewBox={`${viewX} ${viewY} ${width} ${height}`} role="img" aria-label={`${caption}${ariaSuffix}`}>
        {keys.map((item) => (
          <g key={item.key.id} data-heatmap-key={item.key.id} data-heat={item.intensity.toFixed(3)}>
            <title>{`${item.label || item.key.id} (${item.key.id}): ${item.count} 打`}</title>
            <rect
              x={item.x + 1}
              y={item.y + 1}
              width={item.width - 2}
              height={KEY_SIZE - 2}
              rx={5}
              fill={`color-mix(in oklab, var(--heat-1) ${(item.intensity * 100).toFixed(1)}%, var(--heat-0))`}
              stroke={item.shift ? `var(--series-${item.shift.colorSlot})` : 'var(--border-strong)'}
              strokeWidth={item.shift ? 3 : 1}
            />
            <text
              x={item.x + item.width / 2}
              y={item.y + KEY_SIZE / 2 + 4}
              textAnchor="middle"
              fontSize={item.thumb ? 10 : item.label.length > 3 ? 9 : 12}
              fill={item.intensity > 0.5 ? 'var(--on-heat)' : 'var(--text)'}
              pointerEvents="none"
            >
              {item.label}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
