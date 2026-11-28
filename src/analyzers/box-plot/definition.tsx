import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import type { AnalyzerSettingsProps, FigureImageSource, SetAnalyzerPaneParts, SetBodyProps } from '../pane-parts.tsx';
import { CopyImageControl } from '../copy-image-control.tsx';
import { FigureTable, FigureTableSwitch } from '../figure-table-view.tsx';
import { useSharedScale } from '../shared-scale.tsx';
import { useElementWidth } from '../use-element-width.tsx';
import { boxPlotDefinition, type BoxPlotExtracted } from './extract.ts';
import { BOX_PLOT_SCALE_KEY, boxAxis, boxOwnRange, boxPlotModel, distanceText, type BoxRowContext } from './figure-model.ts';
import { BoxFigure, composeImageSvg } from '../box-figure.tsx';
import '../box-figure.css';
import { BOX_PLOT_AXIS_TITLE, BOX_PLOT_FOCUS_CAPTION, BOX_PLOT_PANE_META, BOX_PLOT_QUANTITY_NAME, boxPlotSourceItems } from './pane-meta.ts';
import { boxPlotTableModel, QUANTILE_ROWS } from './table-model.ts';
import { boxPlotOptions, DEFAULT_BOX_PLOT_OPTIONS, type BoxPlotOptions } from './options.ts';

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

/** まだ幅を測っていない間に描く幅 [px]。 */
const FALLBACK_WIDTH = 360;

const NO_KEYS: ReadonlySet<string> = new Set();

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
              axisTitle={BOX_PLOT_AXIS_TITLE}
              quantityName={BOX_PLOT_QUANTITY_NAME}
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
                  axisTitle={BOX_PLOT_AXIS_TITLE}
                  quantityName={BOX_PLOT_QUANTITY_NAME}
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
