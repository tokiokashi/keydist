import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import type { AnalyzerSettingsProps, FigureImageSource, SetAnalyzerPaneParts, SetBodyProps } from '../pane-parts.tsx';
import { CopyImageControl } from '../copy-image-control.tsx';
import { FigureTable, FigureTableSwitch } from '../figure-table-view.tsx';
import { FONT_SIZE, textWidth } from '../figure-text.ts';
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
  type BoxAxis,
  type BoxDisplayRow,
  type BoxRowContext,
} from './figure-model.ts';
import { BOX_PLOT_AXIS_TITLE, BOX_PLOT_FOCUS_CAPTION, BOX_PLOT_PANE_META, BOX_PLOT_QUANTITY_NAME, boxPlotSourceItems } from './pane-meta.ts';
import { boxPlotTableModel, QUANTILE_ROWS } from './table-model.ts';
import { boxPlotOptions, DEFAULT_BOX_PLOT_OPTIONS, type BoxPlotOptions } from './options.ts';
import './box-plot-view.css';

/**
 * 箱ひげ図の可視化。
 *
 * 抽出の結果（`extract.ts`）の5つの値を、`figure-model.ts` が決めた座標に置くだけで、計算し直さない。
 * 順位・並べ替え・基準の線は出さない。列の順は呼び出し側（ホスト）が渡す`order`のまま。
 * 全体の図の列を押して選ぶのは、利用者が見たい配列だけの図を下に描く表示の操作で、ツールが順位を決めるものではない。
 * 選んだ配列の図の縦軸は、全体の図と同じ範囲にする（選んだ範囲に縮めると差が大きく見えるため）。選んだ配列の図の列を押すと、その配列の5つの値を表に出す。
 */

export type BoxPlotRowContext = BoxRowContext;
export type BoxPlotBodyProps = SetBodyProps<BoxPlotExtracted, BoxPlotOptions, BoxPlotRowContext>;

const SVG_NS = 'http://www.w3.org/2000/svg';
/** まだ幅を測っていない間に描く幅 [px]。 */
const FALLBACK_WIDTH = 360;
/** 画面のキャプションの文字の大きさ [px]。box-plot-view.cssの1remとそろえる。 */
const CAPTION_FONT_SIZE = 16;
/** 目盛りの線の長さ [px]。枠の内向きに引く。 */
const TICK_LENGTH = 4;

const NO_KEYS: ReadonlySet<string> = new Set();

function columnAriaLabel(row: BoxDisplayRow): string {
  const { box } = row.row;
  return `${row.label}の${BOX_PLOT_QUANTITY_NAME}。中央値 ${distanceText(box.median)}、25%点 ${distanceText(box.lowerQuartile)}、75%点 ${distanceText(box.upperQuartile)}、10%点 ${distanceText(box.lowerWhisker)}、90%点 ${distanceText(box.upperWhisker)}`;
}

/** 縦軸の列と、スクロールする図を、1枚のSVGにまとめる（画像には図の全体を含める）。 */
function composeImageSvg(axis: SVGSVGElement, plot: SVGSVGElement, blockWidth: number): SVGSVGElement {
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

interface BoxFigureProps {
  /** 'all'は全体の図、'focus'は選んだ配列だけの図 */
  readonly scope: 'all' | 'focus';
  readonly rows: readonly BoxDisplayRow[];
  readonly axis: BoxAxis;
  /** 図とキャプションを置く領域の幅 [px] */
  readonly width: number;
  readonly caption: string;
  /** 強調する列 */
  readonly highlighted: ReadonlySet<string>;
  readonly onColumnPress: (targetKey: string) => void;
  readonly figureRef: RefObject<HTMLElement | null>;
}

/** 縦軸の列と箱ひげの図とキャプション。全体の図と選んだ配列の図が共有する。縦軸は呼び出し側が決めた目盛りをそのまま使う。 */
function BoxFigure({ scope, rows, axis, width, caption, highlighted, onColumnPress, figureRef }: BoxFigureProps) {
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
            {BOX_PLOT_AXIS_TITLE}
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
                  aria-label={columnAriaLabel(row)}
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

export function BoxPlotBody({ extracted, order, rowContext, segmentation, copyFigureImage }: BoxPlotBodyProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const mainFigureRef = useRef<HTMLElement>(null);
  const focusFigureRef = useRef<HTMLElement>(null);
  const [measured, measureFigure] = useElementWidth(measureRef);
  const width = measured === undefined || measured <= 0 ? FALLBACK_WIDTH : measured;
  /** 全体の図で選んだ配列。保存しない */
  const [pickedKeys, setPickedKeys] = useState<ReadonlySet<string>>(() => new Set());
  /** 選んだ配列の図で、5つの値を出している配列 */
  const [detailKey, setDetailKey] = useState<string | undefined>(undefined);
  /** 図の値を表で読む表示にしているか。保存しない */
  const [asTable, setAsTable] = useState(false);

  const unavailable = segmentation === 'unsupported' || segmentation === 'failed';
  const model = useMemo(() => boxPlotModel(extracted, order, rowContext), [extracted, order, rowContext]);
  const drawn = unavailable ? [] : model.rows;
  const range = useSharedScale(BOX_PLOT_SCALE_KEY, boxOwnRange(drawn));
  const axis = useMemo(() => boxAxis(range?.max ?? 0), [range?.max]);
  // 選んだ配列の列は、全体の図と同じ対象の順
  const picked = useMemo(() => drawn.filter((row) => pickedKeys.has(row.targetKey)), [drawn, pickedKeys]);
  const detail = picked.find((row) => row.targetKey === detailKey);
  const help = useMemo(
    () =>
      extracted.source === undefined
        ? BOX_PLOT_PANE_META.help
        : { ...BOX_PLOT_PANE_META.help, items: [...BOX_PLOT_PANE_META.help.items, ...boxPlotSourceItems(extracted.source)] },
    [extracted.source],
  );

  // 対象から外れた配列は、選んだ配列からも外す
  useEffect(() => {
    if (picked.length !== pickedKeys.size) setPickedKeys(new Set(picked.map((row) => row.targetKey)));
  }, [picked, pickedKeys]);
  useEffect(() => {
    if (detailKey !== undefined && detail === undefined) setDetailKey(undefined);
  }, [detailKey, detail]);

  const imageSourceOf = (figureRef: RefObject<HTMLElement | null>) => (): FigureImageSource | undefined => {
    const figure = figureRef.current;
    const axisSvg = figure?.querySelector<SVGSVGElement>('.box-plot-axis-svg');
    const plotSvg = figure?.querySelector<SVGSVGElement>('.box-plot-svg');
    const caption = figure?.querySelector('figcaption');
    if (figure == null || axisSvg == null || plotSvg == null || caption == null) return undefined;
    return { svg: composeImageSvg(axisSvg, plotSvg, Number.parseFloat(figure.style.width)), caption };
  };

  const togglePicked = (targetKey: string) =>
    setPickedKeys((current) => {
      const next = new Set(current);
      if (!next.delete(targetKey)) next.add(targetKey);
      return next;
    });
  const toggleDetail = (targetKey: string) => setDetailKey((current) => (current === targetKey ? undefined : targetKey));
  const clearPicked = () => {
    setPickedKeys(new Set());
    setDetailKey(undefined);
  };

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
            <FigureTableSwitch pressed={asTable} onToggle={() => setAsTable((current) => !current)} />
            {copyFigureImage === undefined || asTable ? null : (
              <CopyImageControl copyFigureImage={copyFigureImage} source={imageSourceOf(mainFigureRef)} />
            )}
          </div>
          {asTable ? <FigureTable model={boxPlotTableModel(drawn)} /> : null}
          <div ref={measureFigure} className="box-plot-figure-wrap" hidden={asTable}>
            <BoxFigure
              scope="all"
              rows={drawn}
              axis={axis}
              width={width}
              caption={BOX_PLOT_QUANTITY_NAME}
              highlighted={pickedKeys}
              onColumnPress={togglePicked}
              figureRef={mainFigureRef}
            />
          </div>
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

          {picked.length === 0 || asTable ? null : (
            <>
              <div className="box-plot-heading" data-box-plot-focus="">
                <button type="button" className="box-plot-clear" onClick={clearPicked}>
                  選んだ配列を外す
                </button>
                {copyFigureImage === undefined ? null : <CopyImageControl copyFigureImage={copyFigureImage} source={imageSourceOf(focusFigureRef)} />}
              </div>
              <div className="box-plot-figure-wrap">
                <BoxFigure
                  scope="focus"
                  rows={picked}
                  axis={axis}
                  width={width}
                  caption={BOX_PLOT_FOCUS_CAPTION}
                  highlighted={detailKey === undefined ? NO_KEYS : new Set([detailKey])}
                  onColumnPress={toggleDetail}
                  figureRef={focusFigureRef}
                />
              </div>
              {detail === undefined ? null : (
                <div className="box-plot-detail" data-box-plot-detail={detail.targetKey}>
                  <p className="box-plot-detail-title">
                    <span title={detail.fullName || detail.label}>{detail.label}</span>
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
                          <td>{distanceText(detail.row.box[key])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
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
