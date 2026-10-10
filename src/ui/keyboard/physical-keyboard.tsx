import type { KeyboardEvent } from 'react';
import type { Key } from '#input/shapes/geometry.ts';
import { drawnKeySpans } from '#input/shapes/drawn-key-spans.ts';
import { keyboardStandardForGeometryId, physicalKeyDisplayLabel } from '#input/shapes/key-labels.ts';

export interface PhysicalKeyboardKeyView {
  readonly legend?: string;
  readonly secondaryLegend?: string;
  readonly pressed?: boolean;
  readonly highlighted?: boolean;
  readonly trigger?: boolean;
  readonly combo?: boolean;
  readonly accentSlot?: number;
  /** レイヤーの色の番号を持たない、目立たない1色の枠（まとめられた側のレイヤーのトリガー）。 */
  readonly accentTone?: 'muted';
  readonly guide?: 'continuation' | 'output' | 'trigger';
  readonly lookup?: boolean;
  /** キーを選んでいく操作で、選択中のキー。 */
  readonly selected?: boolean;
  readonly home?: boolean;
}

export interface PhysicalKeyboardProps {
  readonly keys: readonly Key[];
  readonly keyViews?: ReadonlyMap<string, PhysicalKeyboardKeyView>;
  readonly ariaLabel?: string;
  readonly geometryId?: string;
  readonly unit?: number;
  readonly showSecondary?: boolean;
  readonly horizontalAlign?: 'left' | 'center';
  readonly selectedKeyId?: string;
  readonly onKeyClick?: (key: Key) => void;
  /**
   * キーをボタンとして扱い、Tabで移れてEnter・Spaceで押せるようにする（`onKeyClick` と一緒に使う）。
   * 各キーの `selected` が押された状態になる。Escapeは `onEscape` を呼ぶ。
   */
  readonly operable?: boolean;
  readonly onEscape?: () => void;
}

const DEFAULT_UNIT = 54;
const GAP_RATIO = 4 / DEFAULT_UNIT;
const PAD_RATIO = 8 / DEFAULT_UNIT;

export function PhysicalKeyboard({
  keys,
  keyViews = new Map(),
  ariaLabel = '物理キーボード',
  geometryId,
  unit = DEFAULT_UNIT,
  showSecondary = true,
  horizontalAlign = 'center',
  selectedKeyId,
  onKeyClick,
  operable = false,
  onEscape,
}: PhysicalKeyboardProps) {
  const standard = geometryId === undefined ? undefined : keyboardStandardForGeometryId(geometryId);
  const gap = unit * GAP_RATIO;
  const pad = unit * PAD_RATIO;
  const spans = drawnKeySpans(keys);
  const positioned = keys.map((key) => {
    const span = spans.get(key.id)!;
    const width = Math.max(unit * span.width - gap, unit / 4);
    const height = unit - gap;
    const x = span.left * unit;
    const y = key.y * unit;
    return { key, width, height, x, y };
  });

  if (positioned.length === 0) {
    return <div className="physical-keyboard physical-keyboard-empty">表示できるキーがありません。</div>;
  }

  const minX = Math.min(...positioned.map(({ x }) => x));
  const minY = Math.min(...positioned.map(({ y }) => y));
  const maxX = Math.max(...positioned.map(({ x, width }) => x + width));
  const maxY = Math.max(...positioned.map(({ y, height }) => y + height));
  const viewX = minX - pad;
  const viewY = minY - pad;
  const width = maxX - minX + pad * 2;
  const height = maxY - minY + pad * 2;

  return (
    <div className="physical-keyboard">
      <svg
        aria-label={ariaLabel}
        data-geometry-id={geometryId}
        height={height}
        role={operable ? 'group' : 'img'}
        preserveAspectRatio={horizontalAlign === 'left' ? 'xMinYMid meet' : 'xMidYMid meet'}
        viewBox={`${viewX} ${viewY} ${width} ${height}`}
        width={width}
      >
        {positioned.map(({ key, width: keyWidth, height: keyHeight, x, y }) => {
          const view = keyViews.get(key.id);
          const legend = view?.legend ?? key.id;
          const secondary = showSecondary ? view?.secondaryLegend : undefined;
          const legendFontSize = Math.max(7, unit * 0.24);
          const legendX = x + keyWidth / 2;
          const legendY = y + keyHeight / 2 + (secondary ? -1 : 4);
          const homeMarkHalfWidth = Math.max(3, unit * 0.1);
          const homeMarkY = legendY + Math.max(3, unit * 0.11);

          return (
            <g
              className="physical-keyboard-key"
              data-accent-slot={view?.accentSlot}
              data-accent-tone={view?.accentTone}
              data-combo={view?.combo || undefined}
              data-guide={view?.guide}
              data-highlighted={view?.highlighted || undefined}
              data-home={view?.home || undefined}
              data-key-id={key.id}
              data-lookup={view?.lookup || undefined}
              data-pressed={view?.pressed || undefined}
              data-trigger={view?.trigger || undefined}
              data-binding-target={selectedKeyId === key.id || undefined}
              data-interactive={onKeyClick === undefined ? undefined : true}
              key={key.id}
              data-selected={view?.selected || undefined}
              onClick={onKeyClick === undefined ? undefined : () => onKeyClick(key)}
              {...(operable && onKeyClick !== undefined ? {
                role: 'button',
                tabIndex: 0,
                'aria-pressed': view?.selected === true,
                'aria-label': legend === '' ? physicalKeyDisplayLabel(key.id, standard) : `${physicalKeyDisplayLabel(key.id, standard)}（${legend}）`,
                onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onKeyClick(key);
                  } else if (event.key === 'Escape' && onEscape !== undefined) {
                    event.stopPropagation();
                    onEscape();
                  }
                },
              } : {})}
            >
              <rect
                height={keyHeight}
                rx={6}
                width={keyWidth}
                x={x}
                y={y}
              />
              <text
                className="physical-keyboard-legend"
                style={{ fontSize: legendFontSize }}
                textAnchor="middle"
                x={legendX}
                y={legendY}
              >
                {legend}
              </text>
              {view?.home ? (
                <line
                  className="physical-keyboard-home-mark"
                  x1={legendX - homeMarkHalfWidth}
                  x2={legendX + homeMarkHalfWidth}
                  y1={homeMarkY}
                  y2={homeMarkY}
                />
              ) : null}
              {secondary && secondary !== legend ? (
                <text
                  className="physical-keyboard-secondary"
                  style={{ fontSize: Math.max(6, unit * 0.15) }}
                  textAnchor="middle"
                  x={x + keyWidth / 2}
                  y={y + keyHeight - 7}
                >
                  {secondary}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
