import type { KeyboardEvent, MouseEvent } from 'react';
import { THUMB_ROW, type Geometry } from '#input/shapes/geometry.ts';
import { visibleGeometryKeys } from '#input/layouts/physical-keys.ts';
import { drawnKeySpans } from '#input/shapes/drawn-key-spans.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { PhysicalKeyboardStandard } from '#input/shapes/geometry.ts';
import type { KeyDetail } from '#interpretation/key-detail.ts';
import { keyDetailTooltip, keyName } from './key-detail-view.ts';
import type { KeySelectionProps } from './pane-parts.tsx';
import './heatmap-diagram.css';
import { heatIntensity, type HeatmapColorScale } from './heatmap-figure.ts';

/**
 * ヒートマップの図1枚。キーの色は押下数から決め、キーの上にマウスを乗せると、その図が表す面の
 * 押下数・押し方の内訳・前の文字の上位が出る（SVGの `<title>`）。キーを押すと選択し、選んだキーは枠で強調する。
 * 優劣を示す色・強調は付けない。
 */

/** 層を切り替えるキーの枠。色は層ごとに決まる番号。 */
export interface HeatmapShiftStyle {
  readonly layerIndex: number;
  readonly colorSlot: number;
}

export interface HeatmapDiagramProps {
  readonly layout: Layout;
  readonly geometry: Geometry;
  /** 図の見出しの前半。省くと「打鍵頻度」だけになる */
  readonly title?: string;
  /** 図を区別する印（テストと読み上げに使う） */
  readonly diagramId: string;
  /** キーid → 刻印 */
  readonly legends: ReadonlyMap<string, string>;
  /** キーの詳細。ツールチップに出す、この図が表す面の値（押下が無いキーは `undefined`） */
  readonly detailOf: (keyId: string) => KeyDetail | undefined;
  /** 色を決める押下数 */
  readonly colorCounts: ReadonlyMap<string, number>;
  readonly maxCount: number;
  readonly scale: HeatmapColorScale;
  /** キーid → 枠 */
  readonly shiftStyles: ReadonlyMap<string, HeatmapShiftStyle>;
  /** キーの名前に使う規格。自作の物理配列は未指定 */
  readonly standard: PhysicalKeyboardStandard | undefined;
  readonly hidden?: boolean;
  readonly ariaSuffix: string;
  /** キーの選択。渡さなければ、キーは押せない */
  readonly keySelection?: KeySelectionProps;
  /** 置かれた領域の幅いっぱいに広げる。省くと図の大きさ（それより領域が狭ければ領域の幅）で描く */
  readonly fill?: boolean;
  /** ツールチップに押下数だけを出す。省くと押し方と前の文字の内訳も出す */
  readonly countOnlyTooltip?: boolean;
}

const KEY_SIZE = 30;
const PAD = 6;

export function HeatmapDiagram({
  layout,
  geometry,
  title,
  diagramId,
  legends,
  detailOf,
  colorCounts,
  maxCount,
  scale,
  shiftStyles,
  standard,
  hidden = false,
  ariaSuffix,
  keySelection,
  fill = false,
  countOnlyTooltip = false,
}: HeatmapDiagramProps) {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  const visibleKeys = visibleGeometryKeys(layout, geometry);
  const spans = drawnKeySpans(visibleKeys);
  const keys = visibleKeys.map((key) => {
    const thumb = key.row === THUMB_ROW;
    const span = spans.get(key.id)!;
    const width = span.width * KEY_SIZE;
    const x = span.left * KEY_SIZE;
    const y = key.y * KEY_SIZE;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + KEY_SIZE);

    const label = legends.get(key.id) ?? '';
    const intensity = heatIntensity(colorCounts.get(key.id) ?? 0, maxCount, scale);
    const shift = shiftStyles.get(key.id);
    return { key, x, y, width, label, detail: detailOf(key.id), intensity, shift, thumb };
  });

  const viewX = minX - PAD / 2;
  const viewY = minY - PAD / 2;
  const width = maxX - minX + PAD;
  const height = maxY - minY + PAD;
  const caption = title === undefined ? '打鍵頻度' : `${title}・打鍵頻度`;

  return (
    <figure className="heatmap-diagram" data-heatmap-diagram={diagramId} style={fill ? undefined : { width, maxWidth: '100%' }} hidden={hidden}>
      <figcaption>{caption}</figcaption>
      <svg viewBox={`${viewX} ${viewY} ${width} ${height}`} role={keySelection === undefined ? 'img' : 'group'} aria-label={`${caption}${ariaSuffix}`}>
        {keys.map((item) => {
          const name = keyName(item.key.id, item.label, standard);
          const tooltip = countOnlyTooltip
            ? `${name}: ${item.detail?.presses ?? 0}打`
            : keyDetailTooltip(name, item.detail);
          const selected = keySelection?.selectedKeyId === item.key.id;
          const interactive = keySelection === undefined ? {} : {
            role: 'button',
            tabIndex: 0,
            'aria-pressed': selected,
            'aria-label': tooltip.split('\n')[0],
            onClick: (event: MouseEvent<SVGGElement>) => keySelection.onKeyPress(item.key.id, event.currentTarget),
            onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                keySelection.onKeyPress(item.key.id, event.currentTarget);
              } else if (event.key === 'Escape' && keySelection.selectedKeyId !== undefined) {
                event.stopPropagation();
                keySelection.onClear();
              }
            },
          };
          return (
            <g
              key={item.key.id}
              className="heatmap-key"
              data-heatmap-key={item.key.id}
              data-heat={item.intensity.toFixed(3)}
              data-key-selected={selected || undefined}
              {...interactive}
            >
              <title>{tooltip}</title>
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
              {selected ? (
                <rect
                  className="heatmap-key-ring"
                  x={item.x - 1}
                  y={item.y - 1}
                  width={item.width + 2}
                  height={KEY_SIZE + 2}
                  rx={6.5}
                  fill="none"
                  stroke="var(--picker-selected)"
                  strokeWidth={2.5}
                  pointerEvents="none"
                />
              ) : null}
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
          );
        })}
      </svg>
    </figure>
  );
}
