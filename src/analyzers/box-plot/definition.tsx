import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import type { AnalyzerSettingsProps, FigureImageSource, SetAnalyzerPaneParts, SetBodyProps } from '../pane-parts.tsx';
import { CopyImageControl } from '../copy-image-control.tsx';
import { fitLabel, FONT_SIZE } from '../figure-text.ts';
import { segmentationSourceSentence } from '../segmentation-text.ts';
import { useSharedScale } from '../shared-scale.tsx';
import { useElementWidth } from '../use-element-width.tsx';
import { boxPlotDefinition, type BoxPlotExtracted } from './extract.ts';
import {
  AXIS_FONT_SIZE,
  BOX_HEIGHT,
  BOX_PLOT_SCALE_KEY,
  WHISKER_CAP_HEIGHT,
  boxAxis,
  boxGeometry,
  boxOwnRange,
  boxPlotLayout,
  boxPlotModel,
  distanceText,
  type BoxDisplayRow,
  type BoxRowContext,
} from './figure-model.ts';
import { BOX_PLOT_AXIS_TITLE, BOX_PLOT_PANE_META, BOX_PLOT_QUANTITY_NAME } from './pane-meta.ts';
import { boxPlotOptions, DEFAULT_BOX_PLOT_OPTIONS, type BoxPlotOptions } from './options.ts';
import './box-plot-view.css';

/**
 * 箱ひげ図の可視化。
 *
 * 抽出の結果（`extract.ts`）の5つの値を、`figure-model.ts` が決めた座標に置くだけで、計算し直さない。
 * 順位・並べ替え・特定の配列の強調・基準の線は出さない。行の順は呼び出し側（ホスト）が渡す`order`のまま。
 * 行を押して選ぶのは、利用者が見たい配列の5つの値を図の下に出す表示の操作で、ツールが順位を決めるものではない。
 */

export type BoxPlotRowContext = BoxRowContext;
export type BoxPlotBodyProps = SetBodyProps<BoxPlotExtracted, BoxPlotOptions, BoxPlotRowContext>;

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

function rowAriaLabel(row: BoxDisplayRow): string {
  const { box } = row.row;
  return `${row.label}の${BOX_PLOT_QUANTITY_NAME}。中央値 ${distanceText(box.median)}、25%点 ${distanceText(box.lowerQuartile)}、75%点 ${distanceText(box.upperQuartile)}、10%点 ${distanceText(box.lowerWhisker)}、90%点 ${distanceText(box.upperWhisker)}`;
}

export function BoxPlotBody({ extracted, order, rowContext, segmentation, copyFigureImage }: BoxPlotBodyProps) {
  const figureRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const measured = useElementWidth(figureRef);
  const width = measured === undefined || measured <= 0 ? FALLBACK_WIDTH : measured;
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);

  const unavailable = segmentation === 'unsupported' || segmentation === 'failed';
  const model = useMemo(() => boxPlotModel(extracted, order, rowContext), [extracted, order, rowContext]);
  const drawn = unavailable ? [] : model.rows;
  const range = useSharedScale(BOX_PLOT_SCALE_KEY, boxOwnRange(drawn));
  const axis = useMemo(() => boxAxis(range?.max ?? 0), [range?.max]);
  const layout = useMemo(() => boxPlotLayout(width, drawn.length), [width, drawn.length]);
  const selected = drawn.find((row) => row.targetKey === selectedKey);
  const help = BOX_PLOT_PANE_META.help;

  // 選んだ配列が対象から外れたら、選ぶのをやめる
  useEffect(() => {
    if (selectedKey !== undefined && selected === undefined) setSelectedKey(undefined);
  }, [selectedKey, selected]);

  const imageSource = (): FigureImageSource | undefined => {
    const live = svgRef.current;
    const caption = figureRef.current?.querySelector('figcaption');
    if (live == null || caption == null) return undefined;
    // 選んだ行の印は画像に含めない
    const svg = live.cloneNode(true) as SVGSVGElement;
    for (const element of svg.querySelectorAll('[data-selected]')) element.removeAttribute('data-selected');
    return { svg, caption };
  };

  const toggle = (targetKey: string) => setSelectedKey((current) => (current === targetKey ? undefined : targetKey));
  const onRowKeyDown = (event: KeyboardEvent<SVGGElement>, targetKey: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggle(targetKey);
  };

  const { frame } = layout;
  const excluded = unavailable ? model.excluded.filter((row) => row.status === 'failed') : model.excluded;

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
          <figure ref={figureRef} className="box-plot-figure" data-box-plot-mode={layout.mode}>
            {/* biome-ignore lint/a11y/useSemanticElements: SVGの図の中の行の集まりに付ける役割で、fieldsetには置き換えられない */}
            <svg
              ref={svgRef}
              className="box-plot-svg"
              viewBox={`0 0 ${width} ${layout.height}`}
              role="group"
              aria-label={`${BOX_PLOT_QUANTITY_NAME}の箱ひげ図`}
            >
              <rect className="box-plot-frame" x={frame.x0} y={frame.y0} width={frame.x1 - frame.x0} height={frame.y1 - frame.y0} />
              {axis.ticks.map((tick) => {
                const x = frame.x0 + (tick.value / axis.max) * (frame.x1 - frame.x0);
                return (
                  <g key={tick.value} data-box-plot-tick={tick.value}>
                    <path className="box-plot-tick-mark" d={`M${x},${frame.y1}v${-TICK_LENGTH}M${x},${frame.y0}v${TICK_LENGTH}`} />
                    <text className="box-plot-tick" x={x} y={layout.tickLabelY} textAnchor="middle" style={{ fontSize: AXIS_FONT_SIZE }}>
                      {tick.text}
                    </text>
                  </g>
                );
              })}
              <text
                className="box-plot-axis-title"
                x={(frame.x0 + frame.x1) / 2}
                y={layout.axisTitleY}
                textAnchor="middle"
                style={{ fontSize: AXIS_FONT_SIZE }}
                data-box-plot-axis-title=""
              >
                {BOX_PLOT_AXIS_TITLE}
              </text>

              {drawn.map((row, rowIndex) => {
                const geometry = layout.rows[rowIndex]!;
                const isSelected = selected?.targetKey === row.targetKey;
                const x = boxGeometry(row.row.box, axis.max, frame.x0, frame.x1);
                const fitted = fitLabel(row.label, layout.labelWidth, FONT_SIZE);
                const top = geometry.centerY - BOX_HEIGHT / 2;
                const cap = WHISKER_CAP_HEIGHT / 2;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: SVGの<g>はbuttonに置き換えられない。押すとその配列の5つの値を図の下に出す操作の部品で、役割とキー操作をここで付けている
                  <g
                    key={row.targetKey}
                    className="box-plot-row"
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={rowAriaLabel(row)}
                    data-box-plot-row={row.targetKey}
                    data-selected={isSelected || undefined}
                    onClick={() => toggle(row.targetKey)}
                    onKeyDown={(event) => onRowKeyDown(event, row.targetKey)}
                  >
                    <rect className="box-plot-row-hit" x={1} y={geometry.top + 1} width={width - 2} height={geometry.bottom - geometry.top - 2} rx={4} />
                    <text
                      className="box-plot-row-label"
                      x={geometry.labelX}
                      y={geometry.labelY}
                      dominantBaseline="central"
                      data-box-plot-label-of={row.targetKey}
                    >
                      {fitted === row.label ? null : <title>{row.fullName || row.label}</title>}
                      {fitted}
                    </text>
                    <path
                      className="box-plot-whisker"
                      d={`M${x.lowerWhisker},${geometry.centerY}H${x.lowerQuartile}M${x.upperQuartile},${geometry.centerY}H${x.upperWhisker}M${x.lowerWhisker},${geometry.centerY - cap}v${WHISKER_CAP_HEIGHT}M${x.upperWhisker},${geometry.centerY - cap}v${WHISKER_CAP_HEIGHT}`}
                    />
                    <rect
                      className="box-plot-box"
                      data-box-plot-box={row.targetKey}
                      x={x.lowerQuartile}
                      y={top}
                      width={x.upperQuartile - x.lowerQuartile}
                      height={BOX_HEIGHT}
                    />
                    <path className="box-plot-median" data-box-plot-median={row.targetKey} d={`M${x.median},${top}v${BOX_HEIGHT}`} />
                  </g>
                );
              })}
            </svg>
            <figcaption className="box-plot-caption" data-box-plot-caption="">
              {BOX_PLOT_QUANTITY_NAME}
            </figcaption>
          </figure>

          {selected === undefined ? null : (
            <div className="box-plot-detail" data-box-plot-detail={selected.targetKey}>
              <p className="box-plot-detail-title">
                <span title={selected.fullName || selected.label}>{selected.label}</span>
                <span className="box-plot-detail-total">文節の数 {selected.row.box.count}</span>
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

          {model.segmentCounts === undefined ? null : (
            <p className="box-plot-notice" data-box-plot-segment-count="">
              {model.segmentCounts.kind === 'shared' ? (
                <>文節の数は{model.segmentCounts.count}です。</>
              ) : (
                <>
                  文節の数は、
                  {model.segmentCounts.entries.map((entry, index) => (
                    <span key={entry.targetKey}>
                      {index === 0 ? '' : '、'}
                      <span title={entry.fullName || entry.label}>{entry.label}</span> {entry.count}
                    </span>
                  ))}
                  です。
                </>
              )}
            </p>
          )}
        </>
      ) : null}

      {!unavailable && extracted.source !== undefined ? (
        <p className="box-plot-notice" data-box-plot-source="">
          {segmentationSourceSentence(extracted.source.splitter, extracted.source.origin)}
        </p>
      ) : null}

      {!unavailable && model.differentText.length > 0 ? (
        <p className="box-plot-notice" data-box-plot-different-text="">
          {model.differentText.map((row) => row.label).join('、')}は、評価に渡すテキストまたは区切りが{model.reference?.label ?? '他の対象'}
          と違います。箱は、それぞれのテキストと区切りで求めています。
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
