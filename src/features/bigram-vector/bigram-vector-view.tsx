import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import {
  aggregateBigramVectors,
  buildBigramVectors,
  directionBins,
  directionSummary,
  filterBigramVectors,
  type BigramSource,
  type BigramVector,
  type FingerClass,
} from '../../bigram-vectors.ts';
import {
  DEFAULT_FINGER_ASSIGNMENT,
  assignmentWithHomeKeys,
  buildGeometry,
  type Geometry,
  type Key,
  type Point,
} from '../../geometry.ts';
import { DEFAULT_OPTIONS, evaluate } from '../../evaluate.ts';
import { LAYOUTS_JA, type Layout } from '../../layouts/index.ts';
import { SAMPLE_TEXT_JA } from '../../sample-text-ja.ts';
import './bigram-vector-view.css';

const SAMPLE = SAMPLE_TEXT_JA.replace(/\s+/g, '');
const FINGER_OPTIONS: readonly { id: FingerClass; label: string }[] = [
  { id: 'index', label: '人' },
  { id: 'middle', label: '中' },
  { id: 'ring', label: '薬' },
  { id: 'pinky', label: '小' },
];
const SCALE = 58;
const PAD = 42;

interface RelativeVector {
  id: string;
  dx: number;
  dy: number;
  weight: number;
  fromFingerClass: FingerClass;
  toFingerClass: FingerClass;
  fingerDirection: BigramVector['fingerDirection'];
}

function layoutGeometry(layout: Layout): Geometry {
  return buildGeometry(
    'row-staggered',
    assignmentWithHomeKeys(DEFAULT_FINGER_ASSIGNMENT, layout.homeKeys),
  );
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
  const from = chartPoint(vector.from, minX, minY);
  const to = chartPoint(vector.to, minX, minY);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (length < 0.01) {
    return [
      `M ${from.x - 8} ${from.y - 15}`,
      `C ${from.x - 28} ${from.y - 40}, ${from.x + 28} ${from.y - 40}, ${from.x + 8} ${from.y - 15}`,
    ].join(' ');
  }

  const ux = dx / length;
  const uy = dy / length;
  const start = { x: from.x + ux * 20, y: from.y + uy * 18 };
  const end = { x: to.x - ux * 24, y: to.y - uy * 21 };
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  // 往復で弧の側が反転すると線が蛇行して見える。
  // 法線を画面上側（ほぼ垂直なら右側）へ揃え、全edgeを同じ側へごく浅く曲げる。
  let nx = -uy;
  let ny = ux;
  if (ny > 0 || (Math.abs(ny) < 0.15 && nx < 0)) {
    nx *= -1;
    ny *= -1;
  }
  const bend = Math.min(7, Math.max(3.5, length * 0.035));
  const control = {
    x: mid.x + nx * bend,
    y: mid.y + ny * bend,
  };
  return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
}

function edgeClass(vector: BigramVector, showRollDirection: boolean): string {
  if (showRollDirection && vector.fingerDirection !== undefined) {
    return `flow-edge flow-edge-${vector.fingerDirection}`;
  }
  return `flow-edge flow-edge-${vector.hand}`;
}

function weightScale(weight: number, maxWeight: number): number {
  if (maxWeight <= 1) return 1;
  return Math.log1p(weight) / Math.log1p(maxWeight);
}

function visibleKeyboardVectors(
  vectors: readonly BigramVector[],
  selectedFingerCount: number,
): readonly BigramVector[] {
  const limit = selectedFingerCount === 0 ? 32 : selectedFingerCount === 1 ? 40 : 64;
  return [...vectors]
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
    .slice(0, limit);
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
  const width = PAD * 2 + (keyBounds.maxX - keyBounds.minX) * SCALE;
  const height = PAD * 2 + (keyBounds.maxY - keyBounds.minY) * SCALE;
  const displayedVectors = useMemo(
    () => visibleKeyboardVectors(vectors, selectedFingers.length),
    [vectors, selectedFingers.length],
  );
  const maxWeight = Math.max(1, ...displayedVectors.map((vector) => vector.weight));
  const totalWeight = vectors.reduce((sum, vector) => sum + vector.weight, 0);
  const displayedWeight = displayedVectors.reduce((sum, vector) => sum + vector.weight, 0);
  const coverage = totalWeight === 0 ? 0 : displayedWeight / totalWeight;
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
                data-selected={selected || undefined}
                key={key.id}
                transform={`translate(${point.x} ${point.y})`}
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

        <g className="flow-vector-layer">
          <AnimatePresence initial={false}>
            {displayedVectors.map((vector) => {
              const strength = weightScale(vector.weight, maxWeight);
              return (
                <motion.path
                  key={vector.id}
                  className={edgeClass(vector, showRollDirection)}
                  d={edgePath(vector, keyBounds.minX, keyBounds.minY)}
                  fill="none"
                  strokeWidth={0.75 + 2.35 * strength}
                  initial={reduceMotion ? false : { opacity: 0, pathLength: 0 }}
                  animate={{ opacity: 0.12 + 0.76 * strength, pathLength: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0, pathLength: 0.5 }}
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
          {displayedVectors.length}/{vectors.length} paths · {(coverage * 100).toFixed(0)}%
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

function RelativeMovementPlot({
  vectors,
  hand,
  maxDistance,
  maxWeight,
}: {
  vectors: readonly BigramVector[];
  hand: 'left' | 'right';
  maxDistance: number;
  maxWeight: number;
}) {
  const reduceMotion = useReducedMotion();
  const relative = useMemo(() => relativeVectors(vectors, hand), [vectors, hand]);
  const cx = 120;
  const cy = 108;
  const radius = 78;
  const plotScale = radius / maxDistance;

  return (
    <div className="flow-mini-panel">
      <header>
        <strong>{hand === 'left' ? 'Left' : 'Right'}</strong>
        <span>{relative.reduce((sum, vector) => sum + vector.weight, 0)} transitions</span>
      </header>
      <svg viewBox="0 0 240 220" role="img" aria-label={`${hand} hand relative movement`}>
        <circle className="flow-axis-ring" cx={cx} cy={cy} r={radius / 2} />
        <circle className="flow-axis-ring" cx={cx} cy={cy} r={radius} />
        <line className="flow-axis" x1="24" y1={cy} x2="216" y2={cy} />
        <line className="flow-axis" x1={cx} y1="14" x2={cx} y2="202" />
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
        <AnimatePresence initial={false}>
          {relative.map((vector) => {
            const direction = vector.fingerDirection ?? 'same';
            const strength = weightScale(vector.weight, maxWeight);
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
                opacity: 0.2 + 0.72 * strength,
              }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              strokeWidth={0.9 + 2.6 * strength}
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
      </svg>
      <div className="flow-roll-legend flow-relative-legend" aria-hidden="true">
        <span><i className="flow-dot flow-dot-inward" /> inward</span>
        <span><i className="flow-dot flow-dot-outward" /> outward</span>
        <span>{maxDistance.toFixed(1)}u scale</span>
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

function sectorPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const outerStart = polarPoint(cx, cy, outerRadius, startAngle);
  const outerEnd = polarPoint(cx, cy, outerRadius, endAngle);
  const innerEnd = polarPoint(cx, cy, innerRadius, endAngle);
  const innerStart = polarPoint(cx, cy, innerRadius, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function DirectionPlot({
  vectors,
  hand,
}: {
  vectors: readonly BigramVector[];
  hand: 'left' | 'right';
}) {
  const reduceMotion = useReducedMotion();
  const bins = useMemo(() => directionBins(vectors, hand, 16), [vectors, hand]);
  const inwardBins = useMemo(
    () => directionBins(vectors.filter((vector) => vector.fingerDirection === 'inward'), hand, 16),
    [vectors, hand],
  );
  const outwardBins = useMemo(
    () => directionBins(vectors.filter((vector) => vector.fingerDirection === 'outward'), hand, 16),
    [vectors, hand],
  );
  const summary = useMemo(() => directionSummary(vectors, hand), [vectors, hand]);
  const maxWeight = Math.max(1, ...bins.map((bin) => bin.weight));
  const cx = 120;
  const cy = 112;
  const baseRadius = 18;
  const maxRadius = 88;
  const meanRadius = summary.magnitude * 82;
  const meanEnd = summary.angle === undefined
    ? { x: cx, y: cy }
    : polarPoint(cx, cy, meanRadius, summary.angle);
  const rollTotal = summary.inwardWeight + summary.outwardWeight;
  const inwardRate = rollTotal === 0 ? 0 : summary.inwardWeight / rollTotal;
  const outwardRate = rollTotal === 0 ? 0 : summary.outwardWeight / rollTotal;

  return (
    <div className="flow-mini-panel flow-direction-panel">
      <header>
        <strong>{hand === 'left' ? 'Left' : 'Right'}</strong>
        <span>集中度 {summary.magnitude.toFixed(2)}</span>
      </header>
      <svg viewBox="0 0 240 230" role="img" aria-label={`${hand} hand direction distribution`}>
        {[36, 62, 88].map((radius) => (
          <circle className="flow-axis-ring" cx={cx} cy={cy} r={radius} key={radius} />
        ))}
        <line className="flow-axis" x1="22" y1={cy} x2="218" y2={cy} />
        <line className="flow-axis" x1={cx} y1="14" x2={cx} y2="210" />
        {bins.flatMap((bin, index) => {
          const inward = inwardBins[index]?.weight ?? 0;
          const outward = outwardBins[index]?.weight ?? 0;
          const midAngle = (bin.startAngle + bin.endAngle) / 2;
          return ([
            {
              key: `${bin.index}-inward`,
              weight: inward,
              direction: 'inward',
              startAngle: bin.startAngle + 0.025,
              endAngle: midAngle - 0.012,
            },
            {
              key: `${bin.index}-outward`,
              weight: outward,
              direction: 'outward',
              startAngle: midAngle + 0.012,
              endAngle: bin.endAngle - 0.025,
            },
          ] as const).map((part) => {
            const outerRadius = baseRadius
              + (maxRadius - baseRadius) * part.weight / maxWeight;
            return (
              <motion.path
                key={part.key}
                className={`rose-sector rose-sector-${part.direction}`}
                initial={false}
                animate={{
                  d: sectorPath(
                    cx,
                    cy,
                    baseRadius,
                    outerRadius,
                    part.startAngle,
                    part.endAngle,
                  ),
                  opacity: part.weight === 0 ? 0.035 : 0.3 + 0.65 * part.weight / maxWeight,
                }}
                transition={reduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 180, damping: 25 }}
              >
                <title>{`${part.direction} · ${part.weight} transitions`}</title>
              </motion.path>
            );
          });
        })}
        <motion.line
          className="mean-resultant"
          x1={cx}
          y1={cy}
          animate={{ x2: meanEnd.x, y2: meanEnd.y, opacity: summary.angle === undefined ? 0 : 1 }}
          transition={reduceMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 170, damping: 22 }}
        />
        <circle className="flow-origin" cx={cx} cy={cy} r="4" />
      </svg>
      <div className="flow-roll-legend" aria-hidden="true">
        <span><i className="flow-dot flow-dot-inward" /> inward</span>
        <span><i className="flow-dot flow-dot-outward" /> outward</span>
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

export function BigramVectorView() {
  const [hydrated, setHydrated] = useState(false);
  const [layoutId, setLayoutId] = useState(() =>
    LAYOUTS_JA.some((layout) => layout.id === 'naginata-v18')
      ? 'naginata-v18'
      : LAYOUTS_JA[0]?.id ?? '');
  const [source, setSource] = useState<BigramSource>('actual');
  const [selectedFingers, setSelectedFingers] = useState<FingerClass[]>([]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const layout = LAYOUTS_JA.find((candidate) => candidate.id === layoutId) ?? LAYOUTS_JA[0];
  const geometry = useMemo(() => layoutGeometry(layout), [layout]);
  const trace = useMemo(
    () => evaluate(SAMPLE, layout, geometry, DEFAULT_OPTIONS),
    [layout, geometry],
  );
  const vectors = useMemo(
    () => buildBigramVectors(trace.strokes, source),
    [trace.strokes, source],
  );
  const filtered = useMemo(
    () => filterBigramVectors(vectors, selectedFingers),
    [vectors, selectedFingers],
  );
  const aggregated = useMemo(
    () => aggregateBigramVectors(filtered),
    [filtered],
  );

  const toggleFinger = (finger: FingerClass) => {
    setSelectedFingers((current) => {
      if (current.includes(finger)) return current.filter((candidate) => candidate !== finger);
      if (current.length >= 2) return current;
      return [...current, finger];
    });
  };

  const rawCount = filtered.reduce((sum, vector) => sum + vector.weight, 0);
  const vectorAnalysisReady = selectedFingers.length === 2;
  const relative = useMemo(() => [
    ...relativeVectors(aggregated, 'left'),
    ...relativeVectors(aggregated, 'right'),
  ], [aggregated]);
  const relativeMaxDistance = Math.max(
    1,
    ...relative.map((vector) => Math.hypot(vector.dx, vector.dy)),
  );
  const relativeMaxWeight = Math.max(1, ...relative.map((vector) => vector.weight));

  return (
    <section
      className="feature-shell flow-feature"
      data-flow-ready={hydrated ? 'true' : undefined}
    >
      <p className="eyebrow">Vector lab · #366</p>
      <h1>Bigram Flow</h1>
      <p>
        bigramを物理座標のベクトルとして眺める。絶対位置・相対移動・方向分布を分け、
        キー間の流れとロール傾向を視覚的に探索する。
      </p>

      <section className="flow-controls" aria-label="Bigram Flow controls">
        <label className="flow-layout-select">
          <span>配列</span>
          <select value={layout.id} onChange={(event) => setLayoutId(event.target.value)}>
            {LAYOUTS_JA.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
            ))}
          </select>
        </label>

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
            頻度の高い結合を優先表示し、太さを対数圧縮する。
            線はキーの上へ重ね、2指選択時はinward / outwardを色分けする。
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
                <p className="eyebrow">Pair analysis</p>
                <h2>
                  {FINGER_OPTIONS.find((finger) => finger.id === selectedFingers[0])?.label}
                  {' + '}
                  {FINGER_OPTIONS.find((finger) => finger.id === selectedFingers[1])?.label}
                </h2>
              </div>
              <p>
                押し順は固定しない。両方向を残したまま、左右の物理方向と解剖学的
                inward / outwardを別々に読む。
              </p>
            </div>

            <section className="flow-block">
              <header className="flow-block-header">
                <div>
                  <p className="eyebrow">Relative</p>
                  <h2>Relative Movement</h2>
                </div>
                <p>始点を原点へ揃え、距離を残した移動ベクトルとして表示する。</p>
              </header>
              <div className="flow-two-up">
                <RelativeMovementPlot
                  vectors={aggregated}
                  hand="left"
                  maxDistance={relativeMaxDistance}
                  maxWeight={relativeMaxWeight}
                />
                <RelativeMovementPlot
                  vectors={aggregated}
                  hand="right"
                  maxDistance={relativeMaxDistance}
                  maxWeight={relativeMaxWeight}
                />
              </div>
            </section>

            <section className="flow-block">
              <header className="flow-block-header">
                <div>
                  <p className="eyebrow">Direction only</p>
                  <h2>Direction Distribution</h2>
                </div>
                <p>
                  各vectorを単位長へ正規化。sectorはinward / outwardを色分けする。
                  白い線はfrequency-weighted mean resultantで、長さが方向の集中度を表す。
                </p>
              </header>
              <div className="flow-two-up">
                <DirectionPlot vectors={aggregated} hand="left" />
                <DirectionPlot vectors={aggregated} hand="right" />
              </div>
              {source === 'actual' && aggregated.some((vector) => vector.hand === 'cross') ? (
                <p className="flow-footnote">
                  Cross-hand bigramはKeyboard Flowには残すが、左右のroll方向を扱うVector Analysisからは除外している。
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
            <strong>指を2本選ぶと解放</strong>
            <p>1本選択中はKeyboard Flowで、その指に関係する結合を探索できる。</p>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="flow-footnote">
        既定日本語サンプル {SAMPLE.length.toLocaleString()}文字・段ずれ形状・既定運指。
        この画面の方向分布は観測値であり、配列の特性をビジュアル化したものです。
      </p>
    </section>
  );
}
