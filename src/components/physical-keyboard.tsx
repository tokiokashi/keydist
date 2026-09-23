import { isThumb, type Key } from '../geometry.ts';

export interface PhysicalKeyboardKeyView {
  readonly legend?: string;
  readonly secondaryLegend?: string;
  readonly pressed?: boolean;
  readonly highlighted?: boolean;
  readonly trigger?: boolean;
  readonly combo?: boolean;
  readonly accentSlot?: number;
  readonly guide?: 'continuation' | 'output';
  readonly lookup?: boolean;
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
}

const DEFAULT_UNIT = 54;
const GAP_RATIO = 4 / DEFAULT_UNIT;
const PAD_RATIO = 8 / DEFAULT_UNIT;
const THUMB_WIDTH = 1.9;

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
}: PhysicalKeyboardProps) {
  const gap = unit * GAP_RATIO;
  const pad = unit * PAD_RATIO;
  const positioned = keys.map((key) => {
    const widthU = key.width ?? (isThumb(key.finger) ? THUMB_WIDTH : 1);
    const width = Math.max(unit * widthU - gap, unit / 4);
    const height = unit - gap;
    const x = (key.x - (widthU - 1) / 2) * unit;
    const y = key.y * unit;
    return { key, width, height, x, y };
  });

  if (positioned.length === 0) {
    return <div className="physical-keyboard physical-keyboard-empty">表示できるキーがない。</div>;
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
        role="img"
        preserveAspectRatio={horizontalAlign === 'left' ? 'xMinYMid meet' : 'xMidYMid meet'}
        viewBox={`${viewX} ${viewY} ${width} ${height}`}
        width={width}
      >
        {positioned.map(({ key, width: keyWidth, height: keyHeight, x, y }) => {
          const view = keyViews.get(key.id);
          const legend = view?.legend ?? key.id;
          const secondary = showSecondary ? view?.secondaryLegend : undefined;

          return (
            <g
              className="physical-keyboard-key"
              data-accent-slot={view?.accentSlot}
              data-combo={view?.combo || undefined}
              data-guide={view?.guide}
              data-highlighted={view?.highlighted || undefined}
              data-key-id={key.id}
              data-lookup={view?.lookup || undefined}
              data-pressed={view?.pressed || undefined}
              data-trigger={view?.trigger || undefined}
              data-binding-target={selectedKeyId === key.id || undefined}
              data-interactive={onKeyClick === undefined ? undefined : true}
              key={key.id}
              onClick={onKeyClick === undefined ? undefined : () => onKeyClick(key)}
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
                style={{ fontSize: Math.max(7, unit * 0.24) }}
                textAnchor="middle"
                x={x + keyWidth / 2}
                y={y + keyHeight / 2 + (secondary ? -1 : 4)}
              >
                {legend}
              </text>
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
