import { useMemo, useRef, useState, type RefObject } from 'react';
import { BUNSETSU_LOOKAHEAD } from '#interpretation/ngram-table-analysis.ts';
import { bindOption, SelectOptionField } from '#ui/primitives/option-fields.tsx';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import { PopoverSelect } from '#ui/primitives/popover-select.tsx';
import type { AnalyzerSettingsProps, FigureImageSource, SetAnalyzerPaneParts, SetBodyProps } from '../pane-parts.tsx';
import { CopyImageControl } from '../copy-image-control.tsx';
import { FigureTable, FigureTableSwitch } from '../figure-table-view.tsx';
import { useNgramTableChoices } from '../ngram-table-context.tsx';
import { useSharedScale } from '../shared-scale.tsx';
import { useElementWidth } from '../use-element-width.tsx';
import { BoxFigure, composeImageSvg } from '../box-figure.tsx';
import { boxAxis, boxOwnRange, distanceText } from '../box-figure-model.ts';
import { ngramTableDefinition, type NgramTableExtracted } from './extract.ts';
import {
  DISTRIBUTION_COLUMNS,
  distributionBoxRows,
  distributionTableModel,
  distributionValue,
  ngramTableModel,
  resultsTableModel,
  type DistributionKind,
  type NgramDisplayRow,
  type NgramRowContext,
} from './figure-model.ts';
import { DISTANCE_FIGURE, NGRAM_TABLE_PANE_META, NO_TABLE_MESSAGE, PER_KANA_FIGURE, ngramTableSourceItems } from './pane-meta.ts';
import { DEFAULT_NGRAM_TABLE_OPTIONS, ngramTableOptions, type NgramTableOptions } from './options.ts';
import { ngramTableProvenance } from './provenance.ts';
import type { NgramTableAsset } from '#interpretation/ngram-table-asset.ts';
import './ngram-table-view.css';

/**
 * 表による解析の可視化。
 *
 * 抽出の結果（`extract.ts`）の値を、表と箱ひげ図に置くだけで、計算し直さない。
 * 順位・並べ替え・基準の線は出さない。行と列の順は呼び出し側（ホスト）が渡す`order`のまま。
 * 箱ひげ図の部品は箱ひげ図のAnalyzerと共有する（`box-plot/box-figure.tsx`）。
 */

export type NgramTableRowContext = NgramRowContext;
export type NgramTableBodyProps = SetBodyProps<NgramTableExtracted, NgramTableOptions, NgramTableRowContext>;

/** まだ幅を測っていない間に描く幅 [px]。 */
const FALLBACK_WIDTH = 360;

interface DistributionFigureProps {
  readonly kind: DistributionKind;
  readonly rows: readonly NgramDisplayRow[];
  readonly width: number;
  readonly copyFigureImage: NgramTableBodyProps['copyFigureImage'];
}

/** 文節の移動距離の分布の箱ひげ図1枚。列を押すと、その配列の8つの値を出す。 */
function DistributionFigure({ kind, rows, width, copyFigureImage }: DistributionFigureProps) {
  const figure = kind === 'distance' ? DISTANCE_FIGURE : PER_KANA_FIGURE;
  const figureRef = useRef<HTMLElement>(null);
  const [detailKey, setDetailKey] = useState<string | undefined>(undefined);
  const [asTable, setAsTable] = useState(false);
  const boxRows = useMemo(() => distributionBoxRows(rows, kind), [rows, kind]);
  const range = useSharedScale(figure.scaleKey, boxOwnRange(boxRows));
  const axis = useMemo(() => boxAxis(range?.max ?? 0), [range?.max]);
  const detail = boxRows.find((row) => row.targetKey === detailKey);
  const toggleDetail = (targetKey: string) => setDetailKey((current) => (current === targetKey ? undefined : targetKey));

  if (boxRows.length === 0) return null;

  const imageSource = (): FigureImageSource | undefined => {
    const element = figureRef.current;
    const axisSvg = element?.querySelector<SVGSVGElement>('.box-plot-axis-svg');
    const plotSvg = element?.querySelector<SVGSVGElement>('.box-plot-svg');
    const caption = element?.querySelector('figcaption');
    if (element == null || axisSvg == null || plotSvg == null || caption == null) return undefined;
    return { svg: composeImageSvg(axisSvg, plotSvg, Number.parseFloat(element.style.width)), caption };
  };

  return (
    <div className="ngram-table-distribution" data-ngram-table-distribution={kind}>
      <div className="ngram-table-heading">
        <FigureTableSwitch pressed={asTable} onToggle={() => setAsTable((current) => !current)} target={figure.caption} />
        {copyFigureImage === undefined || asTable ? null : <CopyImageControl copyFigureImage={copyFigureImage} source={imageSource} />}
      </div>
      {asTable ? <FigureTable model={distributionTableModel(rows, kind)} /> : null}
      <div hidden={asTable}>
        <BoxFigure
          scope="all"
          rows={boxRows}
          axis={axis}
          axisTitle={figure.axisTitle}
          quantityName={figure.caption}
          width={width}
          caption={figure.caption}
          highlighted={detailKey === undefined ? NO_KEYS : new Set([detailKey])}
          onColumnPress={toggleDetail}
          figureRef={figureRef as RefObject<HTMLElement | null>}
        />
      </div>
      {detail === undefined || asTable ? null : (
        <div className="box-plot-detail" data-ngram-table-detail={detail.targetKey}>
          <p className="box-plot-detail-title">
            <span title={detail.fullName || detail.label}>{detail.label}</span>
          </p>
          <table className="box-plot-detail-table">
            <thead>
              <tr>
                <th scope="col">値</th>
                <th scope="col">{figure.axisTitle}</th>
              </tr>
            </thead>
            <tbody>
              {[...DISTRIBUTION_COLUMNS].reverse().map((column) => (
                <tr key={column.name} data-ngram-table-detail-row={column.name}>
                  <th scope="row">{column.name}</th>
                  <td>{distanceText(distributionValue(detail.distribution, column.key))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const NO_KEYS: ReadonlySet<string> = new Set();

export function NgramTableBody({ extracted, order, rowContext, ngramTable, copyFigureImage }: NgramTableBodyProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [measured, measureFigure] = useElementWidth(measureRef);
  const width = measured === undefined || measured <= 0 ? FALLBACK_WIDTH : measured;
  const unavailable = ngramTable === 'failed';
  const model = useMemo(() => ngramTableModel(extracted, order, rowContext), [extracted, order, rowContext]);
  const rows = unavailable ? [] : model.rows;
  const excluded = unavailable ? model.excluded.filter((row) => row.status === 'failed') : model.excluded;

  return (
    <section className="ngram-table-feature" data-react-feature="ngram-table">
      {unavailable ? (
        <p className="ngram-table-notice" data-ngram-table-unavailable="">
          {NO_TABLE_MESSAGE}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="ngram-table-heading">
            <InfoButton name="図の見方" description={NGRAM_TABLE_PANE_META.description} help={helpOf(extracted)} />
          </div>
          <div data-ngram-table-results="">
            <FigureTable model={resultsTableModel(rows)} />
          </div>
          <div ref={measureFigure} className="ngram-table-figures">
            <DistributionFigure kind="distance" rows={rows} width={width} copyFigureImage={copyFigureImage} />
            <DistributionFigure kind="perKana" rows={rows} width={width} copyFigureImage={copyFigureImage} />
          </div>
        </>
      ) : null}

      {!unavailable && rows.length === 0 && excluded.every((row) => row.status !== 'computing') && extracted.basis === undefined ? (
        <p className="ngram-table-notice" data-ngram-table-empty="">
          値を出せる対象がありません。
        </p>
      ) : null}

      {excluded.length > 0 ? (
        <ul className="ngram-table-excluded">
          {excluded.map((row) => (
            <li key={row.targetKey} data-ngram-table-excluded={row.status}>
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

/** 図の見方。表の元のテキストの出どころは、抽出が表を持つ時だけ足す（青空文庫の規準が残すことを希望している情報を含む）。 */
function helpOf(extracted: NgramTableExtracted) {
  const base = NGRAM_TABLE_PANE_META.help;
  if (extracted.basis === undefined) return base;
  return { ...base, items: [...base.items, ...ngramTableSourceItems(extracted.basis)] };
}

const LOOKAHEAD_CHOICES = Array.from({ length: BUNSETSU_LOOKAHEAD.max - BUNSETSU_LOOKAHEAD.min + 1 }, (_, index) => {
  const value = BUNSETSU_LOOKAHEAD.min + index;
  return { value: String(value), label: `先読み ${value}文節` };
});

/** 解析設定が選ぶ次数を、選べる次数に直した値。表を読み込む前は、解析設定の値のまま。 */
function effectiveOrder(options: NgramTableOptions, choices: ReturnType<typeof useNgramTableChoices>): number {
  if (choices === undefined) return options.order;
  return choices.selectableOrders.includes(options.order) ? options.order : choices.defaultOrder;
}

function orderChoices(options: NgramTableOptions, choices: ReturnType<typeof useNgramTableChoices>) {
  const orders = choices?.selectableOrders ?? [effectiveOrder(options, choices)];
  return orders.map((order) => ({ value: String(order), label: `${order}次の表` }));
}

/** 表の次数と文節の先読みの選択。別々の項目で、片方を変えてももう片方の選べる範囲と既定は変わらない。 */
export function NgramTableSettings({ options, onOptionsChange }: AnalyzerSettingsProps<NgramTableOptions>) {
  const choices = useNgramTableChoices();
  const orderBinding = {
    ...bindOption(
      { order: String(effectiveOrder(options, choices)) },
      { order: String(choices?.defaultOrder ?? DEFAULT_NGRAM_TABLE_OPTIONS.order) },
      () => undefined,
      'order',
    ),
    onChange: (next: string) => onOptionsChange({ ...options, order: Number(next) }),
  };
  const lookaheadBinding = {
    ...bindOption({ lookahead: String(options.lookahead) }, { lookahead: String(DEFAULT_NGRAM_TABLE_OPTIONS.lookahead) }, () => undefined, 'lookahead'),
    onChange: (next: string) => onOptionsChange({ ...options, lookahead: Number(next) }),
  };
  return (
    <div className="option-groups">
      <SelectOptionField label="表の次数" binding={orderBinding} choices={orderChoices(options, choices)} />
      <SelectOptionField label="文節の先読み" binding={lookaheadBinding} choices={LOOKAHEAD_CHOICES} />
    </div>
  );
}

/** ペインの見出しの行に置く、表の次数と文節の先読みの選択。解析設定の小窓の同じ項目と同じ値を読み書きする。 */
export function NgramTableHeaderControl({ options, onOptionsChange }: AnalyzerSettingsProps<NgramTableOptions>) {
  const choices = useNgramTableChoices();
  return (
    <>
      <PopoverSelect
        label="表の次数"
        value={String(effectiveOrder(options, choices))}
        choices={orderChoices(options, choices)}
        onChange={(next) => onOptionsChange({ ...options, order: Number(next) })}
      />
      <PopoverSelect
        label="文節の先読み"
        value={String(options.lookahead)}
        choices={LOOKAHEAD_CHOICES}
        onChange={(next) => onOptionsChange({ ...options, lookahead: Number(next) })}
      />
    </>
  );
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const ngramTableAnalyzer = {
  definition: ngramTableDefinition,
  ...NGRAM_TABLE_PANE_META,
  Body: NgramTableBody,
  Settings: NgramTableSettings,
  HeaderControl: NgramTableHeaderControl,
  defaultOptions: DEFAULT_NGRAM_TABLE_OPTIONS,
  urlOptions: ngramTableOptions,
  rowContext: ({ targetKey, label, fullName }) => ({ targetKey, label, fullName }),
  // 今の解析の先読みN（かなで数える）は使わない。この解析の文節の先読みが別にある
  conditionExcludeIds: ['windowSize'],
  ngramTable: {
    orderOf: (options: NgramTableOptions) => options.order,
    provenance: (asset: NgramTableAsset | undefined, options: NgramTableOptions) => ngramTableProvenance(asset, options),
  },
} satisfies SetAnalyzerPaneParts<NgramTableOptions, NgramTableExtracted, NgramTableRowContext>;
