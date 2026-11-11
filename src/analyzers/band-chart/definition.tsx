import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type Ref, type RefObject } from 'react';
import type { BandQuantityId } from '#interpretation/band-quantities.ts';
import { bindOption, SelectOptionField } from '#ui/primitives/option-fields.tsx';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import { PopoverSelect } from '#ui/primitives/popover-select.tsx';
import type { AnalyzerSettingsProps, FigureImageSource, SetAnalyzerPaneParts, SetBodyProps } from '../pane-parts.tsx';
import { CopyImageControl } from '../copy-image-control.tsx';
import { fitLabel, FONT_SIZE, textWidth } from '../figure-text.ts';
import { useElementWidth } from '../use-element-width.tsx';
import { useVisibleHeight } from './use-visible-height.tsx';
import { useTextLanguage } from '../text-language-context.tsx';
import { visibleText } from '../visible-text.ts';
import { bandChartDefinition, type BandChartExtracted } from './extract.ts';
import {
  BAND_TEXT_SIZE,
  bandChartModel,
  bandLayout,
  legendBandIndices,
  legendLayout,
  nextLegendSort,
  pinsLegendAndCaption,
  percentText,
  segmentGeometries,
  type BandDisplayRow,
  type BandRowContext,
} from './figure-model.ts';
import { BAND_CHART_PANE_META, bandChartHelp } from './pane-meta.ts';
import { BAND_SORT_DIRECTIONS, bandChartOptions, DEFAULT_BAND_CHART_OPTIONS, type BandChartOptions, type BandSortDirection } from './options.ts';
import {
  BAND_QUANTITIES,
  BAND_QUANTITY_LIST,
  bandCaption,
  bandSampleText,
  effectiveSortBoundary,
  sortBoundaryCount,
  sortBoundaryName,
  type BandQuantity,
} from './quantities.ts';
import './band-chart-view.css';

/**
 * 帯グラフの可視化。
 *
 * 抽出の結果（`extract.ts`）の割合を、`figure-model.ts` が決めた座標に置くだけで、計算し直さない。
 * 行の順は呼び出し側（ホスト）が渡す `order` のまま。利用者が凡例の項目を押すか解析設定の「並び」で境目を選んだ時だけ、その境目までの割合で行を並べ替える。
 * 並び替えは順位や優劣を付けるものではない。
 * 全体の図の行を押して選ぶのは、利用者が見たい配列だけの図を下に描く表示の操作で、ツールが順位を決めるものではない。
 * 選んだ配列の図の行は全体の図と同じ並びで、行を押すと、その配列の区分ごとの割合を表に出す。
 */

export type BandChartRowContext = BandRowContext;
export type BandChartBodyProps = SetBodyProps<BandChartExtracted, BandChartOptions, BandChartRowContext>;

/** 凡例の項目の読み上げ名。今の状態だけを書く。 */
function legendSortLabel(label: string, state: 'desc' | 'asc' | undefined): string {
  if (state === 'desc') return `${label}、大きい順で並べ中`;
  if (state === 'asc') return `${label}、小さい順で並べ中`;
  return label;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** まだ幅を測っていない間に描く幅 [px]。 */
const FALLBACK_WIDTH = 360;
/** 画像で、凡例と帯の間に空ける間隔 [px]。 */
const IMAGE_LEGEND_GAP = 6;

/** 凡例と帯を1枚のSVGにまとめる。凡例は画面では図の上端に残る別の要素だが、画像には1枚の図として含める。 */
function composeImageSvg(legend: SVGSVGElement, rows: SVGSVGElement): SVGSVGElement {
  const width = rows.viewBox.baseVal.width;
  const legendHeight = legend.viewBox.baseVal.height;
  const rowsHeight = rows.viewBox.baseVal.height;
  const root = document.createElementNS(SVG_NS, 'svg');
  root.setAttribute('viewBox', `0 0 ${width} ${legendHeight + IMAGE_LEGEND_GAP + rowsHeight}`);
  const nest = (source: SVGSVGElement, y: number, height: number) => {
    const clone = source.cloneNode(true) as SVGSVGElement;
    clone.removeAttribute('class');
    clone.removeAttribute('style');
    // 選んでいる行の強調は画面の操作の状態なので、画像に入れない
    for (const element of clone.querySelectorAll('[data-selected]')) element.removeAttribute('data-selected');
    clone.setAttribute('x', '0');
    clone.setAttribute('y', String(y));
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    root.append(clone);
  };
  nest(legend, 0, legendHeight);
  nest(rows, legendHeight + IMAGE_LEGEND_GAP, rowsHeight);
  return root;
}

function rowAriaLabel(row: BandDisplayRow, quantity: BandQuantity, caption: string): string {
  const shares = row.row.shares.map((share, index) => `${quantity.labels[index]} ${percentText(share, 1)}`).join('、');
  return `${row.label}の${caption}。${shares}`;
}

interface HoverSegment {
  readonly targetKey: string;
  readonly index: number;
}

const NO_KEYS: ReadonlySet<string> = new Set();

/** 選んだ配列の図のキャプション。全体の図のキャプションに続ける。 */
const FOCUS_CAPTION_SUFFIX = '（選んだ配列）';

interface BandFigureProps {
  /** 'all'は全体の図、'focus'は選んだ配列だけの図 */
  readonly scope: 'all' | 'focus';
  readonly rows: readonly BandDisplayRow[];
  readonly quantity: BandQuantity;
  readonly caption: string;
  /** 図を置く領域の幅 [px] */
  readonly width: number;
  /** 図の高さの上限の元になる、見えている高さ。測れない間は `undefined` */
  readonly visibleHeight: number | undefined;
  /** 凡例に出す区分の番号 */
  readonly legendIndices: readonly number[];
  readonly sortBoundary: number;
  readonly sortDirection: BandSortDirection;
  readonly onLegendPress: (boundary: number) => void;
  /** 強調する行 */
  readonly highlighted: ReadonlySet<string>;
  readonly onRowPress: (targetKey: string) => void;
  readonly figureRef: Ref<HTMLElement>;
}

/**
 * 凡例・帯の行・キャプション。全体の図と選んだ配列の図が共有する。
 * 2つの図は、凡例・キャプションを別々に持ち、帯の太さは行の数に応じてそれぞれ決める。
 * 要素を探す属性は、全体の図は `data-band-*`、選んだ配列の図は `data-band-focus-*` にする。
 */
function BandFigure({
  scope,
  rows,
  quantity,
  caption,
  width,
  visibleHeight,
  legendIndices,
  sortBoundary,
  sortDirection,
  onLegendPress,
  highlighted,
  onRowPress,
  figureRef,
}: BandFigureProps) {
  const rowsRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<HoverSegment | undefined>(undefined);
  const { labels, colors } = quantity;
  const mark = (name: string, value: string | number = '') => ({ [scope === 'all' ? `data-band-${name}` : `data-band-focus-${name}`]: value });

  // 図のうち帯の行以外（凡例・キャプション・余白）の高さ。行の高さに依らず、幅と文字で決まる
  const [chromeHeight, setChromeHeight] = useState<number | undefined>(undefined);
  const rowsMaxHeight = visibleHeight === undefined || chromeHeight === undefined ? undefined : visibleHeight - chromeHeight;
  const layout = useMemo(() => bandLayout(width, rows.length, rowsMaxHeight), [width, rows.length, rowsMaxHeight]);
  const pinned = pinsLegendAndCaption(layout.mode, rows.length, rowsMaxHeight);
  const legend = useMemo(() => legendLayout(width, labels, legendIndices), [width, labels, legendIndices]);
  // 凡例の右端の項目は、左端からそこまでの割合がどの配列でも100%になり、並べ替えが決まらない
  const lastLegendIndex = legendIndices[legendIndices.length - 1];
  const hovered = hover === undefined ? undefined : rows.findIndex((row) => row.targetKey === hover.targetKey);

  // 帯の行のSVGは幅いっぱいに描くので、図の高さから行のSVGの高さを引くと、行以外の高さになる
  const legendHeight = legend.height;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 幅・凡例の高さ・キャプションは中で読まないが、行以外の高さが変わる時に測り直すために依存に入れる
  useLayoutEffect(() => {
    const rowsSvg = rowsRef.current;
    const figure = rowsSvg?.closest('figure');
    if (rowsSvg == null || figure == null) {
      setChromeHeight(undefined);
      return;
    }
    const next = Math.ceil(figure.getBoundingClientRect().height - rowsSvg.getBoundingClientRect().height);
    setChromeHeight((current) => (current === next ? current : next));
  }, [width, legendHeight, caption]);

  const onRowKeyDown = (event: KeyboardEvent<SVGGElement>, targetKey: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onRowPress(targetKey);
  };

  const tooltip = (() => {
    if (hover === undefined || hovered === undefined || hovered < 0) return undefined;
    const row = rows[hovered]!;
    const geometry = layout.rows[hovered]!;
    const segment = segmentGeometries(row.row.shares, layout.bandX, layout.bandWidth, layout.bandHeight).find(
      (candidate) => candidate.index === hover.index,
    );
    if (segment === undefined) return undefined;
    const text = `${labels[hover.index]}　${percentText(segment.share, 1)}`;
    const half = (textWidth(text, FONT_SIZE) + 16) / 2;
    const center = Math.min(Math.max(segment.x + segment.width / 2, half), Math.max(half, width - half));
    // 先頭の行は上に余白が無いので帯の下に、それ以外は下の行の割合を隠さないよう帯の上に出す
    const below = hovered === 0;
    return { text, left: center, top: below ? geometry.bandY + layout.bandHeight + 4 : geometry.bandY - 4, below };
  })();

  return (
    <figure ref={figureRef} className="band-figure" data-band-mode={layout.mode} data-band-pinned={pinned}>
      <div className="band-legend" {...mark('legend')}>
        {/* biome-ignore lint/a11y/useSemanticElements: SVGの図の中の凡例の項目（button）をまとめる役割で、fieldsetには置き換えられない */}
        <svg className="band-legend-svg" viewBox={`0 0 ${width} ${legend.height}`} aria-label="区分の凡例" role="group">
          {legend.items.map((item) => {
            const pressable = item.index !== lastLegendIndex;
            const boundary = item.index + 1;
            const active = pressable && sortBoundary === boundary;
            const state = active ? sortDirection : undefined;
            const directionMark = state === undefined ? '' : state === 'desc' ? '↓' : '↑';
            const content = (
              <>
                {pressable ? <rect className="band-legend-hit" x={item.swatchX - 4} y={item.y - 10} width={item.width + 4} height={20} rx={4} /> : null}
                <rect
                  className="band-segment band-swatch"
                  data-band={item.index}
                  data-band-color={colors[item.index]}
                  x={item.swatchX}
                  y={item.y - legend.swatch / 2}
                  width={legend.swatch}
                  height={legend.swatch}
                  rx={2}
                />
                <text className="band-legend-text" x={item.textX} y={item.y} dominantBaseline="central">
                  {item.label}
                </text>
                <text className="band-legend-mark" x={item.markX} y={item.y} dominantBaseline="central">
                  {directionMark}
                </text>
              </>
            );
            if (!pressable) {
              return (
                <g key={item.index} {...mark('legend-item', item.index)}>
                  {content}
                </g>
              );
            }
            return (
              // biome-ignore lint/a11y/useSemanticElements: SVGの<g>はbuttonに置き換えられない。押すと並べ替えを進める部品で、役割とキー操作をここで付けている
              <g
                key={item.index}
                className="band-legend-sort"
                role="button"
                tabIndex={0}
                aria-label={legendSortLabel(item.label, state)}
                {...mark('legend-item', item.index)}
                data-sort={state}
                onClick={() => onLegendPress(boundary)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onLegendPress(boundary);
                }}
              >
                {content}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="band-rows">
        {/* biome-ignore lint/a11y/useSemanticElements: SVGの図の中の行の集まりに付ける役割で、fieldsetには置き換えられない */}
        <svg ref={rowsRef} className="band-rows-svg" viewBox={`0 0 ${width} ${layout.height}`} role="group" aria-label={caption}>
          {rows.map((row, rowIndex) => {
            const geometry = layout.rows[rowIndex]!;
            const isSelected = highlighted.has(row.targetKey);
            const segments = segmentGeometries(row.row.shares, layout.bandX, layout.bandWidth, layout.bandHeight);
            const fitted = fitLabel(row.label, layout.labelWidth, FONT_SIZE);
            return (
              // biome-ignore lint/a11y/useSemanticElements: SVGの<g>はbuttonに置き換えられない。押して配列を選ぶ・4区分の割合を出す操作の部品で、役割とキー操作をここで付けている
              <g
                key={row.targetKey}
                className="band-row"
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={rowAriaLabel(row, quantity, caption)}
                {...mark('row', row.targetKey)}
                data-selected={isSelected || undefined}
                onClick={() => onRowPress(row.targetKey)}
                onKeyDown={(event) => onRowKeyDown(event, row.targetKey)}
              >
                <rect className="band-row-hit" x={0} y={geometry.top - 1} width={width} height={layout.hitHeight} rx={4} />
                <text className="band-row-label" x={geometry.labelX} y={geometry.labelY} dominantBaseline="central" {...mark('label-of', row.targetKey)}>
                  {fitted === row.label ? null : <title>{row.fullName || row.label}</title>}
                  {fitted}
                </text>
                {segments.map((segment) => (
                  <g key={segment.index}>
                    <rect
                      className="band-segment"
                      data-band={segment.index}
                      data-band-color={colors[segment.index]}
                      {...mark('segment', `${row.targetKey}:${segment.index}`)}
                      data-active={(hover?.targetKey === row.targetKey && hover.index === segment.index) || undefined}
                      x={segment.x}
                      y={geometry.bandY}
                      width={segment.width}
                      height={layout.bandHeight}
                      onPointerEnter={() => setHover({ targetKey: row.targetKey, index: segment.index })}
                      onPointerLeave={() =>
                        setHover((current) => (current?.targetKey === row.targetKey && current.index === segment.index ? undefined : current))
                      }
                    />
                    {segment.showText ? (
                      <text
                        className="band-segment-text"
                        data-band={segment.index}
                        data-band-color={colors[segment.index]}
                        x={segment.x + segment.width / 2}
                        y={geometry.bandY + layout.bandHeight / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{ fontSize: BAND_TEXT_SIZE }}
                      >
                        {percentText(segment.share, 0)}
                      </text>
                    ) : null}
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
        {tooltip === undefined ? null : (
          <div
            className="band-tooltip"
            role="tooltip"
            {...mark('tooltip')}
            data-below={tooltip.below || undefined}
            style={{ left: tooltip.left, top: tooltip.top }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
      <figcaption className="band-caption" {...mark('caption')}>
        {caption}
      </figcaption>
    </figure>
  );
}

export function BandChartBody({ extracted, order, rowContext, options, onOptionsChange, copyFigureImage }: BandChartBodyProps) {
  const language = useTextLanguage();
  const mainFigureRef = useRef<HTMLElement | null>(null);
  const focusFigureRef = useRef<HTMLElement | null>(null);
  const featureRef = useRef<HTMLElement>(null);
  const [measured, measureFigure] = useElementWidth(mainFigureRef);
  const width = measured === undefined || measured <= 0 ? FALLBACK_WIDTH : measured;
  /** 全体の図で選んだ配列。保存しない */
  const [pickedKeys, setPickedKeys] = useState<ReadonlySet<string>>(() => new Set());
  /** 選んだ配列の図で、区分ごとの値を表に出している配列 */
  const [detailKey, setDetailKey] = useState<string | undefined>(undefined);

  const sortBoundary = effectiveSortBoundary(extracted.quantity, options.sortBoundary);
  const sortDirection = options.sortDirection;
  const model = useMemo(
    () => bandChartModel(extracted, order, rowContext, { boundary: sortBoundary, direction: sortDirection }),
    [extracted, order, rowContext, sortBoundary, sortDirection],
  );
  const quantity = BAND_QUANTITIES[model.quantity];
  const { labels, colors } = quantity;
  const hasRows = model.rows.length > 0;
  const visibleHeight = useVisibleHeight(featureRef, hasRows);
  // 凡例は2つの図で同じ区分を出す。区分の名前と色が図によって変わらないようにする
  const legendIndices = useMemo(() => legendBandIndices(model.rows, labels.length), [model.rows, labels.length]);
  const pressLegend = (boundary: number) => {
    const next = nextLegendSort({ boundary: sortBoundary, direction: sortDirection }, boundary);
    onOptionsChange({ ...options, sortBoundary: next.boundary, sortDirection: next.direction });
  };
  // 選んだ配列の行は、全体の図と同じ並び（並べ替えを含む）
  const picked = useMemo(() => model.rows.filter((row) => pickedKeys.has(row.targetKey)), [model.rows, pickedKeys]);
  const detail = picked.find((row) => row.targetKey === detailKey);
  const caption = bandCaption(model.quantity, language);
  const focusCaption = `${caption}${FOCUS_CAPTION_SUFFIX}`;
  const sampleText = bandSampleText(model.quantity, language);
  const help = useMemo(() => bandChartHelp(model.quantity, language), [model.quantity, language]);

  // 対象から外れた配列は、選んだ配列からも外す
  useEffect(() => {
    if (picked.length !== pickedKeys.size) setPickedKeys(new Set(picked.map((row) => row.targetKey)));
  }, [picked, pickedKeys]);
  useEffect(() => {
    if (detailKey !== undefined && detail === undefined) setDetailKey(undefined);
  }, [detailKey, detail]);

  const imageSourceOf = (figureRef: RefObject<HTMLElement | null>) => (): FigureImageSource | undefined => {
    const figure = figureRef.current;
    const legendSvg = figure?.querySelector<SVGSVGElement>('.band-legend-svg');
    const rowsSvg = figure?.querySelector<SVGSVGElement>('.band-rows-svg');
    const captionElement = figure?.querySelector('figcaption');
    if (legendSvg == null || rowsSvg == null || captionElement == null) return undefined;
    return { svg: composeImageSvg(legendSvg, rowsSvg), caption: captionElement };
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

  return (
    <section ref={featureRef} className="band-chart-feature" data-react-feature="band-chart">
      {model.rows.length > 0 ? (
        <>
          <div className="band-heading">
            <InfoButton name="図の見方" description={BAND_CHART_PANE_META.description} help={help} />
            {copyFigureImage === undefined ? null : <CopyImageControl copyFigureImage={copyFigureImage} source={imageSourceOf(mainFigureRef)} />}
          </div>
          <BandFigure
            scope="all"
            rows={model.rows}
            quantity={quantity}
            caption={caption}
            width={width}
            visibleHeight={visibleHeight}
            legendIndices={legendIndices}
            sortBoundary={sortBoundary}
            sortDirection={sortDirection}
            onLegendPress={pressLegend}
            highlighted={pickedKeys}
            onRowPress={togglePicked}
            figureRef={measureFigure}
          />

          {picked.length === 0 ? null : (
            <>
              <div className="band-heading" data-band-focus="">
                <button type="button" className="band-clear" onClick={clearPicked}>
                  選んだ配列を外す
                </button>
                {copyFigureImage === undefined ? null : <CopyImageControl copyFigureImage={copyFigureImage} source={imageSourceOf(focusFigureRef)} />}
              </div>
              <BandFigure
                scope="focus"
                rows={picked}
                quantity={quantity}
                caption={focusCaption}
                width={width}
                visibleHeight={visibleHeight}
                legendIndices={legendIndices}
                sortBoundary={sortBoundary}
                sortDirection={sortDirection}
                onLegendPress={pressLegend}
                highlighted={detailKey === undefined ? NO_KEYS : new Set([detailKey])}
                onRowPress={toggleDetail}
                figureRef={focusFigureRef}
              />
              {detail === undefined ? null : (
                <div className="band-detail" data-band-detail={detail.targetKey}>
                  <p className="band-detail-title">
                    <span title={detail.fullName || detail.label}>{detail.label}</span>
                    <span className="band-detail-total">
                      {sampleText.totalLabel} {sampleText.total(detail.row.total)}
                    </span>
                  </p>
                  <table className="band-detail-table">
                    <thead>
                      <tr>
                        <th scope="col">区分</th>
                        <th scope="col">割合</th>
                        <th scope="col">{sampleText.countHeader}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labels.map((label, index) => (
                        <tr key={label} data-band-detail-row={index}>
                          <th scope="row">
                            <svg className="band-detail-swatch" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                              <rect className="band-segment" data-band={index} data-band-color={colors[index]} width="12" height="12" rx="2" />
                            </svg>
                            {label}
                          </th>
                          <td>{percentText(detail.row.shares[index]!, 1)}</td>
                          <td>{sampleText.count(detail.row.counts[index]!)}</td>
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

      {model.excluded.length > 0 ? (
        <ul className="band-excluded">
          {model.excluded.map((row) => (
            <li key={row.targetKey} data-band-excluded={row.status}>
              <span title={row.fullName || row.label}>{row.label}</span>
              <span role={row.status === 'failed' ? 'alert' : undefined} aria-busy={row.status === 'computing' || undefined}>
                {row.message}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {model.skipped.length > 0 ? (
        <table className="band-skipped" data-band-skipped="" aria-label="打てない文字">
          <thead>
            <tr>
              <th scope="col">配列</th>
              <th scope="col">打てない文字</th>
            </tr>
          </thead>
          <tbody>
            {model.skipped.map((row) => (
              <tr key={row.targetKey} data-band-skipped-row={row.targetKey}>
                <th scope="row" title={row.fullName || row.label}>
                  {row.label}
                </th>
                <td>
                  {row.chars.map((entry) => (
                    <span key={entry.char} className="band-skipped-char" data-band-skipped-char={entry.char}>
                      {visibleText(entry.char)}
                      <span className="band-skipped-count">{entry.count}回</span>
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {model.differentText.length > 0 ? (
        <p className="band-notice" data-band-different-text="">
          {model.differentText.map((row) => row.label).join('、')}は、評価に渡すテキストが{model.reference?.label ?? '他の対象'}
          と違います。割合は、それぞれのテキストで求めています。
        </p>
      ) : null}
    </section>
  );
}

const QUANTITY_CHOICES = BAND_QUANTITY_LIST.map((quantity) => ({ value: quantity.id, label: quantity.name }));

const DIRECTION_NAMES: Readonly<Record<BandSortDirection, string>> = { desc: '大きい順', asc: '小さい順' };
const DIRECTION_CHOICES = BAND_SORT_DIRECTIONS.map((direction) => ({ value: direction, label: DIRECTION_NAMES[direction] }));
const NO_SORT = '0';

/** 並びの選択肢。「選んだ順」（並べ替えない）と、量の区分の境目ごとの「<区分>までの割合」。値は境目の番号の文字列。 */
function sortChoices(quantity: BandQuantityId) {
  return [
    { value: NO_SORT, label: '選んだ順' },
    ...Array.from({ length: sortBoundaryCount(quantity) }, (_, index) => ({ value: String(index + 1), label: sortBoundaryName(quantity, index + 1) })),
  ];
}

/**
 * 量を替える。並びの境目の意味は量ごとに違うので、並びは「選んだ順」へ戻す。
 * 向きは量に依らないので持ち越す。
 */
function withQuantity(options: BandChartOptions, quantity: BandQuantityId): BandChartOptions {
  return quantity === options.quantity ? options : { ...options, quantity, sortBoundary: 0 };
}

/** 帯に出す量と並びの選択。量ごとの標本と区分の違いは、図の見方（ⓘ）に出す。 */
export function BandChartSettings({ options, onOptionsChange }: AnalyzerSettingsProps<BandChartOptions>) {
  const boundary = effectiveSortBoundary(options.quantity, options.sortBoundary);
  const sortBinding = bindOption(
    { sort: String(boundary) },
    { sort: NO_SORT },
    (next) => onOptionsChange({ ...options, sortBoundary: Number(next.sort) }),
    'sort',
  );
  return (
    <div className="option-groups">
      <SelectOptionField
        label="量"
        binding={{
          ...bindOption(options, DEFAULT_BAND_CHART_OPTIONS, onOptionsChange, 'quantity'),
          onChange: (quantity) => onOptionsChange(withQuantity(options, quantity)),
        }}
        choices={QUANTITY_CHOICES}
      />
      <SelectOptionField label="並び" binding={sortBinding} choices={sortChoices(options.quantity)} />
      {boundary === 0 ? null : (
        <SelectOptionField
          label="並びの向き"
          binding={bindOption(options, DEFAULT_BAND_CHART_OPTIONS, onOptionsChange, 'sortDirection')}
          choices={DIRECTION_CHOICES}
        />
      )}
    </div>
  );
}

/** ペインの見出しの行に置く量の選択。項目名は画面に出さず、読み上げ名にだけ使う。解析設定の小窓の「量」と同じ値を読み書きする。 */
export function BandChartHeaderControl({ options, onOptionsChange }: AnalyzerSettingsProps<BandChartOptions>) {
  return (
    <PopoverSelect
      label="量"
      value={options.quantity}
      choices={QUANTITY_CHOICES}
      onChange={(quantity) => onOptionsChange(withQuantity(options, quantity))}
    />
  );
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const bandChartAnalyzer = {
  definition: bandChartDefinition,
  ...BAND_CHART_PANE_META,
  Body: BandChartBody,
  Settings: BandChartSettings,
  HeaderControl: BandChartHeaderControl,
  defaultOptions: DEFAULT_BAND_CHART_OPTIONS,
  urlOptions: bandChartOptions,
  rowContext: ({ targetKey, label, fullName }) => ({ targetKey, label, fullName }),
} satisfies SetAnalyzerPaneParts<BandChartOptions, BandChartExtracted, BandChartRowContext>;
