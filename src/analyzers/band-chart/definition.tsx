import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { bindOption, SelectOptionField } from '#ui/primitives/option-fields.tsx';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import { PopoverSelect } from '#ui/primitives/popover-select.tsx';
import type { AnalyzerSettingsProps, FigureImageSource, SetAnalyzerPaneParts, SetBodyProps } from '../pane-parts.tsx';
import { CopyImageControl } from '../copy-image-control.tsx';
import { fitLabel, FONT_SIZE, textWidth } from '../figure-text.ts';
import { useElementWidth } from '../use-element-width.tsx';
import { useTextLanguage } from '../text-language-context.tsx';
import { visibleText } from '../visible-text.ts';
import { bandChartDefinition, type BandChartExtracted } from './extract.ts';
import {
  BAND_HEIGHT,
  BAND_TEXT_SIZE,
  bandChartModel,
  bandLayout,
  legendBandIndices,
  legendLayout,
  percentText,
  segmentGeometries,
  type BandDisplayRow,
  type BandRowContext,
} from './figure-model.ts';
import { BAND_CHART_PANE_META, bandChartHelp } from './pane-meta.ts';
import { bandChartOptions, DEFAULT_BAND_CHART_OPTIONS, type BandChartOptions } from './options.ts';
import { BAND_QUANTITIES, BAND_QUANTITY_LIST, bandCaption, bandSampleText, type BandQuantity } from './quantities.ts';
import './band-chart-view.css';

/**
 * 帯グラフの可視化。
 *
 * 抽出の結果（`extract.ts`）の割合を、`figure-model.ts` が決めた座標に置くだけで、計算し直さない。
 * 順位・並べ替え・特定の配列の強調は出さない。行の順は呼び出し側（ホスト）が渡す `order` のまま。
 * 行を押して選ぶのは、利用者が見たい配列の4区分の割合を図の下に出す表示の操作で、ツールが順位を決めるものではない。
 */

export type BandChartRowContext = BandRowContext;
export type BandChartBodyProps = SetBodyProps<BandChartExtracted, BandChartOptions, BandChartRowContext>;

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

export function BandChartBody({ extracted, order, rowContext, copyFigureImage }: BandChartBodyProps) {
  const language = useTextLanguage();
  const figureRef = useRef<HTMLElement>(null);
  const legendRef = useRef<SVGSVGElement>(null);
  const rowsRef = useRef<SVGSVGElement>(null);
  const measured = useElementWidth(figureRef);
  const width = measured === undefined || measured <= 0 ? FALLBACK_WIDTH : measured;
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);
  const [hover, setHover] = useState<HoverSegment | undefined>(undefined);

  const model = useMemo(() => bandChartModel(extracted, order, rowContext), [extracted, order, rowContext]);
  const quantity = BAND_QUANTITIES[model.quantity];
  const { labels, colors } = quantity;
  const layout = useMemo(() => bandLayout(width, model.rows.length), [width, model.rows.length]);
  const legendIndices = useMemo(() => legendBandIndices(model.rows, labels.length), [model.rows, labels.length]);
  const legend = useMemo(() => legendLayout(width, labels, legendIndices), [width, labels, legendIndices]);
  const selected = model.rows.find((row) => row.targetKey === selectedKey);
  const hovered = hover === undefined ? undefined : model.rows.findIndex((row) => row.targetKey === hover.targetKey);
  const caption = bandCaption(model.quantity, language);
  const sampleText = bandSampleText(model.quantity, language);
  const help = useMemo(() => bandChartHelp(model.quantity, language), [model.quantity, language]);

  // 選んだ配列が対象から外れたら、選ぶのをやめる
  useEffect(() => {
    if (selectedKey !== undefined && selected === undefined) setSelectedKey(undefined);
  }, [selectedKey, selected]);

  const imageSource = (): FigureImageSource | undefined => {
    const caption = figureRef.current?.querySelector('figcaption');
    if (legendRef.current == null || rowsRef.current == null || caption == null) return undefined;
    return { svg: composeImageSvg(legendRef.current, rowsRef.current), caption };
  };

  const toggle = (targetKey: string) => setSelectedKey((current) => (current === targetKey ? undefined : targetKey));
  const onRowKeyDown = (event: KeyboardEvent<SVGGElement>, targetKey: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggle(targetKey);
  };

  const tooltip = (() => {
    if (hover === undefined || hovered === undefined || hovered < 0) return undefined;
    const row = model.rows[hovered]!;
    const geometry = layout.rows[hovered]!;
    const segment = segmentGeometries(row.row.shares, layout.bandX, layout.bandWidth).find((candidate) => candidate.index === hover.index);
    if (segment === undefined) return undefined;
    const text = `${labels[hover.index]}　${percentText(segment.share, 1)}`;
    const half = (textWidth(text, FONT_SIZE) + 16) / 2;
    const center = Math.min(Math.max(segment.x + segment.width / 2, half), Math.max(half, width - half));
    // 先頭の行は上に余白が無いので帯の下に、それ以外は下の行の割合を隠さないよう帯の上に出す
    const below = hovered === 0;
    return { text, left: center, top: below ? geometry.bandY + BAND_HEIGHT + 4 : geometry.bandY - 4, below };
  })();

  return (
    <section className="band-chart-feature" data-react-feature="band-chart">
      {model.rows.length > 0 ? (
        <>
          <div className="band-heading">
            <InfoButton name="図の見方" description={BAND_CHART_PANE_META.description} help={help} />
            {copyFigureImage === undefined ? null : <CopyImageControl copyFigureImage={copyFigureImage} source={imageSource} />}
          </div>
          <figure ref={figureRef} className="band-figure" data-band-mode={layout.mode}>
            <div className="band-legend" data-band-legend="">
              <svg ref={legendRef} className="band-legend-svg" viewBox={`0 0 ${width} ${legend.height}`} aria-label="区分の凡例" role="img">
                {legend.items.map((item) => (
                  <g key={item.index} data-band-legend-item={item.index}>
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
                  </g>
                ))}
              </svg>
            </div>
            <div className="band-rows">
              {/* biome-ignore lint/a11y/useSemanticElements: SVGの図の中の行の集まりに付ける役割で、fieldsetには置き換えられない */}
              <svg ref={rowsRef} className="band-rows-svg" viewBox={`0 0 ${width} ${layout.height}`} role="group" aria-label={caption}>
                {model.rows.map((row, rowIndex) => {
                  const geometry = layout.rows[rowIndex]!;
                  const isSelected = selected?.targetKey === row.targetKey;
                  const segments = segmentGeometries(row.row.shares, layout.bandX, layout.bandWidth);
                  const fitted = fitLabel(row.label, layout.labelWidth, FONT_SIZE);
                  return (
                    // biome-ignore lint/a11y/useSemanticElements: SVGの<g>はbuttonに置き換えられない。押すと4区分の割合を図の下に出す操作の部品で、役割とキー操作をここで付けている
                    <g
                      key={row.targetKey}
                      className="band-row"
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={rowAriaLabel(row, quantity, caption)}
                      data-band-row={row.targetKey}
                      data-selected={isSelected || undefined}
                      onClick={() => toggle(row.targetKey)}
                      onKeyDown={(event) => onRowKeyDown(event, row.targetKey)}
                    >
                      <rect
                        className="band-row-hit"
                        x={0}
                        y={geometry.top - 1}
                        width={width}
                        height={geometry.bottom - geometry.top - (layout.mode === 'inline' ? 6 : 8)}
                        rx={4}
                      />
                      <text
                        className="band-row-label"
                        x={geometry.labelX}
                        y={geometry.labelY}
                        dominantBaseline="central"
                        data-band-label-of={row.targetKey}
                      >
                        {fitted === row.label ? null : <title>{row.fullName || row.label}</title>}
                        {fitted}
                      </text>
                      {segments.map((segment) => (
                        <g key={segment.index}>
                          <rect
                            className="band-segment"
                            data-band={segment.index}
                            data-band-color={colors[segment.index]}
                            data-band-segment={`${row.targetKey}:${segment.index}`}
                            data-active={(hover?.targetKey === row.targetKey && hover.index === segment.index) || undefined}
                            x={segment.x}
                            y={geometry.bandY}
                            width={segment.width}
                            height={BAND_HEIGHT}
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
                              y={geometry.bandY + BAND_HEIGHT / 2}
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
                  data-band-tooltip=""
                  data-below={tooltip.below || undefined}
                  style={{ left: tooltip.left, top: tooltip.top }}
                >
                  {tooltip.text}
                </div>
              )}
            </div>
            <figcaption className="band-caption" data-band-caption="">
              {caption}
            </figcaption>
          </figure>

          {selected === undefined ? null : (
            <div className="band-detail" data-band-detail={selected.targetKey}>
              <p className="band-detail-title">
                <span title={selected.fullName || selected.label}>{selected.label}</span>
                <span className="band-detail-total">
                  {sampleText.totalLabel} {sampleText.total(selected.row.total)}
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
                      <td>{percentText(selected.row.shares[index]!, 1)}</td>
                      <td>{sampleText.count(selected.row.counts[index]!)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

/** 帯に出す量の選択。量ごとの標本と区分の違いは、図の見方（ⓘ）に出す。 */
export function BandChartSettings({ options, onOptionsChange }: AnalyzerSettingsProps<BandChartOptions>) {
  return (
    <div className="option-groups">
      <SelectOptionField label="量" binding={bindOption(options, DEFAULT_BAND_CHART_OPTIONS, onOptionsChange, 'quantity')} choices={QUANTITY_CHOICES} />
    </div>
  );
}

/** ペインの見出しの行に置く量の選択。項目名は画面に出さず、読み上げ名にだけ使う。解析設定の小窓の「量」と同じ値を読み書きする。 */
export function BandChartHeaderControl({ options, onOptionsChange }: AnalyzerSettingsProps<BandChartOptions>) {
  return (
    <PopoverSelect label="量" value={options.quantity} choices={QUANTITY_CHOICES} onChange={(quantity) => onOptionsChange({ ...options, quantity })} />
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
