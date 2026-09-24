import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  aggregateBigramVectors,
  buildBigramVectors,
  directionSummary,
  filterBigramVectors,
  type BigramSource,
  type BigramVector,
  type FingerClass,
} from '../../bigram-vectors.ts';
import type { Geometry, Key, Point } from '../../geometry.ts';
import type { AnalyzerBigramFlowModel } from '../../analyzer-bigram-flow-model.ts';
import type { Layout } from '../../layouts/types.ts';
import './bigram-vector-view.css';

const FINGER_OPTIONS: readonly { id: FingerClass; label: string }[] = [
  { id: 'index', label: '人' },
  { id: 'middle', label: '中' },
  { id: 'ring', label: '薬' },
  { id: 'pinky', label: '小' },
];
const SCALE = 58;
const PAD = 42;
const FLOW_COLORS = {
  left: '#ff8a66',
  right: '#60a9ff',
  cross: '#a5abb0',
  inward: '#7fc7a4',
  outward: '#c19de9',
  same: '#a5abb0',
} as const;

interface RelativeVector {
  id: string;
  dx: number;
  dy: number;
  weight: number;
  fromFingerClass: FingerClass;
  toFingerClass: FingerClass;
  fingerDirection: BigramVector['fingerDirection'];
}

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

function isStationaryVector(vector: BigramVector): boolean {
  return vector.distance < 1e-6;
}

function keyboardFlowVectors(vectors: readonly BigramVector[]): readonly BigramVector[] {
  return [...vectors]
    .filter((vector) => !isStationaryVector(vector))
    // 細い線を先に、太い線を後に描いて主要connectionを前面へ残す。
    .sort((a, b) => a.weight - b.weight || a.id.localeCompare(b.id));
}

function repeatCountsByKey(vectors: readonly BigramVector[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const vector of vectors) {
    if (!isStationaryVector(vector)) continue;
    const shared = vector.fromKeyIds.filter((keyId) => vector.toKeyIds.includes(keyId));
    for (const keyId of shared) {
      counts.set(keyId, (counts.get(keyId) ?? 0) + vector.weight);
    }
  }
  return counts;
}

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
  selectedFingers,
}: {
  geometry: Geometry;
  layout: Layout;
  vectors: readonly BigramVector[];
  selectedFingers: readonly FingerClass[];
}) {
  const reduceMotion = useReducedMotion();
  const keys = useMemo(() => geometry.grid.flat(), [geometry]);
  const keyBounds = useMemo(() => bounds(keys), [keys]);
  const [hoveredKeyId, setHoveredKeyId] = useState<string | null>(null);
  const width = PAD * 2 + (keyBounds.maxX - keyBounds.minX) * SCALE;
  const height = PAD * 2 + (keyBounds.maxY - keyBounds.minY) * SCALE;
  const allFlowVectors = useMemo(() => keyboardFlowVectors(vectors), [vectors]);
  const repeatCounts = useMemo(() => repeatCountsByKey(vectors), [vectors]);
  const hoverCounts = useMemo(
    () => outgoingCounts(allFlowVectors, hoveredKeyId),
    [allFlowVectors, hoveredKeyId],
  );
  const maxWeight = Math.max(1, ...allFlowVectors.map((vector) => vector.weight));
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
        aria-label="キーボード上のbigramベクトル"
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
              const strength = maxWeight <= 0 ? 0 : vector.weight / maxWeight;
              const gradientIndex = gradientIndexById.get(vector.id);
              const hoverVisible = hoveredKeyId === null || vector.fromKeyIds.includes(hoveredKeyId);
              return (
                <motion.path
                  key={vector.id}
                  className="flow-edge"
                  data-flow-edge="true"
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
              : (repeatCount === undefined ? undefined : `R${repeatCount}`);
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
          {allFlowVectors.length} connections · {repeatCounts.size} repeat keys
          {hoveredKeyId === null ? ' · hover a key' : ` · ${hoverCounts.total} outgoing`}
        </span>
      </div>
    </div>
  );
}

function relativeVectors(
  vectors: readonly BigramVector[],
  hand: 'left' | 'right',
): RelativeVector[] {
  const grouped = new Map<string, RelativeVector>();
  for (const vector of vectors) {
    if (vector.hand !== hand || vector.distance === 0) continue;
    const key = [
      vector.dx.toFixed(6),
      vector.dy.toFixed(6),
      vector.fromFingerClass,
      vector.toFingerClass,
    ].join('|');
    const current = grouped.get(key);
    grouped.set(key, current === undefined
      ? {
        id: key,
        dx: vector.dx,
        dy: vector.dy,
        weight: vector.weight,
        fromFingerClass: vector.fromFingerClass,
        toFingerClass: vector.toFingerClass,
        fingerDirection: vector.fingerDirection,
      }
      : { ...current, weight: current.weight + vector.weight });
  }
  return [...grouped.values()];
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function MovementProfilePlot({
  vectors,
  hand,
  maxDistance,
  maxVectorWeight,
}: {
  vectors: readonly BigramVector[];
  hand: 'left' | 'right';
  maxDistance: number;
  maxVectorWeight: number;
}) {
  const reduceMotion = useReducedMotion();
  const relative = useMemo(() => relativeVectors(vectors, hand), [vectors, hand]);
  const summary = useMemo(() => directionSummary(vectors, hand), [vectors, hand]);
  const cx = 120;
  const cy = 112;
  const radius = 82;
  const plotScale = radius / maxDistance;
  const meanRadius = summary.magnitude * radius;
  const meanEnd = summary.angle === undefined
    ? { x: cx, y: cy }
    : polarPoint(cx, cy, meanRadius, summary.angle);
  const rollTotal = summary.inwardWeight + summary.outwardWeight;
  const inwardRate = rollTotal === 0 ? 0 : summary.inwardWeight / rollTotal;
  const outwardRate = rollTotal === 0 ? 0 : summary.outwardWeight / rollTotal;

  return (
    <div className="flow-mini-panel flow-profile-panel">
      <header>
        <strong>{hand === 'left' ? 'Left' : 'Right'}</strong>
        <span>{relative.length} vectors · 集中度 {summary.magnitude.toFixed(2)}</span>
      </header>
      <svg viewBox="0 0 240 236" role="img" aria-label={`${hand} hand movement profile`}>
        {[radius / 3, radius * 2 / 3, radius].map((ringRadius) => (
          <circle className="flow-axis-ring" cx={cx} cy={cy} r={ringRadius} key={ringRadius} />
        ))}
        <line className="flow-axis" x1="22" y1={cy} x2="218" y2={cy} />
        <line className="flow-axis" x1={cx} y1="14" x2={cx} y2="210" />

        <g className="actual-vector-layer">
          <AnimatePresence initial={false}>
            {relative.map((vector) => {
              const direction = vector.fingerDirection ?? 'same';
              const strength = weightScale(vector.weight, maxVectorWeight);
              return (
                <motion.line
                  key={vector.id}
                  className={`relative-vector relative-vector-${direction}`}
                  x1={cx}
                  y1={cy}
                  initial={reduceMotion ? false : { x2: cx, y2: cy, opacity: 0 }}
                  animate={{
                    x2: cx + vector.dx * plotScale,
                    y2: cy + vector.dy * plotScale,
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
          className="mean-resultant"
          x1={cx}
          y1={cy}
          animate={{ x2: meanEnd.x, y2: meanEnd.y, opacity: summary.angle === undefined ? 0 : 1 }}
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
            opacity: summary.angle === undefined ? 0 : 1,
          }}
          transition={reduceMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 170, damping: 22 }}
        />
        <circle className="flow-origin" cx={cx} cy={cy} r="4" />
      </svg>

      <div className="flow-roll-legend flow-profile-legend" aria-hidden="true">
        <span><i className="flow-dot flow-dot-inward" /> inward</span>
        <span><i className="flow-dot flow-dot-outward" /> outward</span>
        <span>{maxDistance.toFixed(1)}u scale</span>
      </div>

      <div className="roll-summary">
        <div className="roll-bar" aria-label="inward outward比率">
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
              <span>outward {(outwardRate * 100).toFixed(1)}%</span>
              <span>inward {(inwardRate * 100).toFixed(1)}%</span>
            </>
          ) : (
            <>
              <span>inward {(inwardRate * 100).toFixed(1)}%</span>
              <span>outward {(outwardRate * 100).toFixed(1)}%</span>
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

export function AnalyzerBigramFlow({ model }: { model: AnalyzerBigramFlowModel }) {
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const [source, setSource] = useState<BigramSource>('actual');
  const [selectedFingers, setSelectedFingers] = useState<FingerClass[]>([]);
  const data = snapshot.data;

  const vectors = useMemo(
    () => data ? buildBigramVectors(data.trace.strokes, source) : [],
    [data, source],
  );
  const filtered = useMemo(
    () => filterBigramVectors(vectors, selectedFingers),
    [vectors, selectedFingers],
  );
  const aggregated = useMemo(
    () => aggregateBigramVectors(filtered),
    [filtered],
  );
  const analysisVectors = useMemo(() => {
    if (selectedFingers.length !== 1) return aggregated;
    const finger = selectedFingers[0];
    return aggregateBigramVectors(vectors.filter((vector) =>
      vector.fromFingerClass === finger && vector.toFingerClass === finger));
  }, [aggregated, selectedFingers, vectors]);

  const toggleFinger = (finger: FingerClass) => {
    setSelectedFingers((current) => {
      if (current.includes(finger)) return current.filter((candidate) => candidate !== finger);
      if (current.length >= 2) return current;
      return [...current, finger];
    });
  };

  if (!data) {
    return (
      <div className="flow-analysis-locked" data-react-feature="bigram-flow">
        <strong>Bigram Flow</strong>
        <p>詳細表示する配列を選ぶとベクトルを表示する。</p>
      </div>
    );
  }

  const { layout, geometry, trace } = data;
  const rawCount = filtered.reduce((sum, vector) => sum + vector.weight, 0);
  const vectorAnalysisReady = selectedFingers.length >= 1;
  const relative = [
    ...relativeVectors(analysisVectors, 'left'),
    ...relativeVectors(analysisVectors, 'right'),
  ];
  const relativeMaxDistance = Math.max(
    1,
    ...relative.map((vector) => Math.hypot(vector.dx, vector.dy)),
  );
  const relativeMaxWeight = Math.max(1, ...relative.map((vector) => vector.weight));

  return (
    <section
      className="flow-feature"
      data-react-feature="bigram-flow"
      data-layout-id={layout.id}
      data-geometry-id={geometry.id}
    >
      <div className="flow-analysis-heading">
        <div>
          <p className="eyebrow">Vector lab · #366</p>
          <h2>Bigram Flow</h2>
        </div>
        <p>
          現在の評価テキスト・論理配列・物理形状・運指から、隣接打鍵の物理ベクトルを観察する。
          structural Roll / Arpeggioの成立判定とは独立した表示。
        </p>
      </div>

      <section className="flow-controls" aria-label="Bigram Flow controls">
        <div className="flow-control-group">
          <span>Bigram</span>
          <div className="flow-segmented" role="group" aria-label="bigram source">
            {(['actual', 'within-hand'] as const).map((candidate) => (
              <button
                type="button"
                key={candidate}
                aria-pressed={source === candidate}
                data-active={source === candidate || undefined}
                onClick={() => setSource(candidate)}
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
      </section>

      <div className="flow-status">
        <span>{layout.name}</span>
        <span>{geometry.name}</span>
        <span>{source === 'actual' ? '実Stroke bigram' : '反対手を飛ばした手内bigram'}</span>
        <span>{rawCount.toLocaleString()} vectors</span>
        {trace.skipped > 0 ? <span>{trace.skipped} skipped</span> : null}
      </div>

      <section className="flow-block">
        <header className="flow-block-header">
          <div>
            <p className="eyebrow">Absolute</p>
            <h2>Keyboard Flow</h2>
          </div>
          <p>
            全connectionをmountしたまま描き、太さで頻度を表す。始点は薄く終点を濃くして方向を示す。
            キーhoverではそのキー始点の結合を強調する。
          </p>
        </header>
        <KeyboardFlow
          geometry={geometry}
          layout={layout}
          vectors={aggregated}
          selectedFingers={selectedFingers}
        />
      </section>

      <AnimatePresence initial={false}>
        {vectorAnalysisReady ? (
          <motion.section
            className="flow-analysis"
            key={selectedFingers.slice().sort().join('-')}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 180, damping: 24 }}
          >
            <div className="flow-analysis-heading">
              <div>
                <p className="eyebrow">Vector analysis</p>
                <h2>
                  {selectedFingers.map((selected) =>
                    FINGER_OPTIONS.find((finger) => finger.id === selected)?.label
                  ).join(' + ')}
                </h2>
              </div>
              <p>
                {selectedFingers.length === 1
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
                  線の向きは移動方向、長さは物理距離、太さと濃さはfrequency。
                  白線はfrequency-weighted mean resultantで、長さは方向の集中度を表す。
                </p>
              </header>
              <div className="flow-two-up">
                <MovementProfilePlot
                  vectors={analysisVectors}
                  hand="left"
                  maxDistance={relativeMaxDistance}
                  maxVectorWeight={relativeMaxWeight}
                />
                <MovementProfilePlot
                  vectors={analysisVectors}
                  hand="right"
                  maxDistance={relativeMaxDistance}
                  maxVectorWeight={relativeMaxWeight}
                />
              </div>
              {source === 'actual' && analysisVectors.some((vector) => vector.hand === 'cross') ? (
                <p className="flow-footnote">
                  Cross-hand bigramはKeyboard Flowには残すが、左右のmovement profileからは除外する。
                </p>
              ) : null}
            </section>
          </motion.section>
        ) : (
          <motion.div
            className="flow-analysis-locked"
            key="locked"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <span>Vector Analysis</span>
            <strong>指を1〜2本選ぶと表示</strong>
            <p>未選択時はKeyboard Flowで全体の結合を観察できる。</p>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="flow-footnote">
        Analyzerの現在条件をそのまま使用。方向と距離は観測値であり、配列の優劣を判定するスコアではない。
      </p>
    </section>
  );
}
