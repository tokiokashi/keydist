import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { THUMB_ROW, type Geometry } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { PhysicalKeyboardStandard } from '#input/shapes/geometry.ts';
import type { KeyDetail } from '#interpretation/key-detail.ts';
import { keyDetailTooltip, keyName } from './key-detail-view.ts';
import type { KeySelectionProps } from './pane-parts.tsx';
import './heatmap-diagram.css';
import { heatIntensity, type HeatmapColorScale, type HeatmapDrawStyle } from './heatmap-figure.ts';
import { heatmapFlowSegments, heatmapFlowStrokeWidth } from './heatmap-flow.ts';
import type { BigramVector } from './bigram-vectors.ts';
import { edgeKind, FLOW_COLORS, FLOW_GRADIENT_END_OPACITY, FLOW_GRADIENT_START_OPACITY, type FlowPoint } from './keyboard-flow-lines.ts';
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

/** 図に重ねる2打鍵の線。`maxWeight` は太さの尺度の最大値（組数）で、並べた図の全部で共通にする。 */
export interface HeatmapDiagramFlow {
  readonly vectors: readonly BigramVector[];
  readonly maxWeight: number;
}

/** 線の描く時の不透明度。重なった線とキーの枠が読める程度に透かす。 */
const FLOW_LINE_OPACITY = 0.72;

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
  /** 重ねて描く2打鍵の線。省くと描かない */
  readonly flow?: HeatmapDiagramFlow;
  /** 見出し行の下に置く注記（線の凡例など） */
  readonly captionNote?: ReactNode;
  /** 見出しの直後に置く操作（図の表示の調整のボタンなど） */
  readonly captionAction?: ReactNode;
}

const KEY_SIZE = HEATMAP_KEY_SIZE;

/** キーの矩形の塗り。熱の塊と「なし」は、キーの矩形を塗らない（熱の塊は下の層が塗る）。 */
function keyFill(style: HeatmapDrawStyle, intensity: number): string {
  switch (style) {
    case 'fill':
      return `color-mix(in oklab, var(--heat-1) ${(intensity * 100).toFixed(1)}%, var(--heat-0))`;
    case 'blob':
    case 'none':
      return 'transparent';
  }
}

/** 文字を濃い塗りの上の色（`--on-heat`）にするか。「なし」は塗りが無いので常に通常の文字色。`intensity` は文字の位置の熱の強さ。 */
function labelIsOnHeat(style: HeatmapDrawStyle, intensity: number): boolean {
  switch (style) {
    case 'fill':
    case 'blob':
      return intensity > 0.5;
    case 'none':
      return false;
  }
}

/** SVGの画面上の幅 / 描画の座標系の幅。縮んだ図でも線を読める太さに保つのに使う。線を描かない間は測らない。 */
function useZoom(ref: RefObject<SVGSVGElement | null>, viewWidth: number, enabled: boolean): number {
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || element === null || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const screenWidth = element.getBoundingClientRect().width;
      if (screenWidth > 0 && viewWidth > 0) setZoom(screenWidth / viewWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, viewWidth, enabled]);
  return zoom;
}

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
  flow,
  captionAction,
  captionNote,
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
  const centers = new Map<string, FlowPoint>(
    keys.flatMap((item) => (item.unused ? [] : [[item.key.id, { x: item.x + item.width / 2, y: item.y + KEY_SIZE / 2 }] as const])),
  );
  const segments = flow === undefined ? [] : heatmapFlowSegments(flow.vectors, centers);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoom = useZoom(svgRef, width, flow !== undefined);
  const gradientId = (index: number) => `heatmap-flow-${diagramId}-${index}`;
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
      <figcaption>
        <span className="heatmap-caption-text">{caption}</span>
        {captionAction}
      </figcaption>
      {captionNote}
      <svg
        ref={svgRef}
        viewBox={`${viewX} ${viewY} ${width} ${height}`}
        role={keySelection === undefined ? 'img' : 'group'}
        aria-label={`${caption}${ariaSuffix}`}
      >
        {blob ? (
          <>
            <defs>
              <filter id={`${blobId}-blur`} x="-5%" y="-5%" width="110%" height="110%">
                <feGaussianBlur stdDeviation={BLOB_BLUR} />
              </filter>
            </defs>
            <g className="heatmap-blob-layer" pointerEvents="none">
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
                fill={keyFill(drawStyle, item.intensity)}
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
            </g>
          );
        })}
        {segments.length === 0 ? null : (
          <>
            <defs>
              {segments.map((segment, index) => {
                const color = FLOW_COLORS[edgeKind(segment.vector, false)];
                return (
                  <linearGradient
                    id={gradientId(index)}
                    key={segment.vector.id}
                    gradientUnits="userSpaceOnUse"
                    x1={segment.start.x}
                    y1={segment.start.y}
                    x2={segment.end.x}
                    y2={segment.end.y}
                  >
                    <stop offset="0%" stopColor={color} stopOpacity={FLOW_GRADIENT_START_OPACITY} />
                    <stop offset="100%" stopColor={color} stopOpacity={FLOW_GRADIENT_END_OPACITY} />
                  </linearGradient>
                );
              })}
            </defs>
            <g className="heatmap-flow-layer" pointerEvents="none" opacity={FLOW_LINE_OPACITY}>
              {segments.map((segment, index) => (
                <path
                  key={segment.vector.id}
                  data-heatmap-flow-edge=""
                  data-flow-hand={segment.vector.hand}
                  data-flow-weight={segment.vector.weight}
                  d={segment.path}
                  fill="none"
                  stroke={`url(#${gradientId(index)})`}
                  strokeWidth={heatmapFlowStrokeWidth(segment.vector.weight, flow?.maxWeight ?? 1, zoom)}
                />
              ))}
            </g>
          </>
        )}
        <g className="heatmap-label-layer" pointerEvents="none">
          {keys.map((item) =>
            item.unused ? null : (
              <text
                key={item.key.id}
                data-heatmap-key-label={item.key.id}
                x={item.x + item.width / 2}
                y={item.y + KEY_SIZE / 2 + 4}
                textAnchor="middle"
                fontSize={item.thumb ? 10 : item.label.length > 3 ? 9 : 12}
                fill={
                  labelIsOnHeat(
                    drawStyle,
                    blob ? heatBlobIntensityAt(blobSources, item.x + item.width / 2, item.y + KEY_SIZE / 2, blobRadius) : item.intensity,
                  )
                    ? 'var(--on-heat)'
                    : 'var(--text)'
                }
              >
                {item.label}
              </text>
            ),
          )}
        </g>
      </svg>
    </figure>
  );
}
