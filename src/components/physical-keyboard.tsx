import { isThumb, type Key } from '../geometry.ts';

export type PhysicalKeyboardKeyRole =
  | 'normal'
  | 'modifier'
  | 'trigger'
  | 'combo';

export interface PhysicalKeyboardKeyView {
  readonly legend?: string;
  readonly secondaryLegend?: string;
  readonly pressed?: boolean;
  readonly highlighted?: boolean;
  readonly role?: PhysicalKeyboardKeyRole;
}

export interface PhysicalKeyboardProps {
  readonly keys: readonly Key[];
  readonly keyViews?: ReadonlyMap<string, PhysicalKeyboardKeyView>;
  readonly ariaLabel?: string;
  readonly geometryId?: string;
}

const UNIT = 54;
const GAP = 4;
const PAD = 8;
const THUMB_WIDTH = 1.9;

export function PhysicalKeyboard({
  keys,
  keyViews = new Map(),
  ariaLabel = '物理キーボード',
  geometryId,
}: PhysicalKeyboardProps) {
  const positioned = keys.map((key) => {
    const widthU = key.width ?? (isThumb(key.finger) ? THUMB_WIDTH : 1);
    const width = Math.max(UNIT * widthU - GAP, UNIT / 4);
    const height = UNIT - GAP;
    const x = (key.x - (widthU - 1) / 2) * UNIT;
    const y = key.y * UNIT;
    return { key, width, height, x, y };
  });

  if (positioned.length === 0) {
    return <div className="physical-keyboard physical-keyboard-empty">表示できるキーがない。</div>;
  }

  const minX = Math.min(...positioned.map(({ x }) => x));
  const minY = Math.min(...positioned.map(({ y }) => y));
  const maxX = Math.max(...positioned.map(({ x, width }) => x + width));
  const maxY = Math.max(...positioned.map(({ y, height }) => y + height));
  const viewX = minX - PAD;
  const viewY = minY - PAD;
  const width = maxX - minX + PAD * 2;
  const height = maxY - minY + PAD * 2;

  return (
    <div className="physical-keyboard">
      <svg
        aria-label={ariaLabel}
        data-geometry-id={geometryId}
        height={height}
        role="img"
        viewBox={`${viewX} ${viewY} ${width} ${height}`}
        width={width}
      >
        {positioned.map(({ key, width: keyWidth, height: keyHeight, x, y }) => {
          const view = keyViews.get(key.id);
          const legend = view?.legend ?? key.id;
          const secondary = view?.secondaryLegend;

          return (
            <g
              className="physical-keyboard-key"
              data-highlighted={view?.highlighted || undefined}
              data-key-id={key.id}
              data-pressed={view?.pressed || undefined}
              data-role={view?.role}
              key={key.id}
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
                textAnchor="middle"
                x={x + keyWidth / 2}
                y={y + keyHeight / 2 + (secondary ? -1 : 4)}
              >
                {legend}
              </text>
              {secondary && secondary !== legend ? (
                <text
                  className="physical-keyboard-secondary"
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
