import { useId, type KeyboardEvent } from 'react';
import type { Key } from '#input/shapes/geometry.ts';
import { bandThicknessRatio } from './band-thickness.ts';
import { drawnKeySpans } from '#input/shapes/drawn-key-spans.ts';
import { keyboardStandardForGeometryId, physicalKeyDisplayLabel } from '#input/shapes/key-labels.ts';

/**
 * キーの縁に沿う帯。キーを複数の色で示す時に、キー全体の色の上に重ねる。
 * 帯の幅（下の帯は高さ）はキーの1/4で、同じ縁に並ぶ帯が多い時は細くする
 * （左右の縁は合計が3/8まで、下の縁は1/2まで。太さは`bandThicknessRatio`が決める）。
 */
export interface PhysicalKeyboardKeyBand {
  /** 色の番号（1から8）。`'muted'` は目立たない1色。 */
  readonly tone: number | 'muted';
  readonly edge: 'left' | 'right' | 'bottom';
  /** 縁から数えた並び。0が縁に接する帯。 */
  readonly depth: number;
  /** 読み上げとhoverに出す名前。 */
  readonly label?: string;
}

export interface PhysicalKeyboardKeyView {
  readonly legend?: string | undefined;
  readonly secondaryLegend?: string | undefined;
  readonly pressed?: boolean | undefined;
  readonly highlighted?: boolean | undefined;
  readonly trigger?: boolean | undefined;
  readonly combo?: boolean | undefined;
  readonly accentSlot?: number | undefined;
  /** キー全体を塗る色の番号（1から8）。 */
  readonly fillTone?: number | undefined;
  /** キーの縁に重ねる帯。 */
  readonly bands?: readonly PhysicalKeyboardKeyBand[] | undefined;
  /** 読み上げとhoverに足す説明。 */
  readonly description?: string | undefined;
  /** レイヤーの色の番号を持たない、目立たない1色の枠（まとめられた側のレイヤーのトリガー）。 */
  readonly accentTone?: 'muted' | undefined;
  readonly guide?: 'continuation' | 'output' | 'trigger' | undefined;
  readonly lookup?: boolean | undefined;
  /** キーを選んでいく操作で、選択中のキー。 */
  readonly selected?: boolean | undefined;
  readonly home?: boolean | undefined;
}

export interface PhysicalKeyboardProps {
  readonly keys: readonly Key[];
  readonly keyViews?: ReadonlyMap<string, PhysicalKeyboardKeyView> | undefined;
  readonly ariaLabel?: string | undefined;
  readonly geometryId?: string | undefined;
  readonly unit?: number | undefined;
  readonly showSecondary?: boolean | undefined;
  readonly horizontalAlign?: 'left' | 'center' | undefined;
  readonly selectedKeyId?: string | undefined;
  readonly onKeyClick?: ((key: Key) => void) | undefined;
  /**
   * キーをボタンとして扱い、Tabで移れてEnter・Spaceで押せるようにする（`onKeyClick` と一緒に使う）。
   * 各キーの `selected` が押された状態になる。Escapeは `onEscape` を呼ぶ。
   */
  readonly operable?: boolean | undefined;
  readonly onEscape?: (() => void) | undefined;
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
  const clipPrefix = useId();
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
        {positioned.map(({ key, width: keyWidth, height: keyHeight, x, y }, keyIndex) => {
          const view = keyViews.get(key.id);
          const bands = view?.bands ?? [];
          const clipId = `${clipPrefix}-clip-${keyIndex}`;
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
              data-fill-tone={view?.fillTone}
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
                'aria-label': legend === '' ? physicalKeyDisplayLabel(key.id, standard) : `${physicalKeyDisplayLabel(key.id, standard)}（${legend}${view?.description === undefined ? '' : `。${view.description}`}）`,
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
              {view?.description === undefined ? null : <title>{view.description}</title>}
              <rect
                height={keyHeight}
                rx={6}
                width={keyWidth}
                x={x}
                y={y}
              />
              {bands.length === 0 ? null : (
                <>
                  {/* 帯がキーの角からはみ出さないよう、枠の内側の角丸で切り抜く */}
                  <clipPath id={clipId}>
                    <rect height={keyHeight - 3} rx={4.5} width={keyWidth - 3} x={x + 1.5} y={y + 1.5} />
                  </clipPath>
                  <g clipPath={`url(#${clipId})`}>
                    {bands.map((band) => {
                      const sameEdge = bands.filter((other) => other.edge === band.edge).length;
                      const ratio = bandThicknessRatio(band.edge, sameEdge);
                      const thickness = (band.edge === 'bottom' ? keyHeight : keyWidth) * ratio;
                      const left = band.edge === 'left' ? x + band.depth * thickness
                        : band.edge === 'right' ? x + keyWidth - (band.depth + 1) * thickness
                          : x;
                      const top = band.edge === 'bottom' ? y + keyHeight - (band.depth + 1) * thickness : y;
                      const bandWidth = band.edge === 'bottom' ? keyWidth : thickness;
                      const bandHeight = band.edge === 'bottom' ? thickness : keyHeight;
                      return (
                        <path
                          className="physical-keyboard-band"
                          d={`M${left} ${top}h${bandWidth}v${bandHeight}h${-bandWidth}z`}
                          data-band-edge={band.edge}
                          data-band-tone={band.tone}
                          key={`${band.edge}-${band.depth}`}
                        >
                          {band.label === undefined ? null : <title>{band.label}</title>}
                        </path>
                      );
                    })}
                  </g>
                </>
              )}
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
