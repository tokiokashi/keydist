import { useId, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { bindOption, NumberOptionField, SelectOptionField } from '#ui/primitives/option-fields.tsx';
import { SeriesMark } from '#ui/charts/series-mark.tsx';
import { TARGET_DASH_ARRAY, targetMark, type TargetMark } from '#ui/theme/target-marks.ts';
import type { AnalyzerSettingsProps, PlaybackJump, SetAnalyzerPaneParts, SetBodyProps } from '../pane-parts.tsx';
import {
  chartX,
  CHART_HEIGHT,
  CHART_MARGIN,
  CHART_PLOT_HEIGHT,
  CHART_PLOT_WIDTH,
  CHART_PLOT_RIGHT,
  CHART_WIDTH,
  viewXFromClient,
} from '../chart-frame.ts';
import {
  adjacentRunChartTarget,
  nearestRunChartTarget,
  runChartModel,
  runChartReadout,
  type RunChartModel,
  type RunChartPlotSeries,
  type RunChartTarget,
} from './chart-model.ts';
import { runChartDefinition, type RunChartExtracted, type RunChartSeries, type RunChartSeriesFailed, type RunChartSeriesOk } from './extract.ts';
import { SegmentTables, type SegmentTableRow } from './segment-table.tsx';
import { axisTitle, formatMetricValue, RUN_CHART_METRIC_IDS, RUN_CHART_METRICS, type RunChartMetricId } from './metric-catalog.ts';
import {
  DEFAULT_RUN_CHART_OPTIONS,
  DEFAULT_RUN_CHART_WINDOW,
  RUN_CHART_SEED_LABEL,
  RUN_CHART_SEED_MAX,
  RUN_CHART_SEED_MIN,
  RUN_CHART_WINDOW_MAX,
  RUN_CHART_WINDOW_MIN,
  RUN_CHART_SEGMENTATION_IDS,
  runChartOptions,
  type RunChartOptions,
} from './options.ts';
import { RUN_CHART_PANE_META } from './pane-meta.ts';
import './run-chart-view.css';

/**
 * Run Chartの可視化。`extracted`（`extract.ts`の計算結果）を並べるだけで、指標も目安線の係数も計算し直さない
 * （docs/architecture.md「可視化は計算しない」）。**優劣を示す色・強調・並び替えはしない。**
 * 対象の色と点の形は、集合が配った番号から決まる（どのペインでも同じ）。
 */

export interface RunChartRowContext {
  readonly targetKey: string;
  readonly label: string;
  /** 集合によらない完全な名前。hover（`title`属性）に出す。 */
  readonly fullName: string;
  readonly color: string;
  /** 色以外の手がかり（点の形と線種）。 */
  readonly mark: TargetMark;
}

export type RunChartBodyProps = SetBodyProps<RunChartExtracted, RunChartOptions, RunChartRowContext>;

const SEGMENTATION_LABELS: Readonly<Record<RunChartOptions['segmentation'], string>> = {
  none: '区切りなし',
  bunsetsu: '文節',
  fixed: '固定長',
  random: 'ランダム（最初の種）',
};

/** 目安線を全系列に引く系列数の上限。これより多い時は、ポインタを合わせた系列だけに引く。 */
const GUIDES_FOR_ALL_LIMIT = 3;

interface PlottedRow {
  readonly targetKey: string;
  readonly label: string;
  readonly fullName: string;
  readonly color: string;
  readonly mark: TargetMark;
  readonly data: RunChartSeriesOk;
}

function formatTick(value: number, digits: number): string {
  return value.toFixed(digits);
}

interface RunChartFigureProps {
  readonly rows: readonly PlottedRow[];
  readonly metric: RunChartMetricId;
  readonly windowChars: number;
  readonly model: RunChartModel;
  readonly jump: PlaybackJump | undefined;
  /** 図に重ねる区切りの位置（評価に渡したテキストの文字位置）。 */
  readonly boundaries: readonly number[];
}

/** 区切りの線を全高で引く本数の上限。これより多い時は、軸の上に短い目盛りだけを並べる（線が塗りつぶしにならないように）。 */
const BOUNDARY_FULL_LINE_LIMIT = Math.floor(CHART_PLOT_WIDTH / 4);

function RunChartFigure({ rows, metric, windowChars, model, jump, boundaries }: RunChartFigureProps) {
  const clipId = useId().replace(/:/g, '');
  const def = RUN_CHART_METRICS[metric];
  const [active, setActive] = useState<RunChartTarget | undefined>(undefined);
  // キーボードで点を選んでいる間は、ポインタが外れても選びを残す
  const [keyboardActive, setKeyboardActive] = useState(false);

  const targetAt = (event: MouseEvent<SVGRectElement>): RunChartTarget | undefined => {
    const svg = event.currentTarget.ownerSVGElement;
    if (svg === null) return undefined;
    const bounds = svg.getBoundingClientRect();
    if (bounds.width === 0) return undefined;
    const scale = CHART_WIDTH / bounds.width;
    const viewX = viewXFromClient(event.clientX, bounds.left, bounds.width);
    const viewY = (event.clientY - bounds.top) * scale;
    return nearestRunChartTarget(model, viewX, viewY);
  };

  const jumpTo = (target: RunChartTarget | undefined) => {
    if (target === undefined || jump === undefined) return;
    const row = rows[target.seriesIndex];
    if (row === undefined || !jump.available(row.targetKey)) return;
    jump.jump(row.targetKey, target.hit.position);
  };

  const onKeyDown = (event: KeyboardEvent<SVGRectElement>) => {
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const base = active ?? nearestRunChartTarget(model, CHART_MARGIN.left, CHART_MARGIN.top + CHART_PLOT_HEIGHT / 2);
      if (base === undefined) return;
      setKeyboardActive(true);
      setActive(active === undefined ? base : adjacentRunChartTarget(model, active, event.key === 'ArrowRight' ? step : -step));
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      // 系列を替える。横位置が最も近い点へ移る
      if (active === undefined || model.series.length < 2) return;
      event.preventDefault();
      const next = (active.seriesIndex + (event.key === 'ArrowDown' ? 1 : -1) + model.series.length) % model.series.length;
      const moved = nearestRunChartTarget({ ...model, series: [model.series[next]!] }, active.hit.x, active.hit.y);
      if (moved !== undefined) setActive({ seriesIndex: next, hit: moved.hit });
    } else if (event.key === 'Enter' || event.key === ' ') {
      if (active === undefined) return;
      event.preventDefault();
      jumpTo(active);
    } else if (event.key === 'Escape') {
      setKeyboardActive(false);
      setActive(undefined);
    }
  };

  // 目安線を引く系列。系列が少ない間は全部、多い間はポインタ（またはキーボード）で選んでいる系列だけ
  const guideIndexes = new Set(rows.length <= GUIDES_FOR_ALL_LIMIT ? rows.map((_, index) => index) : active === undefined ? [] : [active.seriesIndex]);
  const activeRow = active === undefined ? undefined : rows[active.seriesIndex];

  return (
    <div className="run-chart-figure">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={`${def.label}の推移。横軸はテキスト上の位置`}
        data-run-chart-total={model.total}
      >
        <title>{axisTitle(metric, windowChars)}</title>
        <defs>
          <clipPath id={clipId}>
            <rect x={CHART_MARGIN.left} y={CHART_MARGIN.top} width={CHART_PLOT_RIGHT - CHART_MARGIN.left} height={CHART_PLOT_HEIGHT} />
          </clipPath>
        </defs>
        <text className="run-chart-axis-title" x={CHART_MARGIN.left} y={CHART_MARGIN.top - 12} data-run-chart-y-title="">
          {axisTitle(metric, windowChars)}
        </text>

        {model.yTicks.map((tick) => (
          <g key={tick.value}>
            <line className="run-chart-grid" x1={CHART_MARGIN.left} y1={tick.position} x2={CHART_PLOT_RIGHT} y2={tick.position} />
            <text className="run-chart-tick" x={CHART_MARGIN.left - 8} y={tick.position + 4} textAnchor="end">
              {formatTick(tick.value, def.tickDigits)}
            </text>
          </g>
        ))}
        {model.xTicks.map((tick) => (
          <text key={tick.value} className="run-chart-tick" x={tick.position} y={CHART_HEIGHT - 8} textAnchor="middle">
            {tick.value}
          </text>
        ))}

        {boundaries.length === 0 ? null : (
          <g className="run-chart-boundaries" data-run-chart-boundaries={boundaries.length}>
            {boundaries.map((boundary) => {
              const x = chartX(boundary, model.total);
              const full = boundaries.length <= BOUNDARY_FULL_LINE_LIMIT;
              return (
                <line
                  key={boundary}
                  className="run-chart-boundary"
                  x1={x}
                  x2={x}
                  y1={full ? CHART_MARGIN.top : CHART_MARGIN.top + CHART_PLOT_HEIGHT - 6}
                  y2={CHART_MARGIN.top + CHART_PLOT_HEIGHT}
                />
              );
            })}
          </g>
        )}

        <g clipPath={`url(#${clipId})`}>
          {model.series.map((series, index) => {
            const row = rows[index]!;
            return (
              <g key={series.targetKey} data-run-chart-series={series.targetKey}>
                {series.centerY === undefined ? null : (
                  <line
                    className="run-chart-center"
                    data-run-chart-center=""
                    x1={CHART_MARGIN.left}
                    x2={CHART_PLOT_RIGHT}
                    y1={series.centerY}
                    y2={series.centerY}
                    style={{ stroke: row.color }}
                  />
                )}
                {guideIndexes.has(index) ? (
                  <>
                    <path className="run-chart-guide" data-run-chart-guide="upper" d={series.upperPath} fill="none" style={{ stroke: row.color }} />
                    <path className="run-chart-guide" data-run-chart-guide="lower" d={series.lowerPath} fill="none" style={{ stroke: row.color }} />
                  </>
                ) : null}
                <path
                  className="run-chart-line"
                  data-run-chart-line=""
                  d={series.linePath}
                  fill="none"
                  style={{ stroke: row.color }}
                  strokeDasharray={row.mark.dashed ? TARGET_DASH_ARRAY : undefined}
                />
                {series.dots.map((dot) => (
                  <SeriesMark key={dot.position} className="run-chart-point" mark={row.mark} color={row.color} x={dot.x} y={dot.y} />
                ))}
              </g>
            );
          })}
        </g>

        {active === undefined ? null : (
          <g className="run-chart-active">
            <line x1={active.hit.x} x2={active.hit.x} y1={CHART_MARGIN.top} y2={CHART_MARGIN.top + CHART_PLOT_HEIGHT} />
            <circle cx={active.hit.x} cy={active.hit.y} r={4.5} style={{ stroke: activeRow?.color }} />
          </g>
        )}

        {/* biome-ignore lint/a11y/noStaticElementInteractions: 図の上のポインタ操作で位置を選ぶ補助。キーボードでは同じ図にフォーカスを当て、矢印キーで点を選び、Enterで移る */}
        <rect
          className="run-chart-hit"
          data-run-chart-hit=""
          tabIndex={0}
          aria-label="推移の図。矢印キーで点を選び、Enterで打鍵再生へ移ります"
          x={CHART_MARGIN.left}
          y={CHART_MARGIN.top}
          width={CHART_PLOT_RIGHT - CHART_MARGIN.left}
          height={CHART_PLOT_HEIGHT}
          fill="transparent"
          onPointerMove={(event) => {
            setKeyboardActive(false);
            setActive(targetAt(event));
          }}
          onPointerLeave={() => {
            if (!keyboardActive) setActive(undefined);
          }}
          onBlur={() => {
            setKeyboardActive(false);
            setActive(undefined);
          }}
          onClick={(event) => jumpTo(targetAt(event))}
          onKeyDown={onKeyDown}
        />
      </svg>
      <p className="run-chart-readout" data-run-chart-readout="" aria-live="off">
        {active === undefined || activeRow === undefined ? '' : runChartReadout(activeRow.label, metric, activeRow.data, active.hit.pointIndex)}
      </p>
    </div>
  );
}

function seriesFor(series: readonly RunChartSeries[], targetKey: string): RunChartSeries | undefined {
  return series.find((item) => item.targetKey === targetKey);
}

/**
 * Run Chartの本体。対象が空の時はホストが選ぶボタンを出し、本体は呼ばれない。
 * メンバー単位の失敗は図の下に行で出す。
 */
export function RunChartBody({ extracted, order, rowContext, playbackJump, segmentation }: RunChartBodyProps) {
  const metric = extracted.metric;
  const found = order
    .map((targetKey) => ({ targetKey, entry: seriesFor(extracted.series, targetKey), context: rowContext.get(targetKey) }))
    .filter((row): row is { targetKey: string; entry: RunChartSeries; context: RunChartRowContext | undefined } => row.entry !== undefined);
  const rows: PlottedRow[] = found.flatMap(({ targetKey, entry, context }) =>
    entry.kind === 'ok'
      ? [
          {
            targetKey,
            label: context?.label ?? '—',
            fullName: context?.fullName ?? '',
            color: context?.color ?? '#666',
            mark: context?.mark ?? targetMark(0),
            data: entry,
          },
        ]
      : [],
  );
  const plot: RunChartPlotSeries[] = rows.map((row) => ({ targetKey: row.targetKey, data: row.data }));
  const model = runChartModel(plot, metric);
  const failed = found.filter((row): row is typeof row & { entry: RunChartSeriesFailed } => row.entry.kind === 'failed');
  // 同じ対象の打鍵再生へ移れない系列（Workspaceに、その対象を映す打鍵再生のペインが無い）
  const withoutDestination =
    playbackJump === undefined || playbackJump.destination !== 'pane' ? [] : rows.filter((row) => !playbackJump.available(row.targetKey));
  const windowChanged = extracted.window !== DEFAULT_RUN_CHART_WINDOW;
  const segmentationChosen = extracted.segmentation !== 'none';
  // 区切りの位置は、先頭の対象のものを図に重ねる（対象が違っても、評価に渡すテキストは通常同じ）
  const overlayReport = segmentationChosen ? rows.find((row) => row.data.segments?.report !== undefined)?.data.segments?.report : undefined;
  const overlay = overlayReport === undefined || extracted.segmentation === 'none' ? [] : overlayReport.overlay[extracted.segmentation];
  const segmentRows: SegmentTableRow[] = rows.flatMap((row) =>
    row.data.segments === undefined ? [] : [{ targetKey: row.targetKey, label: row.label, fullName: row.fullName, segments: row.data.segments }],
  );

  return (
    <section className="run-chart-feature" data-react-feature="run-chart">
      {windowChanged ? (
        <p className="run-chart-notice" data-run-chart-window-note="">
          既定と違う設定で計算しています。集計窓は{extracted.window}文字です（既定は{DEFAULT_RUN_CHART_WINDOW}文字）。
        </p>
      ) : null}

      {segmentationChosen ? (
        <p className="run-chart-notice" data-run-chart-segmentation-note="">
          既定と違う設定で計算しています。{SEGMENTATION_LABELS[extracted.segmentation]}
          の区切りを図に重ね、区切り方ごとの表を出しています（既定は区切りなし）。
          {segmentation === 'unsupported' ? '文節の区切りは日本語のテキストでだけ使えるので、区切りなしで描いています。' : ''}
          {segmentation === 'failed' ? '文節の分割器を読み込めなかったので、区切りなしで描いています。' : ''}
        </p>
      ) : null}

      {model === undefined ? (
        rows.length > 0 ? (
          <p className="run-chart-empty">打鍵するデータがありません。</p>
        ) : null
      ) : (
        <>
          <RunChartFigure rows={rows} metric={metric} windowChars={extracted.window} model={model} jump={playbackJump} boundaries={overlay} />
          <ul className="run-chart-legend" aria-label="凡例">
            {rows.map((row) => (
              <li key={row.targetKey} data-run-chart-row="ok" title={row.fullName || row.label}>
                <svg className="run-chart-legend-swatch" width={36} height={12} viewBox="0 0 36 12" aria-hidden="true">
                  <line
                    className="run-chart-line"
                    x1={0}
                    x2={36}
                    y1={6}
                    y2={6}
                    style={{ stroke: row.color }}
                    strokeDasharray={row.mark.dashed ? TARGET_DASH_ARRAY : undefined}
                  />
                  <SeriesMark className="run-chart-point" mark={row.mark} color={row.color} x={18} y={6} />
                </svg>
                <span className="run-chart-legend-name">{row.label}</span>
                <span className="run-chart-legend-center">全体 {formatMetricValue(metric, row.data.center)}</span>
              </li>
            ))}
          </ul>
          <p className="run-chart-guide-note" data-run-chart-guide-note="">
            点線はテキスト全体の値（中心線）、細い線は目安線です。
            {rows.length > GUIDES_FOR_ALL_LIMIT ? '配列が多いので、ポインタを合わせた配列の目安線だけを引きます。' : ''}
          </p>
        </>
      )}

      <SegmentTables rows={segmentRows} />

      {withoutDestination.length > 0 ? (
        <p className="run-chart-notice" data-run-chart-no-playback="">
          {withoutDestination.map((row) => row.label).join('、')}
          を映す打鍵再生のペインがありません。同じ対象の打鍵再生のペインをWorkspaceに足すと、図を押してその位置へ移れます。
        </p>
      ) : null}

      {failed.length > 0 ? (
        <ul className="run-chart-failures">
          {failed.map(({ targetKey, entry, context }) => (
            <li key={targetKey} data-run-chart-row="failed">
              <span title={context?.fullName}>{context?.label ?? '—'}</span>
              <span role="alert">{entry.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Run Chartの解析設定（指標と集計窓）。 */
export function RunChartSettings({ options, onOptionsChange }: AnalyzerSettingsProps<RunChartOptions>) {
  return (
    <div className="option-groups">
      <SelectOptionField
        label="指標"
        binding={bindOption(options, DEFAULT_RUN_CHART_OPTIONS, onOptionsChange, 'metric')}
        choices={RUN_CHART_METRIC_IDS.map((id) => ({ value: id, label: RUN_CHART_METRICS[id].label }))}
      />
      <NumberOptionField
        label="集計窓"
        binding={bindOption(options, DEFAULT_RUN_CHART_OPTIONS, onOptionsChange, 'window')}
        min={RUN_CHART_WINDOW_MIN}
        max={RUN_CHART_WINDOW_MAX}
        step={1}
        integer
        unit="文字"
        hint="各点の値を、その点で終わる直近の何文字から求めるかです。大きいほど線がなめらかになり、短い範囲の変動が見えにくくなります。"
      />
      <SelectOptionField
        label="区切り"
        binding={bindOption(options, DEFAULT_RUN_CHART_OPTIONS, onOptionsChange, 'segmentation')}
        choices={RUN_CHART_SEGMENTATION_IDS.map((id) => ({ value: id, label: SEGMENTATION_LABELS[id] }))}
        hint="図に重ねる区切りです。区切りなし以外を選ぶと、文節・固定長・ランダムの区切りで、区間ごとの指標と区切りの前後の指標を比べる表を出します。日本語のテキストでだけ使えます。"
      />
      <NumberOptionField
        label={RUN_CHART_SEED_LABEL}
        binding={bindOption(options, DEFAULT_RUN_CHART_OPTIONS, onOptionsChange, 'seedStart')}
        min={RUN_CHART_SEED_MIN}
        max={RUN_CHART_SEED_MAX}
        step={1}
        integer
        unit=""
        hint="ランダムの区切りに使う種は、この値から続く20個です。同じテキストと同じ値からは、同じ区切りが出ます。"
      />
    </div>
  );
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const runChartAnalyzer = {
  definition: runChartDefinition,
  ...RUN_CHART_PANE_META,
  Body: RunChartBody,
  Settings: RunChartSettings,
  defaultOptions: DEFAULT_RUN_CHART_OPTIONS,
  urlOptions: runChartOptions,
  rowContext: ({ targetKey, label, fullName, color, mark }) => {
    if (color === undefined || mark === undefined) return undefined;
    return { targetKey, label, fullName, color, mark };
  },
  // 押した点の位置から、同じ対象の打鍵再生へ移る
  jumpsToPlayback: true,
  // 区切りを選んだ時だけ、ホストが文節の分割器を読み込む
  usesSegmentation: (options) => options.segmentation !== 'none',
} satisfies SetAnalyzerPaneParts<RunChartOptions, RunChartExtracted, RunChartRowContext>;
