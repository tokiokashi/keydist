import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  THUMB_ROW,
  type Key,
} from './geometry.ts';
import { visibleGeometryKeys } from './layout-physical-keys.ts';
import { FINGER_LABEL } from './app-dom.ts';
import { escapeText } from './chart.ts';
import type {
  AnalyzerPlaybackSurfaceActions,
  AnalyzerPlaybackSurfaceData,
  AnalyzerPlaybackSurfaceModel,
} from './analyzer-playback-surface-model.ts';
import type { PlaybackRateChartPoint } from './playback.ts';

const PLAYBACK_KEY = 30;
const PLAYBACK_PAD = 6;
const PLAYBACK_THUMB_WIDTH = 1.9;
const RATE_WIDTH = 760;
const RATE_HEIGHT = 260;
const RATE_MARGIN = { top: 30, right: 18, bottom: 30, left: 54 };
const KANA_COLOR = 'var(--series-2)';
const ACTION_COLOR = 'var(--accent)';

interface PositionedKey {
  key: Key;
  x: number;
  y: number;
  width: number;
}

function formatRate(value: number | undefined): string {
  return value === undefined ? '—' : value.toFixed(2);
}

function rateTooltip(point: PlaybackRateChartPoint): string {
  const input = point.inputText === '' ? '—' : escapeText(point.inputText);
  return `ステップ ${point.cursor}<br>集計入力: <code>${input}</code><br>`
    + `<span style="color:${KANA_COLOR}">かな/秒</span> <b>${formatRate(point.kanaPerSecond)}</b><br>`
    + `<span style="color:${ACTION_COLOR}">アクション/秒</span> <b>${formatRate(point.actionsPerSecond)}</b>`;
}

function PlaybackRateChart({
  data,
  cursor,
  onSeek,
}: {
  data: AnalyzerPlaybackSurfaceData;
  cursor: number;
  onSeek(cursor: number): void;
}) {
  const points = data.rateChartPoints;
  const total = points.at(-1)?.cursor ?? 0;
  if (total === 0) {
    return <p className="playback-rate-chart-empty">打鍵データがありません。</p>;
  }

  const plotWidth = RATE_WIDTH - RATE_MARGIN.left - RATE_MARGIN.right;
  const plotHeight = RATE_HEIGHT - RATE_MARGIN.top - RATE_MARGIN.bottom;
  const xOf = (at: number) => RATE_MARGIN.left + (at / total) * plotWidth;
  const finiteValues = points
    .flatMap((point) => [point.kanaPerSecond, point.actionsPerSecond])
    .filter((value): value is number =>
      value !== undefined && Number.isFinite(value));
  const yMax = Math.max(1, ...finiteValues) * 1.1;
  const yOf = (value: number) =>
    RATE_MARGIN.top + (1 - value / yMax) * plotHeight;
  const linePath = (
    valueOf: (point: PlaybackRateChartPoint) => number | undefined,
  ) => points
    .filter((point) => valueOf(point) !== undefined)
    .map((point, index) =>
      `${index === 0 ? 'M' : 'L'}${xOf(point.cursor)},${yOf(valueOf(point)!)}`)
    .join(' ');

  const kanaPath = linePath((point) => point.kanaPerSecond);
  const actionPath = linePath((point) => point.actionsPerSecond);
  const xTicks = [...new Set([0, Math.round(total / 2), total])];
  const hitWidth = plotWidth / total;

  return (
    <svg
      viewBox={`0 0 ${RATE_WIDTH} ${RATE_HEIGHT}`}
      role="img"
      aria-label="かな毎秒とアクション毎秒の推移"
      data-playback-rate-total={total}
    >
      <g aria-label="凡例">
        <line x1={RATE_MARGIN.left} y1={14} x2={RATE_MARGIN.left + 18} y2={14} stroke={KANA_COLOR} strokeWidth={3} />
        <text x={RATE_MARGIN.left + 24} y={18} fontSize={12} fill="var(--fg)">かな/秒</text>
        <line x1={RATE_MARGIN.left + 100} y1={14} x2={RATE_MARGIN.left + 118} y2={14} stroke={ACTION_COLOR} strokeWidth={3} />
        <text x={RATE_MARGIN.left + 124} y={18} fontSize={12} fill="var(--fg)">アクション/秒</text>
      </g>

      {[0, 0.5, 1].map((ratio) => {
        const value = yMax * ratio;
        const y = yOf(value);
        return (
          <g key={ratio}>
            <line x1={RATE_MARGIN.left} y1={y} x2={RATE_WIDTH - RATE_MARGIN.right} y2={y} stroke="var(--line)" />
            <text
              x={RATE_MARGIN.left - 8}
              y={y + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--muted)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {value.toFixed(1)}
            </text>
          </g>
        );
      })}

      {points.map((point) => {
        const showChain = data.rateChartDisplay === 'chain'
          || data.rateChartDisplay === 'both';
        const showArpeggio = data.rateChartDisplay === 'arpeggio'
          || data.rateChartDisplay === 'both';
        const start = Math.max(0, point.cursor - 1);
        const x = xOf(start);
        const width = xOf(point.cursor) - x;
        return (
          <g key={`band-${point.cursor}`}>
            {showChain && point.chain ? (
              <rect x={x} y={RATE_MARGIN.top} width={width} height={plotHeight} fill="var(--series-2)" opacity={0.10} pointerEvents="none" />
            ) : null}
            {showArpeggio && point.arpeggio ? (
              <rect x={x} y={RATE_MARGIN.top} width={width} height={plotHeight} fill="var(--series-3)" opacity={0.10} pointerEvents="none" />
            ) : null}
          </g>
        );
      })}

      {kanaPath ? <path d={kanaPath} fill="none" stroke={KANA_COLOR} strokeWidth={2} strokeLinejoin="round" /> : null}
      {actionPath ? <path d={actionPath} fill="none" stroke={ACTION_COLOR} strokeWidth={2} strokeLinejoin="round" /> : null}

      {points.flatMap((point) => {
        const items = [];
        if (point.kanaPerSecond !== undefined) {
          items.push(
            <circle
              key={`k-${point.cursor}`}
              cx={xOf(point.cursor)}
              cy={yOf(point.kanaPerSecond)}
              r={2.5}
              fill={KANA_COLOR}
              pointerEvents="none"
            />,
          );
        }
        if (point.actionsPerSecond !== undefined) {
          items.push(
            <circle
              key={`a-${point.cursor}`}
              cx={xOf(point.cursor)}
              cy={yOf(point.actionsPerSecond)}
              r={2.5}
              fill={ACTION_COLOR}
              pointerEvents="none"
            />,
          );
        }
        return items;
      })}

      <line
        data-playback-rate-cursor-line
        x1={xOf(cursor)}
        y1={RATE_MARGIN.top}
        x2={xOf(cursor)}
        y2={RATE_HEIGHT - RATE_MARGIN.bottom}
        stroke="var(--fg)"
        strokeWidth={1.5}
        strokeDasharray="3 3"
        pointerEvents="none"
      />

      {xTicks.map((at) => (
        <text
          key={at}
          x={xOf(at)}
          y={RATE_HEIGHT - 8}
          textAnchor="middle"
          fontSize={11}
          fill="var(--muted)"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {at}
        </text>
      ))}

      {points.map((point) => {
        const x = xOf(point.cursor);
        const left = point.cursor === 0
          ? RATE_MARGIN.left
          : x - hitWidth / 2;
        const width = point.cursor === 0 || point.cursor === total
          ? hitWidth / 2
          : hitWidth;
        return (
          <rect
            key={`hit-${point.cursor}`}
            data-playback-rate-cursor={point.cursor}
            data-playback-rate-current={point.cursor === cursor ? 'true' : undefined}
            data-tip={rateTooltip(point)}
            x={left}
            y={RATE_MARGIN.top}
            width={width}
            height={plotHeight}
            fill="transparent"
            pointerEvents="all"
            onClick={() => onSeek(point.cursor)}
          />
        );
      })}
    </svg>
  );
}

function positionKeys(data: AnalyzerPlaybackSurfaceData) {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  const keys = visibleGeometryKeys(data.layout, data.geometry).map((key) => {
    const thumb = key.row === THUMB_ROW;
    const widthU = thumb ? PLAYBACK_THUMB_WIDTH : (key.width ?? 1);
    const width = widthU * PLAYBACK_KEY;
    const x = (key.x - (widthU - 1) / 2) * PLAYBACK_KEY;
    const y = key.y * PLAYBACK_KEY;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + PLAYBACK_KEY);
    return { key, x, y, width };
  });
  return {
    keys,
    viewX: minX - PLAYBACK_PAD / 2,
    viewY: minY - PLAYBACK_PAD / 2,
    width: maxX - minX + PLAYBACK_PAD,
    height: maxY - minY + PLAYBACK_PAD,
  };
}

function PlaybackKeyboard({ data }: { data: AnalyzerPlaybackSurfaceData }) {
  const rootRef = useRef<SVGSVGElement | null>(null);
  const positioned = useMemo(
    () => positionKeys(data),
    [data.layout, data.geometry],
  );
  const positions = useMemo(
    () => new Map(positioned.keys.map((item) => [item.key.id, item])),
    [positioned],
  );
  const motionTargets = useMemo(
    () => new Set(data.motions.map((motion) => motion.toKey)),
    [data.motions],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root || data.motionRevision === 0) return;
    for (const node of root.querySelectorAll<SVGGElement>('[data-playback-motion-key]')) {
      const dx = Number(node.dataset.motionDx ?? 0);
      const dy = Number(node.dataset.motionDy ?? 0);
      const duration = Number(node.dataset.motionDuration ?? 0);
      node.getAnimations().forEach((animation) => animation.cancel());
      node.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: 'translate(0px, 0px)' },
        ],
        {
          duration,
          easing: 'ease-out',
          fill: 'forwards',
        },
      );
    }
  }, [data.motionRevision, data.motions]);

  useEffect(() => {
    const root = rootRef.current;
    if (
      !root
      || data.feedbackRevision === 0
      || data.feedbackStyle === 'off'
      || data.feedbackKeys.size === 0
    ) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    for (const id of data.feedbackKeys) {
      const key = root.querySelector<SVGGElement>(
        `[data-playback-key="${CSS.escape(id)}"]`,
      );
      const overlay = key?.querySelector<SVGRectElement>(
        '[data-playback-feedback-overlay]',
      );
      if (!key || !overlay) continue;

      key.getAnimations().forEach((animation) => animation.cancel());
      overlay.getAnimations().forEach((animation) => animation.cancel());

      if (reducedMotion) {
        overlay.animate(
          [{ opacity: 0.45 }, { opacity: 0 }],
          { duration: 34, easing: 'linear' },
        );
      } else if (data.feedbackStyle === 'fade') {
        const face = key.querySelector<SVGRectElement>(
          'rect:not([data-playback-feedback-overlay])',
        );
        face?.animate(
          [
            { fill: 'var(--panel)', stroke: 'var(--line)' },
            { fill: 'var(--accent)', stroke: 'var(--accent)' },
          ],
          { duration: 120, easing: 'ease-out' },
        );
      } else if (data.feedbackStyle === 'pulse') {
        overlay.animate(
          [{ opacity: 0.62 }, { opacity: 0 }],
          { duration: 220, easing: 'ease-out' },
        );
      } else if (data.feedbackStyle === 'bounce') {
        key.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.065)' },
            { transform: 'scale(1)' },
          ],
          { duration: 160, easing: 'ease-out' },
        );
      }
    }
  }, [data.feedbackRevision, data.feedbackKeys, data.feedbackStyle]);

  const renderKey = (
    item: PositionedKey,
    motion?: AnalyzerPlaybackSurfaceData['motions'][number],
    motionIndex?: number,
  ) => {
    const id = item.key.id;
    const thumb = item.key.row === THUMB_ROW;
    const baseLabel = data.layout.legends.get(id) ?? '';
    const label = data.keyLabels.get(id) ?? baseLabel;
    const fontSize = thumb ? 10 : label.length > 3 ? 9 : 12;
    const trailOpacity = data.trailKeys.get(id);
    const plannedOpacity = data.plannedKeys.get(id);
    const planOrder = data.plannedOrders.get(id);
    const trailOrder = data.trailOrders.get(id);
    const chainOrder = data.chainOrders.get(id);
    const arpeggioOrder = data.arpeggioOrders.get(id);
    const isMotion = motion !== undefined;
    const from = motion ? positions.get(motion.fromKey) : undefined;
    const dx = motion && from ? from.x - item.x : 0;
    const dy = motion && from ? from.y - item.y : 0;
    const tip = `${escapeText(label || id)} <span style="color:var(--muted)">(${escapeText(id)})</span><br>${escapeText(FINGER_LABEL[item.key.finger])}`;

    return (
      <g
        key={isMotion ? `motion-${data.motionRevision}-${motionIndex}` : id}
        data-tip={tip}
        data-playback-key={isMotion ? undefined : id}
        data-playback-motion-key={isMotion ? `${data.motionRevision}-${motionIndex}` : undefined}
        data-playback-motion-kind={motion?.kind}
        data-motion-dx={isMotion ? dx : undefined}
        data-motion-dy={isMotion ? dy : undefined}
        data-motion-duration={isMotion ? motion.durationMs : undefined}
        data-playback-finger={item.key.finger}
        data-playback-active={!isMotion && data.activeKeys.has(id) && !motionTargets.has(id) ? 'true' : 'false'}
        data-playback-trigger={!isMotion && data.triggerKeys.has(id) ? 'true' : 'false'}
        data-playback-finger-position={!isMotion ? data.fingerPositionKeys.get(id) ?? '' : ''}
        data-playback-trail={!isMotion && trailOpacity !== undefined ? 'true' : 'false'}
        data-playback-plan={!isMotion && plannedOpacity !== undefined ? 'true' : 'false'}
        style={{
          ...(trailOpacity === undefined
            ? {}
            : { ['--playback-trail-opacity' as string]: String(trailOpacity) }),
          ...(plannedOpacity === undefined
            ? {}
            : { ['--playback-plan-opacity' as string]: String(plannedOpacity) }),
          ...(isMotion ? { pointerEvents: 'none' } : {}),
        }}
      >
        <rect
          x={item.x + 1}
          y={item.y + 1}
          width={item.width - 2}
          height={PLAYBACK_KEY - 2}
          rx={5}
          fill="var(--panel)"
          stroke="var(--line)"
        />
        <rect
          data-playback-feedback-overlay
          x={item.x + 1}
          y={item.y + 1}
          width={item.width - 2}
          height={PLAYBACK_KEY - 2}
          rx={5}
          fill="var(--panel)"
          opacity={0}
          pointerEvents="none"
        />
        <text className="playback-order playback-order-plan" x={item.x + 7} y={item.y + 10} textAnchor="middle" visibility={planOrder === undefined ? 'hidden' : 'visible'}>
          {planOrder === undefined ? '' : planOrder >= 1 && planOrder <= 20 ? String.fromCharCode(0x245f + planOrder) : `(${planOrder})`}
        </text>
        <text className="playback-order playback-order-trail" x={item.x + item.width - 7} y={item.y + 10} textAnchor="middle" visibility={trailOrder === undefined ? 'hidden' : 'visible'}>
          {trailOrder === undefined ? '' : trailOrder >= 1 && trailOrder <= 20 ? String.fromCharCode(0x245f + trailOrder) : `(${trailOrder})`}
        </text>
        <text className="playback-order playback-order-chain" x={item.x + item.width / 2} y={item.y + PLAYBACK_KEY - 5} textAnchor="middle" visibility={chainOrder === undefined ? 'hidden' : 'visible'}>
          {chainOrder ?? ''}
        </text>
        <text className="playback-order playback-order-arpeggio" x={item.x + item.width / 2} y={item.y + 11} textAnchor="middle" visibility={arpeggioOrder === undefined ? 'hidden' : 'visible'}>
          {arpeggioOrder ?? ''}
        </text>
        <text
          className="playback-key-label"
          x={item.x + item.width / 2}
          y={item.y + PLAYBACK_KEY / 2 + 4}
          textAnchor="middle"
          fontSize={fontSize}
          fill="var(--fg)"
          pointerEvents="none"
        >
          {label}
        </text>
      </g>
    );
  };

  return (
    <svg
      ref={rootRef}
      viewBox={`${positioned.viewX} ${positioned.viewY} ${positioned.width} ${positioned.height}`}
      width={positioned.width * data.scale}
      height={positioned.height * data.scale}
      role="img"
      aria-label={`${data.layout.name}の打鍵再生`}
    >
      {positioned.keys.map((item) => renderKey(item))}
      <g data-playback-motion-layer aria-hidden="true">
        {data.motions.map((motion, index) => {
          const target = positions.get(motion.toKey);
          return target ? renderKey(target, motion, index) : null;
        })}
      </g>
    </svg>
  );
}

export function AnalyzerPlaybackSurface({
  model,
  actions,
  appElement,
  settingsPanelElement,
}: {
  model: AnalyzerPlaybackSurfaceModel;
  actions: AnalyzerPlaybackSurfaceActions;
  appElement: HTMLElement;
  settingsPanelElement: HTMLElement;
}) {
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const data = snapshot.data;
  const settingsOpen = data?.settingsOpen ?? false;

  useEffect(() => {
    appElement.classList.toggle('playback-settings-open', settingsOpen);
    settingsPanelElement.setAttribute('aria-hidden', String(!settingsOpen));
    settingsPanelElement.toggleAttribute('inert', !settingsOpen);
    return () => {
      appElement.classList.remove('playback-settings-open');
      settingsPanelElement.setAttribute('aria-hidden', 'true');
      settingsPanelElement.setAttribute('inert', '');
    };
  }, [appElement, settingsOpen, settingsPanelElement]);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      actions.setSettingsOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [actions, settingsOpen]);

  if (!data) return null;

  return (
    <details
      className="playback-panel"
      open={data.panelOpen}
      onToggle={(event) => {
        const open = event.currentTarget.open;
        if (open !== data.panelOpen) actions.setPanelOpen(open);
      }}
      data-react-feature="playback"
    >
      <summary>
        <span>打鍵再生</span>
        <span className="playback-summary-hint">クリックして開く</span>
      </summary>
      <div className="playback-body">
        <div className="playback-head">
          <button
            type="button"
            className="secondary playback-setting-button"
            data-playback-settings-open
            aria-controls="playback-settings-panel"
            aria-expanded={data.settingsOpen}
            onClick={() => actions.setSettingsOpen(!data.settingsOpen)}
          >
            <span>再生設定</span>
            <small data-playback-settings-summary>{data.settingsSummary}</small>
          </button>
        </div>

        <div className="playback-controls" role="group" aria-label="打鍵再生の操作">
          <button
            type="button"
            className="ghost"
            data-playback-action="back"
            disabled={data.playing || data.cursor === 0}
            onClick={() => actions.step(-1)}
          >
            <span className="playback-control-icon" aria-hidden="true">◀</span>
            <span>1 ステップ戻る</span>
          </button>
          <button
            type="button"
            data-playback-action="toggle"
            aria-label={data.playing ? '再生を一時停止する' : '再生する'}
            disabled={data.total === 0 || data.cursor >= data.total}
            onClick={() => actions.togglePlay()}
          >
            <span className="playback-control-icon" aria-hidden="true">
              {data.playing ? '⏸' : '▶'}
            </span>
            <span>{data.playing ? '一時停止' : '再生'}</span>
          </button>
          <button
            type="button"
            className="secondary"
            data-playback-action="stop"
            disabled={data.cursor === 0 && !data.playing}
            onClick={() => actions.stop()}
          >
            <span className="playback-control-icon" aria-hidden="true">■</span>
            <span>停止</span>
          </button>
          <button
            type="button"
            className="ghost"
            data-playback-action="forward"
            disabled={data.playing || data.cursor >= data.total}
            onClick={() => actions.step(1)}
          >
            <span className="playback-control-icon" aria-hidden="true">▶</span>
            <span>1 ステップ進む</span>
          </button>
          <span className="playback-position" aria-live="polite" data-playback-position>
            {data.cursor} / {data.total} ステップ
          </span>
          <span className="playback-effective-rates">
            <span className="playback-effective-kana-rate" data-playback-effective-kana-rate>{data.effectiveKanaRate}</span>
            <span className="playback-effective-rate" data-playback-effective-rate>{data.effectiveRate}</span>
          </span>
        </div>

        <label className="playback-seek">
          <span>再生位置</span>
          <input
            type="range"
            data-playback-seek
            min={0}
            max={data.total}
            step={1}
            value={data.cursor}
            onPointerDown={() => actions.beginSeek()}
            onChange={(event) => actions.seek(Number(event.currentTarget.value))}
            onPointerUp={() => actions.finishSeek()}
          />
        </label>

        <div className="playback-status" aria-live="polite">
          <div className="playback-status-line">
            <span className="playback-current" data-playback-current hidden={data.isRomaji}>
              {data.currentText}
            </span>
            <span className="playback-romaji" data-playback-romaji hidden={!data.isRomaji}>
              <span className="playback-current" data-playback-kana>{data.kanaText}</span>
              <span className="playback-typed">
                打鍵: <code data-playback-typed>{data.typedText}</code>
                <span data-playback-planned hidden={data.plannedText === undefined}>
                  {data.plannedText === undefined ? '' : `予定: ${data.plannedText}`}
                </span>
              </span>
            </span>
            <span className="playback-attribution">帰属: <b data-playback-layer>{data.layerLabel}</b></span>
            <span className="playback-attribution">構造: <b data-playback-structure>{data.structureLabel}</b></span>
          </div>
          <div className="playback-history" data-playback-history hidden={data.inputPreview.length === 0}>
            <span className="playback-history-label">入力:</span>
            <span data-playback-history-text>
              {data.inputPreview.map((segment, index) => (
                <span
                  key={`${segment.kind}-${index}`}
                  className={`playback-input-segment playback-input-${segment.kind}`}
                  aria-current={segment.kind === 'current' ? 'step' : undefined}
                >
                  {segment.text}
                </span>
              ))}
            </span>
          </div>
        </div>

        <details
          className="playback-rate-chart-panel"
          open={data.rateChartOpen}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            if (open !== data.rateChartOpen) actions.setRateChartOpen(open);
          }}
        >
          <summary>かな/秒・アクション/秒の平均推移</summary>
          <div className="playback-rate-chart" data-playback-rate-chart>
            <PlaybackRateChart
              data={data}
              cursor={data.cursor}
              onSeek={(cursor) => actions.seek(cursor)}
            />
          </div>
        </details>

        <div className="fig-fixed playback-figure">
          <PlaybackKeyboard data={data} />
        </div>
      </div>
    </details>
  );
}
