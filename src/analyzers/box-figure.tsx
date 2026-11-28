import { useMemo, type KeyboardEvent, type RefObject } from 'react';
import { FONT_SIZE, textWidth } from './figure-text.ts';
import {
  AXIS_FONT_SIZE,
  AXIS_WIDTH,
  LABEL_MAX_LENGTH,
  boxGeometry,
  boxPlotLayout,
  distanceText,
  fitVerticalLabel,
  valueY,
  verticalLabelLength,
  verticalLabelRuns,
  type BoxAxis,
  type BoxFigureRow,
} from './box-figure-model.ts';
import './box-figure.css';

/**
 * 縦の箱ひげ図1枚（縦軸の列・図・キャプション）と、画像の書き出しに使うSVGの合成。
 * 箱ひげ図のAnalyzerと、同じ見た目で分布を出す他のAnalyzerが共有する。座標は `figure-model.ts` が決め、ここは描くだけで計算し直さない。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
/** 画面のキャプションの文字の大きさ [px]。box-figure.cssの1remとそろえる。 */
const CAPTION_FONT_SIZE = 16;
/** 目盛りの線の長さ [px]。枠の内向きに引く。 */
const TICK_LENGTH = 4;

function columnAriaLabel(row: BoxFigureRow, quantityName: string): string {
  const { box } = row.row;
  return `${row.label}の${quantityName}。中央値 ${distanceText(box.median)}、25%点 ${distanceText(box.lowerQuartile)}、75%点 ${distanceText(box.upperQuartile)}、10%点 ${distanceText(box.lowerWhisker)}、90%点 ${distanceText(box.upperWhisker)}`;
}

/** 縦軸の列と、スクロールする図を、1枚のSVGにまとめる（画像には図の全体を含める）。 */
export function composeImageSvg(axis: SVGSVGElement, plot: SVGSVGElement, blockWidth: number): SVGSVGElement {
  const axisWidth = axis.viewBox.baseVal.width;
  const plotWidth = plot.viewBox.baseVal.width;
  const height = plot.viewBox.baseVal.height;
  const root = document.createElementNS(SVG_NS, 'svg');
  const left = Math.max(0, (blockWidth - axisWidth - plotWidth) / 2);
  root.setAttribute('viewBox', `0 0 ${Math.max(blockWidth, axisWidth + plotWidth)} ${height}`);
  const nest = (source: SVGSVGElement, x: number, width: number) => {
    const clone = source.cloneNode(true) as SVGSVGElement;
    for (const element of clone.querySelectorAll('[data-selected]')) element.removeAttribute('data-selected');
    clone.removeAttribute('class');
    clone.removeAttribute('style');
    clone.setAttribute('x', String(x));
    clone.setAttribute('y', '0');
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    root.append(clone);
  };
  nest(axis, left, axisWidth);
  nest(plot, left + axisWidth, plotWidth);
  return root;
}

export interface BoxFigureProps {
  /** 'all'は全体の図、'focus'は選んだ配列だけの図 */
  readonly scope: 'all' | 'focus';
  readonly rows: readonly BoxFigureRow[];
  readonly axis: BoxAxis;
  /** 縦軸の名前（量と単位） */
  readonly axisTitle: string;
  /** 列の読み上げ名に使う量の名前 */
  readonly quantityName: string;
  /** 図とキャプションを置く領域の幅 [px] */
  readonly width: number;
  readonly caption: string;
  /** 強調する列 */
  readonly highlighted: ReadonlySet<string>;
  readonly onColumnPress: (targetKey: string) => void;
  readonly figureRef: RefObject<HTMLElement | null>;
}

/** 縦軸の列と箱ひげの図とキャプション。全体の図と選んだ配列の図が共有する。縦軸は呼び出し側が決めた目盛りをそのまま使う。 */
export function BoxFigure({ scope, rows, axis, axisTitle, quantityName, width, caption, highlighted, onColumnPress, figureRef }: BoxFigureProps) {
  const fittedLabels = useMemo(() => rows.map((row) => fitVerticalLabel(row.label, LABEL_MAX_LENGTH, FONT_SIZE)), [rows]);
  const labelLength = useMemo(() => Math.max(0, ...fittedLabels.map((label) => verticalLabelLength(label, FONT_SIZE))), [fittedLabels]);
  const layout = useMemo(() => boxPlotLayout(Math.max(0, width - AXIS_WIDTH), rows.length, labelLength), [width, rows.length, labelLength]);
  const blockWidth = Math.max(layout.axisWidth + layout.plotWidth, Math.ceil(textWidth(caption, CAPTION_FONT_SIZE) * 1.1));
  const { frame } = layout;
  const onColumnKeyDown = (event: KeyboardEvent<SVGGElement>, targetKey: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onColumnPress(targetKey);
  };

  return (
    <figure ref={figureRef} className="box-plot-figure" style={{ width: blockWidth }}>
      <div className="box-plot-body" style={{ maxWidth: layout.axisWidth + layout.plotWidth }}>
        {/* 縦軸の列。図が横にスクロールしても残る */}
        <svg className="box-plot-axis-svg" width={AXIS_WIDTH} height={layout.height} viewBox={`0 0 ${AXIS_WIDTH} ${layout.height}`} aria-hidden="true">
          {axis.ticks.map((tick) => {
            const y = valueY(tick.value, axis.max, frame.y0, frame.y1);
            return (
              <text key={tick.value} className="box-plot-tick" x={AXIS_WIDTH - 8} y={y + 4} textAnchor="end" style={{ fontSize: AXIS_FONT_SIZE }}>
                {tick.text}
              </text>
            );
          })}
          <text
            className="box-plot-axis-title"
            x={0}
            y={0}
            transform={`translate(12 ${(frame.y0 + frame.y1) / 2}) rotate(-90)`}
            textAnchor="middle"
            style={{ fontSize: AXIS_FONT_SIZE }}
            data-box-plot-axis-title=""
          >
            {axisTitle}
          </text>
        </svg>
        <div className="box-plot-scroll" data-box-plot-scroll={scope}>
          {/* biome-ignore lint/a11y/useSemanticElements: SVGの図の中の列の集まりに付ける役割で、fieldsetには置き換えられない */}
          <svg
            className="box-plot-svg"
            width={layout.plotWidth}
            height={layout.height}
            viewBox={`0 0 ${layout.plotWidth} ${layout.height}`}
            role="group"
            aria-label={`${caption}の箱ひげ図`}
          >
            <rect className="box-plot-frame" x={frame.x0} y={frame.y0} width={frame.x1 - frame.x0} height={frame.y1 - frame.y0} />
            {axis.ticks.map((tick) => {
              const y = valueY(tick.value, axis.max, frame.y0, frame.y1);
              return (
                <path
                  key={tick.value}
                  className="box-plot-tick-mark"
                  data-box-plot-tick={tick.value}
                  d={`M0,${y}h${TICK_LENGTH}M${layout.plotWidth},${y}h${-TICK_LENGTH}`}
                />
              );
            })}

            {rows.map((row, index) => {
              const column = layout.columns[index]!;
              const isSelected = highlighted.has(row.targetKey);
              const y = boxGeometry(row.row.box, axis.max, frame.y0, frame.y1);
              const fitted = fittedLabels[index]!;
              const half = layout.boxWidth / 2;
              const cap = layout.capWidth / 2;
              return (
                // biome-ignore lint/a11y/useSemanticElements: SVGの<g>はbuttonに置き換えられない。押して配列を選ぶ・5つの値を出す操作の部品で、役割とキー操作をここで付けている
                <g
                  key={row.targetKey}
                  className="box-plot-column"
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={columnAriaLabel(row, quantityName)}
                  {...{ [scope === 'all' ? 'data-box-plot-row' : 'data-box-plot-focus-row']: row.targetKey }}
                  data-selected={isSelected || undefined}
                  onClick={() => onColumnPress(row.targetKey)}
                  onKeyDown={(event) => onColumnKeyDown(event, row.targetKey)}
                >
                  <rect
                    className="box-plot-column-hit"
                    x={column.left + 1}
                    y={1}
                    width={column.right - column.left - 2}
                    height={layout.height - 2}
                    rx={4}
                  />
                  <path
                    className="box-plot-whisker"
                    d={`M${column.centerX},${y.upperWhisker}V${y.upperQuartile}M${column.centerX},${y.lowerQuartile}V${y.lowerWhisker}M${column.centerX - cap},${y.upperWhisker}h${layout.capWidth}M${column.centerX - cap},${y.lowerWhisker}h${layout.capWidth}`}
                  />
                  <rect
                    className="box-plot-box"
                    data-box-plot-box={scope === 'all' ? row.targetKey : undefined}
                    x={column.centerX - half}
                    y={y.upperQuartile}
                    width={layout.boxWidth}
                    height={y.lowerQuartile - y.upperQuartile}
                  />
                  <path
                    className="box-plot-median"
                    data-box-plot-median={scope === 'all' ? row.targetKey : undefined}
                    d={`M${column.centerX - half},${y.median}h${layout.boxWidth}`}
                  />
                  <g className="box-plot-column-label" data-box-plot-label-of={scope === 'all' ? row.targetKey : undefined}>
                    {fitted === row.label ? null : <title>{row.fullName || row.label}</title>}
                    {verticalLabelRuns(fitted, FONT_SIZE).map((run) =>
                      run.upright ? (
                        <text
                          key={run.offset}
                          x={column.centerX}
                          y={layout.labelTopY + run.offset + FONT_SIZE / 2}
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          {run.text}
                        </text>
                      ) : (
                        <text
                          key={run.offset}
                          x={0}
                          y={0}
                          transform={`translate(${column.centerX} ${layout.labelTopY + run.offset}) rotate(90)`}
                          dominantBaseline="central"
                          textLength={run.length}
                          lengthAdjust="spacingAndGlyphs"
                        >
                          {run.text}
                        </text>
                      ),
                    )}
                  </g>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <figcaption className="box-plot-caption" data-box-plot-caption={scope}>
        {caption}
      </figcaption>
    </figure>
  );
}
