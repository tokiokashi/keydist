import { useEffect, useMemo, useRef } from 'react';
import { THUMB_ROW, type Finger, type Geometry, type PhysicalKeyboardStandard } from '#input/shapes/geometry.ts';
import { visibleGeometryKeys } from '#input/layouts/physical-keys.ts';
import { drawnKeySpans } from '#input/shapes/drawn-key-spans.ts';
import { FINGER_LABEL } from '#input/shapes/finger-names.ts';
import type { Layout } from '#input/layouts/types.ts';
import { playbackOrderLabel } from '#interpretation/timing/playback.ts';
import { keyName } from '../key-detail-view.ts';
import { baseLayerLegends } from '../heatmap-figure.ts';
import type { PlaybackFrame } from './frame.ts';
import type { PlaybackKeyFeedbackStyle } from './options.ts';

/**
 * 再生中の配列図。今のステップの押下・指の位置・これから押すキー・押したキーの履歴・順番ラベル・
 * 構造の動的表示を、1つの図に重ねる。値は`frame.ts`が求めたものをそのまま描き、ここでは計算しない。
 * 押下フィードバックとキーの動きはWeb Animations APIで再生し、押した直後の一瞬だけ動く。
 */

const KEY_SIZE = 30;
const PAD = 6;

/** 押下フィードバックを出す1回の合図。`revision`が変わるたびに`keys`のキーを光らせる。 */
export interface PlaybackFeedback {
  readonly revision: number;
  readonly keys: ReadonlySet<string>;
}

interface PositionedKey {
  readonly id: string;
  readonly finger: Finger;
  readonly thumb: boolean;
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

function positionKeys(layout: Layout, geometry: Geometry) {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  const visible = visibleGeometryKeys(layout, geometry);
  const spans = drawnKeySpans(visible);
  const keys = visible.map((key): PositionedKey => {
    const span = spans.get(key.id)!;
    const x = span.left * KEY_SIZE;
    const y = key.y * KEY_SIZE;
    const width = span.width * KEY_SIZE;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + KEY_SIZE);
    return { id: key.id, finger: key.finger, thumb: key.row === THUMB_ROW, x, y, width };
  });
  return { keys, viewX: minX - PAD / 2, viewY: minY - PAD / 2, width: maxX - minX + PAD, height: maxY - minY + PAD };
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

export function PlaybackKeyboard({
  layout,
  geometry,
  standard,
  frame,
  feedback,
  feedbackStyle,
  scale,
}: {
  readonly layout: Layout;
  readonly geometry: Geometry;
  readonly standard: PhysicalKeyboardStandard | undefined;
  readonly frame: PlaybackFrame;
  readonly feedback: PlaybackFeedback;
  readonly feedbackStyle: PlaybackKeyFeedbackStyle;
  readonly scale: number;
}) {
  const rootRef = useRef<SVGSVGElement | null>(null);
  const positioned = useMemo(() => positionKeys(layout, geometry), [layout, geometry]);
  const positions = useMemo(() => new Map(positioned.keys.map((item) => [item.id, item])), [positioned]);
  const legends = useMemo(() => baseLayerLegends(layout), [layout]);
  const motionTargets = useMemo(() => new Set(frame.motions.map((motion) => motion.toKey)), [frame.motions]);

  // キーの動き。今のステップが変わった時だけ、動き始める位置から元の位置へ動かす
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    for (const node of root.querySelectorAll<SVGGElement>('[data-playback-motion-key]')) {
      const dx = Number(node.dataset.motionDx ?? 0);
      const dy = Number(node.dataset.motionDy ?? 0);
      const duration = Number(node.dataset.motionDuration ?? 0);
      node.getAnimations().forEach((animation) => animation.cancel());
      node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
        { duration, easing: 'ease-out', fill: 'forwards' },
      );
    }
    // 動きの描き直しは、ステップが変わった時だけ。同じステップの間にフレームごとに作り直さない
  }, [frame.cursor]);

  // 押下フィードバック。押した直後の一度だけ再生する
  useEffect(() => {
    const root = rootRef.current;
    if (!root || feedback.revision === 0 || feedbackStyle === 'off' || feedback.keys.size === 0) return;
    const reduced = reducedMotion();
    for (const id of feedback.keys) {
      const key = root.querySelector<SVGGElement>(`[data-playback-key="${CSS.escape(id)}"]`);
      const overlay = key?.querySelector<SVGRectElement>('[data-playback-feedback-overlay]');
      if (!key || !overlay) continue;
      key.getAnimations().forEach((animation) => animation.cancel());
      overlay.getAnimations().forEach((animation) => animation.cancel());
      if (reduced) {
        overlay.animate([{ opacity: 0.45 }, { opacity: 0 }], { duration: 34, easing: 'linear' });
      } else if (feedbackStyle === 'fade') {
        key.querySelector<SVGRectElement>('rect:not([data-playback-feedback-overlay])')?.animate(
          [
            { fill: 'var(--surface)', stroke: 'var(--border-strong)' },
            { fill: 'var(--accent)', stroke: 'var(--accent)' },
          ],
          { duration: 120, easing: 'ease-out' },
        );
      } else if (feedbackStyle === 'pulse') {
        overlay.animate([{ opacity: 0.62 }, { opacity: 0 }], { duration: 220, easing: 'ease-out' });
      } else {
        key.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.065)' }, { transform: 'scale(1)' }],
          { duration: 160, easing: 'ease-out' },
        );
      }
    }
  }, [feedback, feedbackStyle]);

  const renderKey = (item: PositionedKey, motion?: PlaybackFrame['motions'][number], motionIndex?: number) => {
    const id = item.id;
    const label = frame.keyLabels.get(id) ?? legends.get(id) ?? '';
    const fontSize = item.thumb ? 10 : label.length > 3 ? 9 : 12;
    const trailOpacity = frame.trailKeys.get(id);
    const plannedOpacity = frame.plannedKeys.get(id);
    const planOrder = frame.plannedOrders.get(id);
    const trailOrder = frame.trailOrders.get(id);
    const chainOrder = frame.chainOrders.get(id);
    const arpeggioOrder = frame.arpeggioOrders.get(id);
    const isMotion = motion !== undefined;
    const from = motion ? positions.get(motion.fromKey) : undefined;
    const dx = motion && from ? from.x - item.x : 0;
    const dy = motion && from ? from.y - item.y : 0;
    const tip = `${keyName(id, label, standard)} · ${FINGER_LABEL[item.finger]}`;
    const fingerPosition = !isMotion ? frame.fingerPositionKeys.get(id) : undefined;
    return (
      <g
        key={isMotion ? `motion-${frame.cursor}-${motionIndex}` : id}
        data-playback-key={isMotion ? undefined : id}
        data-playback-motion-key={isMotion ? `${frame.cursor}-${motionIndex}` : undefined}
        data-playback-motion-kind={motion?.kind}
        data-motion-dx={isMotion ? dx : undefined}
        data-motion-dy={isMotion ? dy : undefined}
        data-motion-duration={isMotion ? motion.durationMs : undefined}
        data-playback-active={!isMotion && frame.activeKeys.has(id) && !motionTargets.has(id) ? 'true' : 'false'}
        data-playback-trigger={!isMotion && frame.triggerKeys.has(id) ? 'true' : 'false'}
        data-playback-finger-position={fingerPosition ?? ''}
        data-playback-trail={!isMotion && trailOpacity !== undefined ? 'true' : 'false'}
        data-playback-plan={!isMotion && plannedOpacity !== undefined ? 'true' : 'false'}
        style={{
          ...(trailOpacity === undefined ? {} : { ['--playback-trail-opacity' as string]: String(trailOpacity) }),
          ...(plannedOpacity === undefined ? {} : { ['--playback-plan-opacity' as string]: String(plannedOpacity) }),
          ...(isMotion ? { pointerEvents: 'none' } : {}),
        }}
      >
        <title>{tip}</title>
        <rect
          className="playback-key-face"
          x={item.x + 1}
          y={item.y + 1}
          width={item.width - 2}
          height={KEY_SIZE - 2}
          rx={5}
          fill="var(--surface)"
          stroke="var(--border-strong)"
        />
        <rect
          data-playback-feedback-overlay
          x={item.x + 1}
          y={item.y + 1}
          width={item.width - 2}
          height={KEY_SIZE - 2}
          rx={5}
          fill="var(--surface)"
          opacity={0}
          pointerEvents="none"
        />
        <text className="playback-order playback-order-plan" x={item.x + 7} y={item.y + 10} textAnchor="middle" visibility={planOrder === undefined ? 'hidden' : 'visible'}>
          {planOrder === undefined ? '' : playbackOrderLabel(planOrder)}
        </text>
        <text className="playback-order playback-order-trail" x={item.x + item.width - 7} y={item.y + 10} textAnchor="middle" visibility={trailOrder === undefined ? 'hidden' : 'visible'}>
          {trailOrder === undefined ? '' : playbackOrderLabel(trailOrder)}
        </text>
        <text className="playback-order playback-order-chain" x={item.x + item.width / 2} y={item.y + KEY_SIZE - 5} textAnchor="middle" visibility={chainOrder === undefined ? 'hidden' : 'visible'}>
          {chainOrder ?? ''}
        </text>
        <text className="playback-order playback-order-arpeggio" x={item.x + item.width / 2} y={item.y + 11} textAnchor="middle" visibility={arpeggioOrder === undefined ? 'hidden' : 'visible'}>
          {arpeggioOrder ?? ''}
        </text>
        <text
          className="playback-key-label"
          x={item.x + item.width / 2}
          y={item.y + KEY_SIZE / 2 + 4}
          textAnchor="middle"
          fontSize={fontSize}
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
      className="playback-keyboard"
      viewBox={`${positioned.viewX} ${positioned.viewY} ${positioned.width} ${positioned.height}`}
      width={positioned.width * scale}
      height={positioned.height * scale}
      role="img"
      aria-label={`${layout.name}の打鍵再生`}
    >
      {positioned.keys.map((item) => renderKey(item))}
      <g data-playback-motion-layer aria-hidden="true">
        {frame.motions.map((motion, index) => {
          const target = positions.get(motion.toKey);
          return target ? renderKey(target, motion, index) : null;
        })}
      </g>
    </svg>
  );
}
