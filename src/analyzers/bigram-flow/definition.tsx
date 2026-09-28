import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import type { Geometry, Key, Point } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { Trace } from '#trace/generate.ts';
import type { BigramVector, FingerClass, RelativeVector } from './bigram-vectors.ts';
import { bigramFlowDefinition, type BigramFlowExtracted, type BigramFlowHandProfile } from './extract.ts';
import {
  MIN_POLAR_BANDWIDTH_DEGREES,
  movementPlotExtent,
  movementPlotScale,
  type MovementScaleMode,
} from './movement-profile-scale.ts';
import {
  computeOutgoingMaxWeight,
  orderKeyboardFlowVectors,
  resolveKeyboardFlowMaxWeight,
  scaleKeyboardFlowWeight,
  type BigramFlowOptions,
  type KeyboardFlowHoverScale,
  type KeyboardFlowLayerOrder,
  type KeyboardFlowWeightScale,
} from './options.ts';
import './bigram-vector-view.css';

/**
 * Bigram Flowの可視化（definition.tsx。docs/architecture.md「Analyzerの契約は
 * 純粋な部分だけをanalyzers/contract.tsに置く。可視化のcomponentとの結び付けは
 * 各Analyzerのdefinition.tsxで行う」）。
 *
 * ここのcomponentは`BigramFlowExtracted`（`extract.ts`が計算した結果）と
 * 見た目だけの設定を受け取って描くだけで、`bigram-vectors.ts`の集計関数を
 * 呼び返さない。例外は次の、抽出結果の数値を変えない軽い表示変換だけ:
 * - pixel座標への変換（`chartPoint` `edgePath` `polarPoint` `smoothClosedPath`）
 * - 重ね順の並べ替え（`orderKeyboardFlowVectors`。`layerOrder`は見た目だけの設定）
 * - 線幅のスケール変換（`scaleKeyboardFlowWeight` `weightScale`）
 * - ホバー中のキー限定強調（`hoveredKeyId`はephemeralなUI状態で抽出に含められない）
 * - `polarGain`によるpolar plotの表示倍率（KDE密度の値自体は変えない。
 *   `movement-profile-scale.ts`のコメント参照）
 *
 * `hosts/`（単体ページ・Workspace）がまだ無いため、`bigramFlowAnalyzer`の
 * `definition`/`View`の結び付け方は暫定。host側の実際の呼び出し形が決まったら
 * 見直す（PR本文「決めきれなかった点」）。
 */

const FINGER_OPTIONS: readonly { id: FingerClass; label: string }[] = [
  { id: 'index', label: '人' },
  { id: 'middle', label: '中' },
  { id: 'ring', label: '薬' },
  { id: 'pinky', label: '小' },
];
const SCALE = 58;
const PAD = 42;
const FLOW_COLORS = {
  left: 'var(--viz-flow-left)',
  right: 'var(--viz-flow-right)',
  cross: 'var(--viz-flow-cross)',
  inward: 'var(--viz-flow-inward)',
  outward: 'var(--viz-flow-outward)',
  same: 'var(--viz-flow-cross)',
} as const;

function bounds(keys: readonly Key[]) {
  const xs = keys.map((key) => key.x);
  const ys = keys.map((key) => key.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function chartPoint(point: Point, minX: number, minY: number) {
  return {
    x: PAD + (point.x - minX) * SCALE,
    y: PAD + (point.y - minY) * SCALE,
  };
}

function edgePath(vector: BigramVector, minX: number, minY: number): string {
  const start = chartPoint(vector.from, minX, minY);
  const end = chartPoint(vector.to, minX, minY);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);

  if (length < 0.01) return `M ${start.x} ${start.y}`;

  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const ux = dx / length;
  const uy = dy / length;

  // 往復で弧の側を反転させず、ほぼ全てを同じ側へ浅く持ち上げる。
  let nx = -uy;
  let ny = ux;
  if (ny > 0 || (Math.abs(ny) < 0.15 && nx < 0)) {
    nx *= -1;
    ny *= -1;
  }
  const bend = Math.min(8, Math.max(2.5, length * 0.025));
  const control = {
    x: mid.x + nx * bend,
    y: mid.y + ny * bend,
  };
  return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
}

function edgeKind(
  vector: BigramVector,
  showRollDirection: boolean,
): keyof typeof FLOW_COLORS {
  if (showRollDirection && vector.fingerDirection !== undefined) return vector.fingerDirection;
  return vector.hand;
}

function weightScale(weight: number, maxWeight: number): number {
  if (maxWeight <= 1) return 1;
  return Math.log1p(weight) / Math.log1p(maxWeight);
}

/** hoveredKeyIdはephemeralなUI状態（抽出options.tsに含まれない）なので、ここでその場で数える。 */
function outgoingCounts(
  vectors: readonly BigramVector[],
  hoveredKeyId: string | null,
): { readonly total: number; readonly destinations: ReadonlyMap<string, number> } {
  const destinations = new Map<string, number>();
  if (hoveredKeyId === null) return { total: 0, destinations };

  let total = 0;
  for (const vector of vectors) {
    if (!vector.fromKeyIds.includes(hoveredKeyId)) continue;
    total += vector.weight;
    for (const keyId of vector.toKeyIds) {
      destinations.set(keyId, (destinations.get(keyId) ?? 0) + vector.weight);
    }
  }
  return { total, destinations };
}

function badgeWidth(text: string): number {
  return Math.max(18, 8 + text.length * 6);
}

function KeyboardFlow({
  geometry,
  layout,
  vectors,
  repeatCounts,
  maxWeight,
  selectedFingers,
  lineScale,
  layerOrder,
  hoverScale,
}: {
  geometry: Geometry;
  layout: Layout;
  vectors: readonly BigramVector[];
  repeatCounts: ReadonlyMap<string, number>;
  maxWeight: number;
  selectedFingers: readonly FingerClass[];
  lineScale: KeyboardFlowWeightScale;
  layerOrder: KeyboardFlowLayerOrder;
  hoverScale: KeyboardFlowHoverScale;
}) {
  const reduceMotion = useReducedMotion();
  const keys = useMemo(() => geometry.grid.flat(), [geometry]);
  const keyBounds = useMemo(() => bounds(keys), [keys]);
  const [hoveredKeyId, setHoveredKeyId] = useState<string | null>(null);
  const width = PAD * 2 + (keyBounds.maxX - keyBounds.minX) * SCALE;
  const height = PAD * 2 + (keyBounds.maxY - keyBounds.minY) * SCALE;
  // 重ね順（layerOrder）は見た目だけの設定なので、抽出済みvectorをここで並べ替える。
  const allFlowVectors = useMemo(
    () => orderKeyboardFlowVectors(vectors, layerOrder),
    [vectors, layerOrder],
  );
  const hoverCounts = useMemo(
    () => outgoingCounts(allFlowVectors, hoveredKeyId),
    [allFlowVectors, hoveredKeyId],
  );
  const keyMaxWeight = useMemo(
    () => computeOutgoingMaxWeight(allFlowVectors, hoveredKeyId),
    [allFlowVectors, hoveredKeyId],
  );
  const gradientIndexById = useMemo(
    () => new Map(allFlowVectors.map((vector, index) => [vector.id, index] as const)),
    [allFlowVectors],
  );
  const showRollDirection = selectedFingers.length === 2;

  return (
    <div className="flow-stage">
      <svg
        className="flow-keyboard-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="キーボード上の打鍵の流れ"
      >
        <g className="flow-key-layer">
          {keys.map((key) => {
            const point = chartPoint(key, keyBounds.minX, keyBounds.minY);
            const keyClass = key.finger[1] === 'P'
              ? 'pinky'
              : key.finger[1] === 'R'
                ? 'ring'
                : key.finger[1] === 'M'
                  ? 'middle'
                  : key.finger[1] === 'I'
                    ? 'index'
                    : undefined;
            const selected = keyClass !== undefined && selectedFingers.includes(keyClass);
            const label = layout.legends.get(key.id) ?? key.id;
            return (
              <g
                className="flow-key"
                data-key-id={key.id}
                data-selected={selected || undefined}
                data-hovered={hoveredKeyId === key.id || undefined}
                key={key.id}
                transform={`translate(${point.x} ${point.y})`}
                onPointerEnter={() => setHoveredKeyId(key.id)}
                onPointerLeave={() => setHoveredKeyId((current) => current === key.id ? null : current)}
              >
                <rect x="-21" y="-19" width="42" height="38" rx="8" />
                <text y="1" textAnchor="middle" dominantBaseline="middle">
                  {label.length > 3 ? label.slice(0, 3) : label}
                </text>
                <text className="flow-key-id" y="13" textAnchor="middle">
                  {key.id}
                </text>
              </g>
            );
          })}
        </g>

        <defs>
          {allFlowVectors.map((vector, index) => {
            const from = chartPoint(vector.from, keyBounds.minX, keyBounds.minY);
            const to = chartPoint(vector.to, keyBounds.minX, keyBounds.minY);
            const color = FLOW_COLORS[edgeKind(vector, showRollDirection)];
            return (
              <linearGradient
                id={`flow-gradient-${index}`}
                key={`gradient-${vector.id}`}
                gradientUnits="userSpaceOnUse"
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
              >
                <stop offset="0%" stopColor={color} stopOpacity="0.16" />
                <stop offset="100%" stopColor={color} stopOpacity="0.96" />
              </linearGradient>
            );
          })}
        </defs>

        <g className="flow-vector-layer">
          <AnimatePresence initial={false}>
            {allFlowVectors.map((vector) => {
              const effectiveMaxWeight = resolveKeyboardFlowMaxWeight(
                vector,
                maxWeight,
                keyMaxWeight,
                hoverScale,
                hoveredKeyId,
              );
              const strength = scaleKeyboardFlowWeight(vector.weight, effectiveMaxWeight, lineScale);
              const gradientIndex = gradientIndexById.get(vector.id);
              const hoverVisible = hoveredKeyId === null || vector.fromKeyIds.includes(hoveredKeyId);
              return (
                <motion.path
                  key={vector.id}
                  className="flow-edge"
                  data-flow-edge="true"
                  data-flow-hand={vector.hand}
                  data-flow-weight={vector.weight}
                  data-from-keys={vector.fromKeyIds.join('+')}
                  data-to-keys={vector.toKeyIds.join('+')}
                  d={edgePath(vector, keyBounds.minX, keyBounds.minY)}
                  fill="none"
                  stroke={gradientIndex === undefined ? FLOW_COLORS.cross : `url(#flow-gradient-${gradientIndex})`}
                  strokeWidth={0.45 + 6.1 * strength}
                  initial={reduceMotion ? false : { opacity: 0, pathLength: 0 }}
                  animate={{ opacity: hoverVisible ? (hoveredKeyId === null ? 0.72 : 0.96) : 0.035, pathLength: 1 }}
                  transition={reduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 210, damping: 28, mass: 0.7 }}
                >
                  <title>
                    {`${vector.fromKeyIds.join('+')} → ${vector.toKeyIds.join('+')} · ${vector.weight}回`}
                  </title>
                </motion.path>
              );
            })}
          </AnimatePresence>
        </g>

        <g className="flow-overlay-layer" aria-hidden="true">
          {keys.map((key) => {
            const point = chartPoint(key, keyBounds.minX, keyBounds.minY);
            const hoverCount = hoveredKeyId === key.id
              ? hoverCounts.total
              : hoverCounts.destinations.get(key.id);
            const repeatCount = repeatCounts.get(key.id);
            const badgeText = hoveredKeyId !== null
              ? (hoverCount === undefined || hoverCount === 0 ? undefined : String(hoverCount))
              : (repeatCount === undefined ? undefined : `×${repeatCount}`);
            if (badgeText === undefined) return null;
            const width = badgeWidth(badgeText);
            return (
              <g
                className={hoveredKeyId === null ? 'flow-key-badge flow-repeat-badge' : 'flow-key-badge'}
                key={`badge-${key.id}`}
                transform={`translate(${point.x + 15 - width / 2} ${point.y - 18})`}
              >
                <rect x="0" y="-8" width={width} height="15" rx="7.5" />
                <text x={width / 2} y="0" dominantBaseline="middle" textAnchor="middle">
                  {badgeText}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="flow-legend" aria-hidden="true">
        {showRollDirection ? (
          <>
            <span><i className="flow-dot flow-dot-inward" /> inward</span>
            <span><i className="flow-dot flow-dot-outward" /> outward</span>
            <span><i className="flow-dot flow-dot-cross" /> Cross-hand</span>
          </>
        ) : (
          <>
            <span><i className="flow-dot flow-dot-left" /> Left</span>
            <span><i className="flow-dot flow-dot-right" /> Right</span>
            <span><i className="flow-dot flow-dot-cross" /> Cross-hand</span>
          </>
        )}
        <span className="flow-coverage">
          線 {allFlowVectors.length}本 · 同じキーの連打 {repeatCounts.size}キー
          {hoveredKeyId === null ? '' : ` · このキーから出る打鍵 ${hoverCounts.total}回`}
        </span>
      </div>
    </div>
  );
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function smoothClosedPath(points: readonly Point[]): string {
  if (points.length < 3) return '';
  const count = points.length;
  const point = (index: number) => points[(index + count) % count];
  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < count; index++) {
    const p0 = point(index - 1);
    const p1 = point(index);
    const p2 = point(index + 1);
    const p3 = point(index + 2);
    const c1 = {
      x: p1.x + (p2.x - p0.x) / 6,
      y: p1.y + (p2.y - p0.y) / 6,
    };
    const c2 = {
      x: p2.x - (p3.x - p1.x) / 6,
      y: p2.y - (p3.y - p1.y) / 6,
    };
    path += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return `${path} Z`;
}

function MovementProfilePlot({
  hand,
  profile,
  maxDistance,
  maxVectorWeight,
  scaleMode,
  bandwidthDegrees,
  polarGain,
  sharedHalfSize,
}: {
  hand: 'left' | 'right';
  profile: BigramFlowHandProfile;
  maxDistance: number;
  maxVectorWeight: number;
  scaleMode: MovementScaleMode;
  bandwidthDegrees: number;
  polarGain: number;
  sharedHalfSize: number;
}) {
  const reduceMotion = useReducedMotion();
  const { relative, summary, mean, density } = profile;
  const scale = movementPlotScale(maxDistance, scaleMode);
  const {
    scaleMax,
    unitsPerSvgUnit,
    plotRadius,
    polarBaseRadius,
    polarAmplitude,
  } = scale;
  // 外周余白だけを整数SVG unitへ切り上げ、extent更新時のサブピクセル再配置を避ける。
  // data座標・u scale・KDE値は丸めない。
  const halfSize = Math.ceil(sharedHalfSize);
  const viewSize = halfSize * 2;
  const originX = 0;
  const originY = 0;
  const meanEnd = {
    x: mean.x * unitsPerSvgUnit,
    y: mean.y * unitsPerSvgUnit,
  };
  const polarPoints = density.samples.map((sample) =>
    polarPoint(
      originX,
      originY,
      polarBaseRadius + sample.density * polarAmplitude * polarGain,
      sample.angle,
    )
  );
  const polarPath = smoothClosedPath(polarPoints);
  const rollTotal = summary.inwardWeight + summary.outwardWeight;
  const inwardRate = rollTotal === 0 ? 0 : summary.inwardWeight / rollTotal;
  const outwardRate = rollTotal === 0 ? 0 : summary.outwardWeight / rollTotal;

  return (
    <div className="flow-mini-panel flow-profile-panel">
      <header>
        <strong>{hand === 'left' ? 'Left' : 'Right'}</strong>
        <span>
          {relative.length}件 · 平均移動 {mean.distance.toFixed(2)}u ·{' '}
          <span
            className="flow-direction-cohesion"
            title="0に近いほど方向が分散し、1に近いほど同じ方向へ集中します"
          >
            方向のまとまり {summary.magnitude.toFixed(2)}
          </span>
        </span>
      </header>
      <div className="flow-profile-viewport">
        <div
          className="flow-profile-stage"
          style={{ width: viewSize, height: viewSize }}
        >
        <svg
          className="flow-profile-svg"
          data-scale-mode={scaleMode}
          width={viewSize}
          height={viewSize}
          viewBox={`${-halfSize} ${-halfSize} ${viewSize} ${viewSize}`}
          role="img"
          aria-label={`${hand === 'left' ? '左手' : '右手'}の移動の向きと距離`}
        >
        <circle
          className="direction-polar-baseline"
          cx={originX}
          cy={originY}
          r={polarBaseRadius}
        />
        {polarPath ? <path className="direction-polar-shape" d={polarPath} /> : null}

        {Array.from({ length: scaleMax }, (_, index) => index + 1).map((unit) => {
          const ringRadius = unit * unitsPerSvgUnit;
          return (
            <g key={unit}>
              <circle className="flow-axis-ring" cx={originX} cy={originY} r={ringRadius} />
              <text
                className="flow-axis-ring-label"
                x={originX + 4}
                y={originY - ringRadius + 11}
              >
                {unit}u
              </text>
            </g>
          );
        })}
        <line
          className="flow-axis"
          x1={originX - plotRadius - 12}
          y1={originY}
          x2={originX + plotRadius + 12}
          y2={originY}
        />
        <line
          className="flow-axis"
          x1={originX}
          y1={originY - plotRadius - 12}
          x2={originX}
          y2={originY + plotRadius + 12}
        />

        <g className="actual-vector-layer">
          <AnimatePresence initial={false}>
            {relative.map((vector: RelativeVector) => {
              const direction = vector.fingerDirection ?? 'same';
              const strength = weightScale(vector.weight, maxVectorWeight);
              return (
                <motion.line
                  key={vector.id}
                  className={`relative-vector relative-vector-${direction}`}
                  x1={originX}
                  y1={originY}
                  initial={reduceMotion ? false : { x2: originX, y2: originY, opacity: 0 }}
                  animate={{
                    x2: vector.dx * unitsPerSvgUnit,
                    y2: vector.dy * unitsPerSvgUnit,
                    opacity: 0.24 + 0.7 * strength,
                  }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  strokeWidth={0.85 + 2.45 * strength}
                  transition={reduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 240, damping: 27 }}
                >
                  <title>
                    {`${vector.fromFingerClass} → ${vector.toFingerClass} · ${direction} · dx ${vector.dx.toFixed(2)}, dy ${vector.dy.toFixed(2)} · ${vector.weight}回`}
                  </title>
                </motion.line>
              );
            })}
          </AnimatePresence>
        </g>

        <motion.line
          className="mean-displacement"
          x1={originX}
          y1={originY}
          animate={{
            x2: meanEnd.x,
            y2: meanEnd.y,
            opacity: mean.totalWeight === 0 ? 0 : 1,
          }}
          transition={reduceMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 170, damping: 22 }}
        />
        <motion.circle
          className="mean-endpoint"
          r="3.2"
          animate={{
            cx: meanEnd.x,
            cy: meanEnd.y,
            opacity: mean.totalWeight === 0 ? 0 : 1,
          }}
          transition={reduceMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 170, damping: 22 }}
        />
          <circle className="flow-origin" cx={originX} cy={originY} r="4" />
        </svg>
        </div>
      </div>

      <div className="flow-roll-legend flow-profile-legend" aria-hidden="true">
        <span><i className="flow-dot flow-dot-inward" /> 内向き</span>
        <span><i className="flow-dot flow-dot-outward" /> 外向き</span>
        <span className="flow-profile-scale-summary">
          {scaleMode === 'fit' ? '自動調整' : '固定スケール'} · 最大{scaleMax}u · ±{bandwidthDegrees}°
        </span>
      </div>

      <div className="roll-summary">
        <div className="roll-bar" aria-label="内向きと外向きの割合">
          {hand === 'left' ? (
            <>
              <motion.span
                className="roll-outward"
                animate={{ width: `${outwardRate * 100}%` }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 190, damping: 24 }}
              />
              <motion.span
                className="roll-inward"
                animate={{ width: `${inwardRate * 100}%` }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 190, damping: 24 }}
              />
            </>
          ) : (
            <>
              <motion.span
                className="roll-inward"
                animate={{ width: `${inwardRate * 100}%` }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 190, damping: 24 }}
              />
              <motion.span
                className="roll-outward"
                animate={{ width: `${outwardRate * 100}%` }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 190, damping: 24 }}
              />
            </>
          )}
        </div>
        <div>
          {hand === 'left' ? (
            <>
              <span>外向き {(outwardRate * 100).toFixed(1)}%</span>
              <span>内向き {(inwardRate * 100).toFixed(1)}%</span>
            </>
          ) : (
            <>
              <span>内向き {(inwardRate * 100).toFixed(1)}%</span>
              <span>外向き {(outwardRate * 100).toFixed(1)}%</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FingerControls({
  selected,
  onToggle,
}: {
  selected: readonly FingerClass[];
  onToggle: (finger: FingerClass) => void;
}) {
  return (
    <div className="flow-finger-buttons" role="group" aria-label="指の組み合わせ">
      {FINGER_OPTIONS.map((finger) => {
        const active = selected.includes(finger.id);
        const blocked = selected.length >= 2 && !active;
        return (
          <motion.button
            type="button"
            key={finger.id}
            aria-pressed={active}
            disabled={blocked}
            data-active={active || undefined}
            onClick={() => onToggle(finger.id)}
            whileHover={blocked ? undefined : { y: -2 }}
            whileTap={blocked ? undefined : { scale: 0.94 }}
          >
            {finger.label}
          </motion.button>
        );
      })}
    </div>
  );
}

export interface BigramFlowVisualizationProps {
  layout: Layout;
  geometry: Geometry;
  trace: Trace;
  extracted: BigramFlowExtracted;
  options: BigramFlowOptions;
  onOptionsChange(next: BigramFlowOptions): void;
}

/**
 * Bigram Flowの可視化component（`docs/architecture.md`の「可視化」）。
 * `extracted`（`extract.ts`の計算結果）と見た目だけの設定を描くだけで、
 * Trace・vectorそのものからの再計算はしない。
 */
export function BigramFlowVisualization({
  layout,
  geometry,
  trace,
  extracted,
  options,
  onOptionsChange,
}: BigramFlowVisualizationProps) {
  const {
    source,
    selectedFingers,
    lineScale,
    layerOrder,
    hoverScale,
    movementScaleMode,
    polarBandwidth,
    polarGain,
  } = options;

  const toggleFinger = (finger: FingerClass) => {
    const nextSelectedFingers = selectedFingers.includes(finger)
      ? selectedFingers.filter((candidate) => candidate !== finger)
      : selectedFingers.length >= 2
        ? selectedFingers
        : [...selectedFingers, finger];
    if (nextSelectedFingers === selectedFingers) return;
    onOptionsChange({ ...options, selectedFingers: nextSelectedFingers });
  };

  const movementScale = movementPlotScale(extracted.relativeMaxDistance, movementScaleMode);
  const sharedMovementHalfSize = movementPlotExtent(
    movementScale,
    extracted.sharedMaxDensity,
    polarGain,
  );

  return (
    <section
      className="flow-feature"
      data-react-feature="bigram-flow"
      data-layout-id={layout.id}
      data-geometry-id={geometry.id}
      data-line-scale={lineScale}
      data-layer-order={layerOrder}
      data-hover-scale={hoverScale}
      data-movement-scale-mode={movementScaleMode}
      data-polar-bandwidth={polarBandwidth}
      data-polar-gain={polarGain}
    >
      <div className="flow-analysis-heading">
        <div>
          <h2>Bigram Flow</h2>
        </div>
        <p>
          選んだテキストを打った時に、続けて打つ2打鍵で指がキーボード上をどう動くかを描く。
          配列・物理形状・指の割当は上で選んだ条件のまま使う。
        </p>
      </div>

      <section className="flow-controls" aria-label="Bigram Flowの表示設定">
        <div className="flow-control-group">
          <span>Bigram</span>
          <div className="flow-segmented" role="group" aria-label="2打鍵の取り方">
            {(['actual', 'within-hand'] as const).map((candidate) => (
              <button
                type="button"
                key={candidate}
                aria-pressed={source === candidate}
                data-active={source === candidate || undefined}
                onClick={() => onOptionsChange({ ...options, source: candidate })}
              >
                {candidate === 'actual' ? 'Actual' : 'Within-hand'}
              </button>
            ))}
          </div>
        </div>

        <div className="flow-control-group">
          <span>Fingers</span>
          <FingerControls selected={selectedFingers} onToggle={toggleFinger} />
        </div>

        <label className="flow-control-group">
          <span>紐の太さ</span>
          <select
            aria-label="紐の太さのスケール"
            value={lineScale}
            onChange={(event) => onOptionsChange({ ...options, lineScale: event.currentTarget.value as KeyboardFlowWeightScale })}
          >
            <option value="linear">線形</option>
            <option value="sqrt">平方根</option>
            <option value="log">対数</option>
          </select>
        </label>

        <label className="flow-control-group">
          <span>重ね順</span>
          <select
            aria-label="紐の重ね順"
            value={layerOrder}
            onChange={(event) => onOptionsChange({ ...options, layerOrder: event.currentTarget.value as KeyboardFlowLayerOrder })}
          >
            <option value="weight">重みの順</option>
            <option value="same-hand-top">同手を上</option>
            <option value="cross-hand-top">逆手を上</option>
          </select>
        </label>

        <label className="flow-control-group flow-checkbox-row">
          <input
            type="checkbox"
            checked={hoverScale === 'key'}
            onChange={(event) => onOptionsChange({ ...options, hoverScale: event.currentTarget.checked ? 'key' : 'global' })}
          />
          <span>ホバー中はそのキーの線だけで太さを決める</span>
        </label>
      </section>

      <div className="flow-status">
        <span>{layout.name}</span>
        <span>{geometry.name}</span>
        <span>{source === 'actual' ? '実際に続けて打った2打鍵' : '反対の手の打鍵を飛ばして、同じ手で続けた2打鍵'}</span>
        <span>移動 {extracted.rawCount.toLocaleString()}回</span>
        {trace.skipped > 0 ? <span>打てずに飛ばした文字 {trace.skipped}</span> : null}
      </div>

      <section className="flow-block">
        <header className="flow-block-header">
          <div>
            <p className="eyebrow">Absolute</p>
            <h2>Keyboard Flow</h2>
          </div>
          <p>
            キーからキーへの移動を線で描き、太さで回数を表す。線は始点が薄く、終点が濃い。
            キーにポインタを乗せると、そのキーから出る線を強調する。
          </p>
        </header>
        <KeyboardFlow
          geometry={geometry}
          layout={layout}
          vectors={extracted.keyboardFlow.vectors}
          repeatCounts={extracted.keyboardFlow.repeatCounts}
          maxWeight={extracted.keyboardFlow.maxWeight}
          selectedFingers={selectedFingers}
          lineScale={lineScale}
          layerOrder={layerOrder}
          hoverScale={hoverScale}
        />
      </section>

      <AnimatePresence initial={false}>
        <motion.section
          className="flow-analysis"
          key={selectedFingers.length === 0 ? 'all' : selectedFingers.slice().sort().join('-')}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ type: 'spring', stiffness: 180, damping: 24 }}
        >
          <div className="flow-analysis-heading">
            <div>
              <p className="eyebrow">Vector analysis</p>
              <h2>
                {selectedFingers.length === 0
                  ? '全指'
                  : selectedFingers.map((selected) =>
                    FINGER_OPTIONS.find((finger) => finger.id === selected)?.label
                  ).join(' + ')}
              </h2>
            </div>
            <p>
              {selectedFingers.length === 0
                ? '同じ指の移動と、指をまたいだ打鍵位置の移動をまとめて表示する。大半は後者なので、手の中で打鍵位置がどう流れるかを見る図になる。'
                : selectedFingers.length === 1
                  ? '1指選択では、その指自身のキー間移動だけを表示する。'
                  : '2指選択では押し順を固定せず、両方向の指間移動を表示する。'}
            </p>
          </div>

          <section className="flow-block">
            <header className="flow-block-header">
              <div>
                <p className="eyebrow">Movement profile</p>
                <h2>Relative vectors</h2>
              </div>
              <p>
                打鍵ごとの移動方向と距離を表示します。
                外周は移動方向の分布、白線は平均的な移動を表します。
              </p>
            </header>
            <div className="flow-profile-controls" aria-label="移動の向きと距離の表示設定">
              <label>
                <span>距離表示</span>
                <select
                  aria-label="距離表示"
                  value={movementScaleMode}
                  onChange={(event) => onOptionsChange({ ...options, movementScaleMode: event.currentTarget.value as MovementScaleMode })}
                >
                  <option value="fit">自動調整</option>
                  <option value="fixed">固定スケール</option>
                </select>
                <small>
                  {movementScaleMode === 'fit'
                    ? '現在のデータを見やすい大きさに調整'
                    : '解析対象を変えても同じ距離を同じ長さで表示'}
                </small>
              </label>
              <label>
                <span>方向の広がり <output>±{polarBandwidth}°</output></span>
                <input
                  type="range"
                  min={MIN_POLAR_BANDWIDTH_DEGREES}
                  max="45"
                  step="1"
                  value={polarBandwidth}
                  aria-label="方向の広がり"
                  onChange={(event) => onOptionsChange({ ...options, polarBandwidth: Number(event.currentTarget.value) })}
                />
              </label>
              <label>
                <span>方向分布の表示倍率 <output>{polarGain.toFixed(1)}×</output></span>
                <input
                  type="range"
                  min="0.25"
                  max="3"
                  step="0.05"
                  value={polarGain}
                  aria-label="方向分布の表示倍率"
                  onChange={(event) => onOptionsChange({ ...options, polarGain: Number(event.currentTarget.value) })}
                />
              </label>
              <button
                type="button"
                className="flow-profile-reset"
                onClick={() => onOptionsChange({
                  ...options,
                  movementScaleMode: 'fit',
                  polarBandwidth: 5,
                  polarGain: 1,
                })}
              >
                標準に戻す
              </button>
            </div>
            <div className="flow-two-up">
              <MovementProfilePlot
                hand="left"
                profile={extracted.hands.left}
                maxDistance={extracted.relativeMaxDistance}
                maxVectorWeight={extracted.relativeMaxWeight}
                scaleMode={movementScaleMode}
                bandwidthDegrees={polarBandwidth}
                polarGain={polarGain}
                sharedHalfSize={sharedMovementHalfSize}
              />
              <MovementProfilePlot
                hand="right"
                profile={extracted.hands.right}
                maxDistance={extracted.relativeMaxDistance}
                maxVectorWeight={extracted.relativeMaxWeight}
                scaleMode={movementScaleMode}
                bandwidthDegrees={polarBandwidth}
                polarGain={polarGain}
                sharedHalfSize={sharedMovementHalfSize}
              />
            </div>
            {source === 'actual' && extracted.hasCrossHandInAnalysis ? (
              <p className="flow-footnote">
                左右の手をまたぐ2打鍵は、Keyboard Flowには含めるが、Relative vectorsからは除く。
              </p>
            ) : null}
          </section>
        </motion.section>
      </AnimatePresence>

      <p className="flow-footnote">
        方向と距離は観測値であり、配列の優劣を判定するスコアではない。
      </p>
    </section>
  );
}

/** engineの契約（純粋）と可視化componentの結び付け。将来hostsがこれを載せる想定。 */
export const bigramFlowAnalyzer = {
  definition: bigramFlowDefinition,
  View: BigramFlowVisualization,
};
