import type { KeyboardEvent, MouseEvent } from 'react';
import { THUMB_ROW, type Geometry } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { PhysicalKeyboardStandard } from '#input/shapes/geometry.ts';
import type { KeyDetail } from '#interpretation/key-detail.ts';
import { keyDetailTooltip, keyName } from './key-detail-view.ts';
import type { KeySelectionProps } from './pane-parts.tsx';
import './heatmap-diagram.css';
import { heatIntensity, type HeatmapColorScale } from './heatmap-figure.ts';
import { HEAT_BLOB_LEVELS, HEAT_BLOB_RADIUS_KEYS, heatBlobIntensityAt, heatBlobRuns, type HeatBlobSource } from './heatmap-blob.ts';
import { HEATMAP_KEY_SIZE, heatmapBounds, heatmapDrawnKeys, heatmapViewBox, type HeatmapBounds } from './heatmap-keys.ts';

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

/** 図の描き方。キーごとの塗りか、押下の集まりをぼかした熱の塊（キーの枠と文字は同じく描く）。 */
export type HeatmapDrawStyle = 'fill' | 'blob';

/** 熱の塊を矩形の升で描く時の升の大きさと、ぼかしの大きさ（描画の座標系）。 */
const BLOB_CELL = 4;
const BLOB_BLUR = 3;

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
  /** 置かれた領域の幅に合わせて縮む。広げる時も図の大きさまでで、省くと図の大きさ（領域が狭ければ領域の幅）で描く */
  readonly fill?: boolean;
  /** ツールチップに押下数だけを出す。省くと押し方と前の文字の内訳も出す */
  readonly countOnlyTooltip?: boolean;
  /** 描く範囲。並べた図で共通にする時に渡す（`sharedHeatmapBounds`）。省くと、この図が描くキーの範囲 */
  readonly bounds?: HeatmapBounds;
  /** 描き方。省くとキーごとの塗り */
  readonly drawStyle?: HeatmapDrawStyle;
}

const KEY_SIZE = HEATMAP_KEY_SIZE;

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
  bounds,
  drawStyle = 'fill',
}: HeatmapDiagramProps) {
  const drawnKeys = heatmapDrawnKeys(layout, geometry);
  const keys = drawnKeys.map(({ key, left, width: span, unused }) => {
    const thumb = key.row === THUMB_ROW;
    const width = span * KEY_SIZE;
    const x = left * KEY_SIZE;
    const y = key.y * KEY_SIZE;

    // 配列が使わないために描くだけのキーは、押下数0・文字なし・詳細なしの枠にする
    const label = unused ? '' : (legends.get(key.id) ?? '');
    const intensity = unused ? 0 : heatIntensity(colorCounts.get(key.id) ?? 0, maxCount, scale);
    const shift = unused ? undefined : shiftStyles.get(key.id);
    return {
      key,
      x,
      y,
      width,
      label,
      detail: unused ? undefined : detailOf(key.id),
      intensity,
      shift,
      thumb,
      unused,
    };
  });

  const view = heatmapViewBox(bounds ?? heatmapBounds(drawnKeys));
  const viewX = view.x;
  const viewY = view.y;
  const width = view.width;
  const height = view.height;
  const blob = drawStyle === 'blob';
  const blobSources: HeatBlobSource[] = blob
    ? keys.flatMap((item) =>
        item.unused
          ? []
          : [
              {
                x: item.x + item.width / 2,
                y: item.y + KEY_SIZE / 2,
                intensity: item.intensity,
              },
            ],
      )
    : [];
  const blobRadius = HEAT_BLOB_RADIUS_KEYS * KEY_SIZE;
  const blobRuns = blob ? heatBlobRuns(blobSources, { minX: viewX, minY: viewY, maxX: viewX + width, maxY: viewY + height }, BLOB_CELL, blobRadius) : [];
  const blobId = `heatmap-blob-${diagramId}`;
  const caption = title === undefined ? '打鍵頻度' : `${title}・打鍵頻度`;

  return (
    <figure
      className="heatmap-diagram"
      data-heatmap-diagram={diagramId}
      style={fill ? { width: '100%', maxWidth: width } : { width, maxWidth: '100%' }}
      hidden={hidden}
    >
      <figcaption>{caption}</figcaption>
      <svg viewBox={`${viewX} ${viewY} ${width} ${height}`} role={keySelection === undefined ? 'img' : 'group'} aria-label={`${caption}${ariaSuffix}`}>
        {blob ? (
          <>
            <defs>
              <clipPath id={`${blobId}-clip`}>
                {keys.map((item) =>
                  item.unused ? null : <rect key={item.key.id} x={item.x + 1} y={item.y + 1} width={item.width - 2} height={KEY_SIZE - 2} rx={5} />,
                )}
              </clipPath>
              <filter id={`${blobId}-blur`} x="-5%" y="-5%" width="110%" height="110%">
                <feGaussianBlur stdDeviation={BLOB_BLUR} />
              </filter>
            </defs>
            <g className="heatmap-blob-layer" pointerEvents="none" clipPath={`url(#${blobId}-clip)`}>
              {keys.map((item) =>
                item.unused ? null : (
                  <rect key={item.key.id} x={item.x + 1} y={item.y + 1} width={item.width - 2} height={KEY_SIZE - 2} rx={5} fill="var(--heat-0)" />
                ),
              )}
              <g filter={`url(#${blobId}-blur)`} data-heatmap-blob-levels={HEAT_BLOB_LEVELS}>
                {blobRuns.map((run) => (
                  <rect
                    key={`${run.x},${run.y}`}
                    x={run.x}
                    y={run.y}
                    width={run.width}
                    height={run.height}
                    fill="var(--heat-1)"
                    fillOpacity={run.level / HEAT_BLOB_LEVELS}
                  />
                ))}
              </g>
            </g>
          </>
        ) : null}
        {keys.map((item) => {
          if (item.unused) {
            return (
              <g key={item.key.id} className="heatmap-key" data-heatmap-key={item.key.id} data-heatmap-key-unused="">
                <rect
                  x={item.x + 1}
                  y={item.y + 1}
                  width={item.width - 2}
                  height={KEY_SIZE - 2}
                  rx={5}
                  fill="none"
                  stroke="var(--border-strong)"
                  strokeWidth={1}
                  pointerEvents="none"
                />
              </g>
            );
          }
          const name = keyName(item.key.id, item.label, standard);
          const tooltip = countOnlyTooltip ? `${name}: ${item.detail?.presses ?? 0}打` : keyDetailTooltip(name, item.detail);
          const selected = keySelection?.selectedKeyId === item.key.id;
          const interactive =
            keySelection === undefined
              ? {}
              : {
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
                fill={blob ? 'transparent' : `color-mix(in oklab, var(--heat-1) ${(item.intensity * 100).toFixed(1)}%, var(--heat-0))`}
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
                fill={
                  (blob ? heatBlobIntensityAt(blobSources, item.x + item.width / 2, item.y + KEY_SIZE / 2, blobRadius) : item.intensity) > 0.5
                    ? 'var(--on-heat)'
                    : 'var(--text)'
                }
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
