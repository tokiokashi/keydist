import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import type { AnalyzerSettingsProps, FigureImageSource, SetAnalyzerPaneParts, SetBodyProps } from '../pane-parts.tsx';
import { CopyImageControl } from '../copy-image-control.tsx';
import { FONT_SIZE } from '../figure-text.ts';
import { useSharedScale } from '../shared-scale.tsx';
import { useElementWidth } from '../use-element-width.tsx';
import { boxPlotDefinition, type BoxPlotExtracted } from './extract.ts';
import {
  AXIS_FONT_SIZE,
  AXIS_WIDTH,
  BOX_PLOT_SCALE_KEY,
  LABEL_MAX_LENGTH,
  boxAxis,
  boxGeometry,
  boxOwnRange,
  boxPlotLayout,
  fitVerticalLabel,
  boxPlotModel,
  distanceText,
  valueY,
  verticalLabelLength,
  verticalLabelRuns,
  type BoxDisplayRow,
  type BoxRowContext,
} from './figure-model.ts';
import { BOX_PLOT_AXIS_TITLE, BOX_PLOT_PANE_META, BOX_PLOT_QUANTITY_NAME, boxPlotSourceItems } from './pane-meta.ts';
import { boxPlotOptions, DEFAULT_BOX_PLOT_OPTIONS, type BoxPlotOptions } from './options.ts';
import './box-plot-view.css';

/**
 * 箱ひげ図の可視化。
 *
 * 抽出の結果（`extract.ts`）の5つの値を、`figure-model.ts` が決めた座標に置くだけで、計算し直さない。
 * 順位・並べ替え・特定の配列の強調・基準の線は出さない。列の順は呼び出し側（ホスト）が渡す`order`のまま。
 * 列を押して選ぶのは、利用者が見たい配列の5つの値を図の下に出す表示の操作で、ツールが順位を決めるものではない。
 */

export type BoxPlotRowContext = BoxRowContext;
export type BoxPlotBodyProps = SetBodyProps<BoxPlotExtracted, BoxPlotOptions, BoxPlotRowContext>;

const SVG_NS = 'http://www.w3.org/2000/svg';
/** まだ幅を測っていない間に描く幅 [px]。 */
const FALLBACK_WIDTH = 360;
/** 目盛りの線の長さ [px]。枠の内向きに引く。 */
const TICK_LENGTH = 4;

const QUANTILE_ROWS = [
  { key: 'upperWhisker', name: '90%点（ひげの上端）' },
  { key: 'upperQuartile', name: '75%点（箱の上端）' },
  { key: 'median', name: '中央値（箱の中の線）' },
  { key: 'lowerQuartile', name: '25%点（箱の下端）' },
  { key: 'lowerWhisker', name: '10%点（ひげの下端）' },
] as const;

function columnAriaLabel(row: BoxDisplayRow): string {
  const { box } = row.row;
  return `${row.label}の${BOX_PLOT_QUANTITY_NAME}。中央値 ${distanceText(box.median)}、25%点 ${distanceText(box.lowerQuartile)}、75%点 ${distanceText(box.upperQuartile)}、10%点 ${distanceText(box.lowerWhisker)}、90%点 ${distanceText(box.upperWhisker)}`;
}

/** 縦軸の列と、スクロールする図を、1枚のSVGにまとめる（画像には図の全体を含める）。 */
function composeImageSvg(axis: SVGSVGElement, plot: SVGSVGElement): SVGSVGElement {
  const axisWidth = axis.viewBox.baseVal.width;
  const plotWidth = plot.viewBox.baseVal.width;
  const height = plot.viewBox.baseVal.height;
  const root = document.createElementNS(SVG_NS, 'svg');
  root.setAttribute('viewBox', `0 0 ${axisWidth + plotWidth} ${height}`);
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
  nest(axis, 0, axisWidth);
  nest(plot, axisWidth, plotWidth);
  return root;
}

export function BoxPlotBody({ extracted, order, rowContext, segmentation, copyFigureImage }: BoxPlotBodyProps) {
  const figureRef = useRef<HTMLElement>(null);
  const axisRef = useRef<SVGSVGElement>(null);
  const plotRef = useRef<SVGSVGElement>(null);
  const measured = useElementWidth(figureRef);
  const width = measured === undefined || measured <= 0 ? FALLBACK_WIDTH : measured;
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);

  const unavailable = segmentation === 'unsupported' || segmentation === 'failed';
  const model = useMemo(() => boxPlotModel(extracted, order, rowContext), [extracted, order, rowContext]);
  const drawn = unavailable ? [] : model.rows;
  const range = useSharedScale(BOX_PLOT_SCALE_KEY, boxOwnRange(drawn));
  const axis = useMemo(() => boxAxis(range?.max ?? 0), [range?.max]);
  const fittedLabels = useMemo(() => drawn.map((row) => fitVerticalLabel(row.label, LABEL_MAX_LENGTH, FONT_SIZE)), [drawn]);
  const labelLength = useMemo(() => Math.max(0, ...fittedLabels.map((label) => verticalLabelLength(label, FONT_SIZE))), [fittedLabels]);
  const layout = useMemo(() => boxPlotLayout(Math.max(0, width - AXIS_WIDTH), drawn.length, labelLength), [width, drawn.length, labelLength]);
  const selected = drawn.find((row) => row.targetKey === selectedKey);
  const help = useMemo(
    () =>
      extracted.source === undefined
        ? BOX_PLOT_PANE_META.help
        : { ...BOX_PLOT_PANE_META.help, items: [...BOX_PLOT_PANE_META.help.items, ...boxPlotSourceItems(extracted.source)] },
    [extracted.source],
  );

  // 選んだ配列が対象から外れたら、選ぶのをやめる
  useEffect(() => {
    if (selectedKey !== undefined && selected === undefined) setSelectedKey(undefined);
  }, [selectedKey, selected]);

  const imageSource = (): FigureImageSource | undefined => {
    const caption = figureRef.current?.querySelector('figcaption');
    if (axisRef.current == null || plotRef.current == null || caption == null) return undefined;
    return { svg: composeImageSvg(axisRef.current, plotRef.current), caption };
  };

  const toggle = (targetKey: string) => setSelectedKey((current) => (current === targetKey ? undefined : targetKey));
  const onColumnKeyDown = (event: KeyboardEvent<SVGGElement>, targetKey: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggle(targetKey);
  };

  const { frame } = layout;
  const excluded = unavailable ? model.excluded.filter((row) => row.status === 'failed') : model.excluded;
  const countLine = model.segmentCounts;

  return (
    <section className="box-plot-feature" data-react-feature="box-plot">
      {segmentation === 'unsupported' ? (
        <p className="box-plot-notice" data-box-plot-unavailable="unsupported">
          文節の区切りは日本語のテキストでだけ使えるので、値を出しません。
        </p>
      ) : null}
      {segmentation === 'failed' ? (
        <p className="box-plot-notice" data-box-plot-unavailable="failed">
          文節の分割器を読み込めなかったので、値を出しません。
        </p>
      ) : null}

      {drawn.length > 0 ? (
        <>
          <div className="box-plot-heading">
            <InfoButton name="図の見方" description={BOX_PLOT_PANE_META.description} help={help} />
            {copyFigureImage === undefined ? null : <CopyImageControl copyFigureImage={copyFigureImage} source={imageSource} />}
          </div>
          <figure ref={figureRef} className="box-plot-figure">
            <div className="box-plot-body">
              {/* 縦軸の列。図が横にスクロールしても残る */}
              <svg
                ref={axisRef}
                className="box-plot-axis-svg"
                width={AXIS_WIDTH}
                height={layout.height}
                viewBox={`0 0 ${AXIS_WIDTH} ${layout.height}`}
                aria-hidden="true"
              >
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
                  {BOX_PLOT_AXIS_TITLE}
                </text>
              </svg>
              <div className="box-plot-scroll" data-box-plot-scroll="">
                {/* biome-ignore lint/a11y/useSemanticElements: SVGの図の中の列の集まりに付ける役割で、fieldsetには置き換えられない */}
                <svg
                  ref={plotRef}
                  className="box-plot-svg"
                  width={layout.plotWidth}
                  height={layout.height}
                  viewBox={`0 0 ${layout.plotWidth} ${layout.height}`}
                  role="group"
                  aria-label={`${BOX_PLOT_QUANTITY_NAME}の箱ひげ図`}
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

                  {drawn.map((row, index) => {
                    const column = layout.columns[index]!;
                    const isSelected = selected?.targetKey === row.targetKey;
                    const y = boxGeometry(row.row.box, axis.max, frame.y0, frame.y1);
                    const fitted = fittedLabels[index]!;
                    const half = layout.boxWidth / 2;
                    const cap = layout.capWidth / 2;
                    return (
                      // biome-ignore lint/a11y/useSemanticElements: SVGの<g>はbuttonに置き換えられない。押すとその配列の5つの値を図の下に出す操作の部品で、役割とキー操作をここで付けている
                      <g
                        key={row.targetKey}
                        className="box-plot-column"
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        aria-label={columnAriaLabel(row)}
                        data-box-plot-row={row.targetKey}
                        data-selected={isSelected || undefined}
                        onClick={() => toggle(row.targetKey)}
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
                          data-box-plot-box={row.targetKey}
                          x={column.centerX - half}
                          y={y.upperQuartile}
                          width={layout.boxWidth}
                          height={y.lowerQuartile - y.upperQuartile}
                        />
                        <path
                          className="box-plot-median"
                          data-box-plot-median={row.targetKey}
                          d={`M${column.centerX - half},${y.median}h${layout.boxWidth}`}
                        />
                        <g className="box-plot-column-label" data-box-plot-label-of={row.targetKey}>
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
            <figcaption className="box-plot-caption" data-box-plot-caption="" style={{ width: layout.axisWidth + layout.plotWidth }}>
              {BOX_PLOT_QUANTITY_NAME}
            </figcaption>
          </figure>

          {countLine === undefined ? null : (
            <p className="box-plot-count" data-box-plot-segment-count="">
              {countLine.kind === 'shared' ? (
                <>文節 {countLine.count}</>
              ) : (
                <>
                  文節{' '}
                  {countLine.entries.map((entry, index) => (
                    <span key={entry.targetKey}>
                      {index === 0 ? '' : '、'}
                      <span title={entry.fullName || entry.label}>{entry.label}</span> {entry.count}
                    </span>
                  ))}
                </>
              )}
            </p>
          )}

          {selected === undefined ? null : (
            <div className="box-plot-detail" data-box-plot-detail={selected.targetKey}>
              <p className="box-plot-detail-title">
                <span title={selected.fullName || selected.label}>{selected.label}</span>
              </p>
              <table className="box-plot-detail-table">
                <thead>
                  <tr>
                    <th scope="col">分位点</th>
                    <th scope="col">{BOX_PLOT_AXIS_TITLE}</th>
                  </tr>
                </thead>
                <tbody>
                  {QUANTILE_ROWS.map(({ key, name }) => (
                    <tr key={key} data-box-plot-detail-row={key}>
                      <th scope="row">{name}</th>
                      <td>{distanceText(selected.row.box[key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {!unavailable && model.differentText.length > 0 ? (
        <p className="box-plot-notice" data-box-plot-different-text="">
          {model.differentText.map((row) => row.label).join('、')}は、評価に渡すテキストまたは区切りが{model.reference?.label ?? '他の対象'}と違います。
        </p>
      ) : null}

      {!unavailable && extracted.source === undefined && excluded.every((row) => row.status !== 'computing') ? (
        <p className="box-plot-notice" data-box-plot-empty="">
          値を出せる対象がありません。
        </p>
      ) : null}

      {excluded.length > 0 ? (
        <ul className="box-plot-excluded">
          {excluded.map((row) => (
            <li key={row.targetKey} data-box-plot-excluded={row.status}>
              <span title={row.fullName || row.label}>{row.label}</span>
              <span role={row.status === 'failed' ? 'alert' : undefined} aria-busy={row.status === 'computing' || undefined}>
                {row.message}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** 設定できる項目は無い。 */
export function BoxPlotSettings(_props: AnalyzerSettingsProps<BoxPlotOptions>) {
  return <p className="box-plot-notice">このAnalyzerに解析設定はありません。</p>;
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const boxPlotAnalyzer = {
  definition: boxPlotDefinition,
  ...BOX_PLOT_PANE_META,
  Body: BoxPlotBody,
  Settings: BoxPlotSettings,
  defaultOptions: DEFAULT_BOX_PLOT_OPTIONS,
  urlOptions: boxPlotOptions,
  rowContext: ({ targetKey, label, fullName }) => ({ targetKey, label, fullName }),
  // 文節の区切りを常に使う。ホストが文節の分割器を読み込んで、区切りを入力へ載せる
  usesSegmentation: () => true,
} satisfies SetAnalyzerPaneParts<BoxPlotOptions, BoxPlotExtracted, BoxPlotRowContext>;
