import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Geometry, Key, Point } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { Trace } from '#trace/generate.ts';
import type { BigramVector, FingerClass, RelativeVector } from './bigram-vectors.ts';
import { bigramFlowDefinition, type BigramFlowExtracted, type BigramFlowHandProfile } from './extract.ts';
import {
  MIN_POLAR_BANDWIDTH_DEGREES,
  movementPlotScale,
} from './movement-profile-scale.ts';
import {
  computeOutgoingMaxWeight,
  DEFAULT_BIGRAM_FLOW_OPTIONS,
  orderKeyboardFlowVectors,
  resolveKeyboardFlowMaxWeight,
  scaleKeyboardFlowWeight,
  type BigramFlowOptions,
  type KeyboardFlowHoverScale,
  type KeyboardFlowLayerOrder,
  type KeyboardFlowWeightScale,
} from './options.ts';
import {
  bindOption,
  CheckboxOptionField,
  OptionField,
  OptionGroup,
  RangeOptionField,
  SegmentedOptionField,
  SelectOptionField,
  type OptionBinding,
} from '#ui/primitives/option-fields.tsx';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import {
  AREA_HEIGHT,
  AREA_WIDTH,
  fitKeyboardToArea,
  flowLineWidth,
  KEY_PITCH,
  repeatLabelScale,
} from './keyboard-flow-area.ts';
import { BIGRAM_FLOW_PANE_META } from './pane-meta.ts';
import type { AnalyzerPaneParts, AnalyzerSettingsProps } from '../pane-parts.tsx';
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
 * 本体（`BigramFlowBody`）と解析設定（`BigramFlowSettings`）は置かれる場所を知らない。
 * 見出し・説明・配列名・戻す操作・URLはホストが持つ（docs/architecture.md「Analyzerがペインに渡すもの」）。
 */

const FINGER_OPTIONS: readonly { id: FingerClass; label: string }[] = [
  { id: 'index', label: '人' },
  { id: 'middle', label: '中' },
  { id: 'ring', label: '薬' },
  { id: 'pinky', label: '小' },
];
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

/**
 * minX/minYは「エリアの左上(0,0)に対応する物理座標」。キー中心の最小値からエリア中央へ寄せる
 * ぶんだけずらした値を渡す（`KeyboardFlow`の`origin`）。縮尺は全物理配列で共通。
 */
function chartPoint(point: Point, minX: number, minY: number) {
  return {
    x: (point.x - minX) * KEY_PITCH,
    y: (point.y - minY) * KEY_PITCH,
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

/** 要素の表示幅（px）。0は未計測。 */
function useElementWidth(): [RefObject<SVGSVGElement | null>, number] {
  const ref = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
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
  // 描画エリアは物理配列によらず固定。キーボードは中央に置き、自作の物理配列が収まらない時だけ縮める。
  const fit = useMemo(
    () => fitKeyboardToArea(keyBounds.maxX - keyBounds.minX, keyBounds.maxY - keyBounds.minY),
    [keyBounds],
  );
  const origin = useMemo(
    () => ({
      minX: keyBounds.minX - fit.originX / KEY_PITCH,
      minY: keyBounds.minY - fit.originY / KEY_PITCH,
    }),
    [keyBounds, fit],
  );
  const [stageRef, stageWidth] = useElementWidth();
  // 画面上のSVG幅 / ユーザー座標の幅（自作配列を縮めた分も含める）。縮んだ時に線と連打ラベルだけを読める大きさに保つのに使う。
  const zoom = stageWidth > 0 ? (stageWidth / AREA_WIDTH) * fit.shrink : fit.shrink;
  const badgeScale = repeatLabelScale(zoom);
  const areaCenterX = AREA_WIDTH / 2;
  const areaCenterY = AREA_HEIGHT / 2;
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
        ref={stageRef}
        className="flow-keyboard-svg"
        viewBox={`0 0 ${AREA_WIDTH} ${AREA_HEIGHT}`}
        role="img"
        aria-label="キーボード上の打鍵の流れ"
      >
        {/* 自作の物理配列がエリアに収まらない時だけshrinkが1未満。エリアの中心を軸に縮める。 */}
        <g
          data-flow-shrink={fit.shrink}
          transform={fit.shrink === 1
            ? undefined
            : `translate(${areaCenterX} ${areaCenterY}) scale(${fit.shrink}) translate(${-areaCenterX} ${-areaCenterY})`}
        >
        <g className="flow-key-layer">
          {keys.map((key) => {
            const point = chartPoint(key, origin.minX, origin.minY);
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
            const from = chartPoint(vector.from, origin.minX, origin.minY);
            const to = chartPoint(vector.to, origin.minX, origin.minY);
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
                  d={edgePath(vector, origin.minX, origin.minY)}
                  fill="none"
                  stroke={gradientIndex === undefined ? FLOW_COLORS.cross : `url(#flow-gradient-${gradientIndex})`}
                  strokeWidth={flowLineWidth((0.45 + 6.1 * strength), zoom)}
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
            const point = chartPoint(key, origin.minX, origin.minY);
            // 数字の意味は常に「ホバー元 → そのキー」の回数に揃える。
            // ホバー元自身は線が無い（repeatは線から除外済み）ので、repeat回数を出す。
            // 出発の合計はここに出さず、下部の「このキーから出る打鍵」で読ませる。
            const repeatCount = repeatCounts.get(key.id);
            const count = hoveredKeyId === null || hoveredKeyId === key.id
              ? repeatCount
              : hoverCounts.destinations.get(key.id);
            const badgeText = count === undefined || count === 0 ? undefined : String(count);
            if (badgeText === undefined) return null;
            const width = badgeWidth(badgeText);
            return (
              <g
                className={hoveredKeyId === null || hoveredKeyId === key.id ? 'flow-key-badge flow-repeat-badge' : 'flow-key-badge'}
                key={`badge-${key.id}`}
                // 縮んでも同キー連打のラベルだけは読めるよう、バッジの中心を軸に拡大する。
                transform={`translate(${point.x + 15} ${point.y - 18}) scale(${badgeScale}) translate(${-width / 2} 0)`}
              >
                <rect x="0" y="-8" width={width} height="15" rx="7.5" />
                <text x={width / 2} y="0" dominantBaseline="middle" textAnchor="middle">
                  {badgeText}
                </text>
              </g>
            );
          })}
        </g>
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
  bandwidthDegrees,
  polarGain,
}: {
  hand: 'left' | 'right';
  profile: BigramFlowHandProfile;
  maxDistance: number;
  maxVectorWeight: number;
  bandwidthDegrees: number;
  polarGain: number;
}) {
  const reduceMotion = useReducedMotion();
  const { relative, summary, mean, density } = profile;
  const scale = movementPlotScale(maxDistance);
  const {
    scaleMax,
    unitsPerSvgUnit,
    plotRadius,
    polarBaseRadius,
    polarAmplitude,
  } = scale;
  const halfSize = scale.halfSize;
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
            title="0に近いほど方向が分散し、1に近いほど同じ方向へ集中する"
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
          最大{scaleMax}u · ±{bandwidthDegrees}°
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


const FINGER_SET_HINTS = {
  0: '同じ指の移動と、指をまたいだ打鍵位置の移動をまとめて描く。大半は後者なので、手の中で打鍵位置がどう流れるかを見る図になる。',
  1: '1指選択では、その指自身のキー間移動だけを描く。',
  2: '2指選択では押し順を固定せず、両方向の指間移動を描く。',
} as const;

function fingerSetLabel(selectedFingers: readonly FingerClass[]): string {
  if (selectedFingers.length === 0) return '全指';
  return selectedFingers
    .map((selected) => FINGER_OPTIONS.find((finger) => finger.id === selected)?.label)
    .join(' + ');
}

export interface BigramFlowBodyProps {
  readonly layout: Layout;
  readonly geometry: Geometry;
  readonly trace: Trace;
  readonly extracted: BigramFlowExtracted;
  readonly options: BigramFlowOptions;
  /**
   * 図のそばで開く表示の調整（紐の太さ等）の書き込み先。省略すると調整のボタンを出さない。
   * 値の持ち主は解析設定と同じ1つの`AnalyzerOptions`で、ここは開く場所が増えるだけ。
   */
  readonly onOptionsChange?: (next: BigramFlowOptions) => void;
}

/**
 * 図の読み方。図ごとの小見出しの横のⓘで出す（#641）。常に出す凡例にはしない（狭いペインで図を覆うため）。
 * 操作すれば分かること（キーにポインタを乗せると線を強調する等）は書かない。
 */
const KEYBOARD_FLOW_READING = 'キーからキーへの移動を線で描く。太さが回数で、線は始点が薄く終点が濃い。';
const RELATIVE_VECTORS_READING = '打鍵ごとの移動の向きと距離を、打ち始めのキーを中心に重ねて描く。外周は移動方向の分布、白い線は平均の移動を表す。';

/**
 * Bigram Flowの本体（図）。`extracted`（`extract.ts`の計算結果）と見た目だけの設定を描くだけで、
 * Trace・vectorそのものからの再計算はしない。両方の図に効く解析設定の入力部品は持たない
 * （`BigramFlowSettings`）。図ごとにしか効かない項目だけは、図の見出し行のボタンから図のそばで開く。
 */
export function BigramFlowBody({
  layout,
  geometry,
  trace,
  extracted,
  options,
  onOptionsChange,
}: BigramFlowBodyProps) {
  const {
    source,
    selectedFingers,
    lineScale,
    layerOrder,
    hoverScale,
    polarBandwidth,
    polarGain,
  } = options;

  // 展開の状態は保存しない（再読み込みで閉じる）。閉じるまで開いたまま。
  const [keyboardFlowOpen, setKeyboardFlowOpen] = useState(false);
  const [relativeVectorsOpen, setRelativeVectorsOpen] = useState(false);

  return (
    <section
      className="flow-feature"
      data-react-feature="bigram-flow"
      data-layout-id={layout.id}
      data-geometry-id={geometry.id}
      data-line-scale={lineScale}
      data-layer-order={layerOrder}
      data-hover-scale={hoverScale}
      data-polar-bandwidth={polarBandwidth}
      data-polar-gain={polarGain}
    >
      {/* 表示中のデータに付く数（何組を描いたか・何を飛ばしたか）だけを置く。配列名などの条件は見出しと条件の要約が出す。 */}
      <p className="flow-status">
        <span>2打鍵 {extracted.rawCount.toLocaleString()}組</span>
        {trace.skipped > 0 ? <span>打てずに飛ばした文字 {trace.skipped}</span> : null}
      </p>

      <section className="flow-block" aria-label="Keyboard Flow">
        <div className="flow-block-heading">
          <h3 className="flow-block-title">Keyboard Flow</h3>
          <InfoButton name="Keyboard Flow" description={KEYBOARD_FLOW_READING} />
          {onOptionsChange !== undefined ? (
            <FigureSettingsToggle
              name="Keyboard Flow"
              open={keyboardFlowOpen}
              onToggle={() => setKeyboardFlowOpen(!keyboardFlowOpen)}
            />
          ) : null}
        </div>
        {onOptionsChange !== undefined && keyboardFlowOpen ? (
          <KeyboardFlowFigureSettings options={options} onOptionsChange={onOptionsChange} />
        ) : null}
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
          className="flow-block flow-analysis"
          aria-label="Relative vectors"
          key={selectedFingers.length === 0 ? 'all' : selectedFingers.slice().sort().join('-')}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ type: 'spring', stiffness: 180, damping: 24 }}
        >
          <div className="flow-block-heading">
            <h3 className="flow-block-title">
              Relative vectors <span className="flow-block-subject">{fingerSetLabel(selectedFingers)}</span>
            </h3>
            <InfoButton name="Relative vectors" description={RELATIVE_VECTORS_READING} />
            {onOptionsChange !== undefined ? (
              <FigureSettingsToggle
                name="Relative vectors"
                open={relativeVectorsOpen}
                onToggle={() => setRelativeVectorsOpen(!relativeVectorsOpen)}
              />
            ) : null}
          </div>
          {onOptionsChange !== undefined && relativeVectorsOpen ? (
            <RelativeVectorsFigureSettings options={options} onOptionsChange={onOptionsChange} />
          ) : null}
          <div className="flow-two-up">
            <MovementProfilePlot
              hand="left"
              profile={extracted.hands.left}
              maxDistance={extracted.relativeMaxDistance}
              maxVectorWeight={extracted.relativeMaxWeight}
              bandwidthDegrees={polarBandwidth}
              polarGain={polarGain}
            />
            <MovementProfilePlot
              hand="right"
              profile={extracted.hands.right}
              maxDistance={extracted.relativeMaxDistance}
              maxVectorWeight={extracted.relativeMaxWeight}
              bandwidthDegrees={polarBandwidth}
              polarGain={polarGain}
            />
          </div>
          {source === 'actual' && extracted.hasCrossHandInAnalysis ? (
            <p className="flow-footnote">
              左右の手をまたぐ2打鍵は、Keyboard Flowには含めるが、Relative vectorsからは除く。
            </p>
          ) : null}
        </motion.section>
      </AnimatePresence>
    </section>
  );
}

/** 指の組み合わせ（0〜2本）。3本目は選べないので、2本選んだら残りを押せなくする。 */
function FingerOptionField({ binding }: { binding: OptionBinding<readonly FingerClass[]> }) {
  const selected = binding.value;
  const toggle = (finger: FingerClass) => {
    if (selected.includes(finger)) {
      binding.onChange(selected.filter((candidate) => candidate !== finger));
    } else if (selected.length < 2) {
      binding.onChange([...selected, finger]);
    }
  };
  return (
    <OptionField label="指の組み合わせ" binding={binding} hint={FINGER_SET_HINTS[selected.length as 0 | 1 | 2]}>
      {(id) => (
        <div className="option-segmented flow-finger-buttons" role="group" id={id} aria-labelledby={`${id}-label`}>
          {FINGER_OPTIONS.map((finger) => {
            const active = selected.includes(finger.id);
            return (
              <button
                type="button"
                key={finger.id}
                aria-pressed={active}
                disabled={selected.length >= 2 && !active}
                onClick={() => toggle(finger.id)}
              >
                {finger.label}
              </button>
            );
          })}
        </div>
      )}
    </OptionField>
  );
}

const bindBigramFlowOption = <K extends keyof BigramFlowOptions>(
  options: BigramFlowOptions,
  onOptionsChange: (next: BigramFlowOptions) => void,
  key: K,
) => bindOption(options, DEFAULT_BIGRAM_FLOW_OPTIONS, onOptionsChange, key);

/**
 * Bigram Flowのペインの解析設定。両方の図に効く入力（2打鍵の取り方・指）だけを置く。
 * 図ごとにしか効かない項目は、その図のそばで開く（`FigureSettingsToggle`）。
 */
export function BigramFlowSettings({ options, onOptionsChange }: AnalyzerSettingsProps<BigramFlowOptions>) {
  const bind = <K extends keyof BigramFlowOptions>(key: K) => bindBigramFlowOption(options, onOptionsChange, key);
  return (
    <div className="option-groups">
      <OptionGroup title="描く2打鍵">
        <SegmentedOptionField
          label="2打鍵の取り方"
          binding={bind('source')}
          choices={[
            { value: 'actual', label: 'Actual' },
            { value: 'within-hand', label: 'Within-hand' },
          ]}
          hint={options.source === 'actual'
            ? '実際に続けて打った2打鍵'
            : '反対の手の打鍵を飛ばして、同じ手で続けた2打鍵'}
        />
        <FingerOptionField binding={bind('selectedFingers')} />
      </OptionGroup>
    </div>
  );
}

/**
 * 図の見出し行の右に置く、その図の表示を調整するボタン。ペインの解析設定のボタンとは別の
 * 目のアイコンにして、押すと見出しの直下へ展開する（小窓ではない）。
 */
function FigureSettingsToggle({ name, open, onToggle }: {
  readonly name: string;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="flow-figure-settings-toggle"
      aria-label={`${name}の表示`}
      title={`${name}の表示を調整する`}
      aria-expanded={open}
      onClick={onToggle}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path
          d="M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  );
}

interface FigureSettingsProps {
  readonly options: BigramFlowOptions;
  readonly onOptionsChange: (next: BigramFlowOptions) => void;
}

function KeyboardFlowFigureSettings({ options, onOptionsChange }: FigureSettingsProps) {
  const bind = <K extends keyof BigramFlowOptions>(key: K) => bindBigramFlowOption(options, onOptionsChange, key);
  return (
    <div className="flow-figure-settings" role="group" aria-label="Keyboard Flowの表示">
      <SelectOptionField
        label="紐の太さ"
        binding={bind('lineScale')}
        choices={[
          { value: 'linear', label: '線形' },
          { value: 'sqrt', label: '平方根' },
          { value: 'log', label: '対数' },
        ]}
      />
      <SelectOptionField
        label="重ね順"
        binding={bind('layerOrder')}
        choices={[
          { value: 'weight', label: '重みの順' },
          { value: 'same-hand-top', label: '同手を上' },
          { value: 'cross-hand-top', label: '逆手を上' },
        ]}
      />
      <CheckboxOptionField
        label="ホバー中はそのキーの線だけで太さを決める"
        binding={{
          value: options.hoverScale === 'key',
          defaultValue: DEFAULT_BIGRAM_FLOW_OPTIONS.hoverScale === 'key',
          onChange: (checked) => onOptionsChange({ ...options, hoverScale: checked ? 'key' : 'global' }),
        }}
      />
    </div>
  );
}

function RelativeVectorsFigureSettings({ options, onOptionsChange }: FigureSettingsProps) {
  const bind = <K extends keyof BigramFlowOptions>(key: K) => bindBigramFlowOption(options, onOptionsChange, key);
  return (
    <div className="flow-figure-settings" role="group" aria-label="Relative vectorsの表示">
      <RangeOptionField
        label="方向の広がり"
        binding={bind('polarBandwidth')}
        min={MIN_POLAR_BANDWIDTH_DEGREES}
        max={45}
        step={1}
        format={(value) => `±${value}°`}
      />
      <RangeOptionField
        label="方向分布の表示倍率"
        binding={bind('polarGain')}
        min={0.25}
        max={3}
        step={0.05}
        format={(value) => `${value.toFixed(1)}×`}
      />
    </div>
  );
}

/**
 * ペインに渡すもの（`analyzers/pane-parts.tsx`）。名前・短い説明はここが正で、
 * ペインの見出し・個別画面のh1・routeの`<title>`はここから読む。
 */
export const bigramFlowAnalyzer = {
  definition: bigramFlowDefinition,
  ...BIGRAM_FLOW_PANE_META,
  Body: BigramFlowBody,
  Settings: BigramFlowSettings,
  defaultOptions: DEFAULT_BIGRAM_FLOW_OPTIONS,
} satisfies AnalyzerPaneParts<typeof bigramFlowDefinition, BigramFlowOptions, BigramFlowBodyProps>;
