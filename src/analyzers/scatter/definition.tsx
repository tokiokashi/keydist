import { useMemo, useState } from 'react';
import type { LayoutKind } from '#input/layouts/kind.ts';
import { bindOption, SelectOptionField } from '#ui/primitives/option-fields.tsx';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import { targetMarkPath } from '#ui/theme/target-marks.ts';
import type { AnalyzerSettingsProps, SetAnalyzerPaneParts, SetBodyProps } from '../pane-parts.tsx';
import { COMPARISON_COLUMN_FORMAT, COMPARISON_COLUMN_IDS, COMPARISON_COLUMN_TEXT, type ComparisonColumnId } from '../comparison-column-text.ts';
import {
  SCATTER_PRESET_AXES,
  SCATTER_PRESET_IDS,
  SCATTER_PRESET_LABELS,
  scatterAxisProblem,
  scatterContour,
  type ScatterAxes,
  type ScatterAxisProblem,
  type ScatterContour,
} from './axes.ts';
import { scatterDefinition, type ScatterExtracted, type ScatterRow } from './extract.ts';
import { SCATTER_KIND_ORDER, SCATTER_KIND_STYLES } from './kinds.ts';
import { DEFAULT_SCATTER_OPTIONS, scatterOptions, type ScatterOptions } from './options.ts';
import { SCATTER_PANE_META } from './pane-meta.ts';
import { scatterQuantityHelp } from './quantity-help.ts';
import { PLOT_HEIGHT, PLOT_MARGIN, PLOT_WIDTH, scatterPlotModel, type PlotPoint } from './plot-model.ts';
import './scatter-view.css';

/**
 * 散布図の可視化。`extracted`（`extract.ts`の計算結果）の列の値を、`plot-model.ts`が決めた座標に置くだけで、
 * 指標は計算し直さない（docs/architecture.md「可視化は計算しない」）。
 * **優劣を示す色・強調・順位・回帰直線・相関係数は出さない**（AGENTS.md「優劣の判定・順位付け・合成スコアを作らない」）。
 * 点の色と形は配列の種類（`kinds.ts`）で決め、対象の色と印は使わない。
 */

export interface ScatterRowContext {
  readonly targetKey: string;
  readonly label: string;
  /** 集合によらない完全な名前。hoverとフォーカスの読み取りに出す。 */
  readonly fullName: string;
  /** 配列の種類。対象を解決できなかった行には無い。 */
  readonly kind: LayoutKind | undefined;
}

export type ScatterBodyProps = SetBodyProps<ScatterExtracted, ScatterOptions, ScatterRowContext>;

/** 点の印の大きさ（半径）。 */
const MARK_SIZE = 5.5;

const PLOT_RIGHT = PLOT_WIDTH - PLOT_MARGIN.right;
const PLOT_BOTTOM = PLOT_HEIGHT - PLOT_MARGIN.bottom;
/** 目盛りの線の長さ。枠の内側へ向ける。 */
const TICK_LENGTH = 5;

function axesOf(options: ScatterOptions): ScatterAxes {
  return options.preset === 'free' ? { x: options.xAxis, y: options.yAxis } : SCATTER_PRESET_AXES[options.preset];
}

function isPercentColumn(column: ComparisonColumnId): boolean {
  return COMPARISON_COLUMN_FORMAT[column](0).endsWith('%');
}

const AXIS_PROBLEM_TEXT: Readonly<Record<ScatterAxisProblem, string>> = {
  same: '同じ列は、横軸と縦軸の両方に選べません。',
  scaled: '動作数と動作数/文字、距離とu/文字のように、一方が他方の定数倍になる2列は、同時に選べません。',
};

interface PlottedRow {
  readonly targetKey: string;
  readonly label: string;
  readonly fullName: string;
  readonly kind: LayoutKind;
  readonly x: number;
  readonly y: number;
}

interface ExcludedRow {
  readonly targetKey: string;
  readonly label: string;
  readonly fullName: string;
  readonly status: 'computing' | 'failed' | 'no-value';
  readonly message: string;
}

function readoutText(row: PlotPoint & { readonly fullName: string }, axes: ScatterAxes, contour: ScatterContour | undefined): string {
  const parts = [
    row.fullName || row.label,
    `${COMPARISON_COLUMN_TEXT[axes.x].label} ${COMPARISON_COLUMN_FORMAT[axes.x](row.x)}`,
    `${COMPARISON_COLUMN_TEXT[axes.y].label} ${COMPARISON_COLUMN_FORMAT[axes.y](row.y)}`,
  ];
  if (contour !== undefined) {
    const value = contour.valueAt(row.x, row.y);
    if (value !== undefined) parts.push(`${COMPARISON_COLUMN_TEXT[contour.column].label} ${COMPARISON_COLUMN_FORMAT[contour.column](value)}`);
  }
  return parts.join('　');
}

function KindMark({ kind, size = MARK_SIZE }: { readonly kind: LayoutKind; readonly size?: number }) {
  const style = SCATTER_KIND_STYLES[kind];
  // 色は`var(--kind-color-*)`が来るので、属性でなくstyleで渡す
  return <path className="scatter-mark" data-kind={kind} data-mark={style.shape} d={targetMarkPath(style.shape, size)} style={{ fill: style.color }} />;
}

function rowKey(row: ScatterRow): string {
  return row.targetKey;
}

/**
 * 散布図の本体。対象が空の時はホストが選ぶボタンを出し、本体は呼ばれない。
 * 計算中・失敗・値なしの対象は、図の外に名前と状態を出す。
 */
export function ScatterBody({ extracted, order, rowContext, options }: ScatterBodyProps) {
  const axes = axesOf(options);
  const problem = scatterAxisProblem(axes.x, axes.y);
  const rowByKey = useMemo(() => new Map(extracted.rows.map((row) => [rowKey(row), row] as const)), [extracted.rows]);
  const [activeKey, setActiveKey] = useState<string | undefined>(undefined);

  const { plotted, excluded, inputChars } = useMemo(() => {
    const plotted: PlottedRow[] = [];
    const excluded: ExcludedRow[] = [];
    let inputChars = 0;
    for (const targetKey of order) {
      const context = rowContext.get(targetKey);
      const label = context?.label ?? '—';
      const fullName = context?.fullName ?? '';
      const row = rowByKey.get(targetKey);
      if (row === undefined) {
        // extractedにまだ無いtargetKey（依頼の作り直し途中の一瞬）。値の欠落を偽らず、計算中と出す。
        excluded.push({ targetKey, label, fullName, status: 'computing', message: '計算中…' });
      } else if (row.kind === 'failed') {
        excluded.push({ targetKey, label, fullName, status: 'failed', message: row.message });
      } else {
        inputChars = row.inputChars;
        const x = row.values[axes.x];
        const y = row.values[axes.y];
        if (Number.isFinite(x) && Number.isFinite(y)) plotted.push({ targetKey, label, fullName, kind: context?.kind ?? 'alpha', x, y });
        else excluded.push({ targetKey, label, fullName, status: 'no-value', message: '値なし' });
      }
    }
    return { plotted, excluded, inputChars };
  }, [order, rowContext, rowByKey, axes.x, axes.y]);

  const contour = useMemo(() => (problem === undefined ? scatterContour(axes.x, axes.y, inputChars) : undefined), [problem, axes.x, axes.y, inputChars]);
  const usedKinds = useMemo(() => SCATTER_KIND_ORDER.filter((kind) => plotted.some((row) => row.kind === kind)), [plotted]);
  const model = useMemo(
    () =>
      scatterPlotModel({
        points: plotted.map(({ targetKey, label, x, y }) => ({ targetKey, label, x, y })),
        contour,
        legendRows: usedKinds.map((kind) => SCATTER_KIND_STYLES[kind].label),
        contourName: contour === undefined ? '' : COMPARISON_COLUMN_TEXT[contour.column].label,
        contourSuffix: contour !== undefined && isPercentColumn(contour.column) ? '%' : '',
      }),
    [plotted, contour, usedKinds],
  );
  const plottedByKey = new Map(plotted.map((row) => [row.targetKey, row] as const));
  const active = activeKey === undefined ? undefined : model.points.find((point) => point.targetKey === activeKey);
  const activeRow = active === undefined ? undefined : plottedByKey.get(active.targetKey);

  const quantityHelp = scatterQuantityHelp(axes, contour);

  return (
    <section className="scatter-feature" data-react-feature="scatter">
      {problem !== undefined ? (
        <p className="scatter-notice" role="alert" data-scatter-axis-problem="">
          {AXIS_PROBLEM_TEXT[problem]}
        </p>
      ) : plotted.length > 0 ? (
        <>
          <div className="scatter-heading">
            <InfoButton name="図の見方" description={quantityHelp.description} help={quantityHelp.help} />
          </div>
          <div className="scatter-figure">
            <svg
              viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
              aria-label={`${COMPARISON_COLUMN_TEXT[axes.x].label}と${COMPARISON_COLUMN_TEXT[axes.y].label}の散布図`}
            >
              <rect
                className="scatter-frame"
                x={PLOT_MARGIN.left}
                y={PLOT_MARGIN.top}
                width={PLOT_RIGHT - PLOT_MARGIN.left}
                height={PLOT_BOTTOM - PLOT_MARGIN.top}
              />
              {model.yTicks.map((tick) => (
                <g key={`y${tick.value}`}>
                  <path
                    className="scatter-tick-mark"
                    d={`M${PLOT_MARGIN.left},${tick.position}h${TICK_LENGTH}M${PLOT_RIGHT},${tick.position}h${-TICK_LENGTH}`}
                  />
                  <text className="scatter-tick" x={PLOT_MARGIN.left - 8} y={tick.position + 4} textAnchor="end">
                    {tick.text}
                  </text>
                </g>
              ))}
              {model.xTicks.map((tick) => (
                <g key={`x${tick.value}`}>
                  <path
                    className="scatter-tick-mark"
                    d={`M${tick.position},${PLOT_BOTTOM}v${-TICK_LENGTH}M${tick.position},${PLOT_MARGIN.top}v${TICK_LENGTH}`}
                  />
                  <text className="scatter-tick" x={tick.position} y={PLOT_BOTTOM + 16} textAnchor="middle">
                    {tick.text}
                  </text>
                </g>
              ))}
              <text
                className="scatter-axis-title"
                x={0}
                y={0}
                transform={`translate(14 ${(PLOT_MARGIN.top + PLOT_BOTTOM) / 2}) rotate(-90)`}
                textAnchor="middle"
                data-scatter-y-title=""
              >
                {COMPARISON_COLUMN_TEXT[axes.y].label}
              </text>
              <text
                className="scatter-axis-title"
                x={(PLOT_MARGIN.left + PLOT_RIGHT) / 2}
                y={PLOT_HEIGHT - 8}
                textAnchor="middle"
                data-scatter-x-title=""
              >
                {COMPARISON_COLUMN_TEXT[axes.x].label}
              </text>

              {model.contours.map((line) => (
                <g key={line.level} className="scatter-contour" data-scatter-contour={line.level}>
                  <path d={line.d} fill="none" />
                  {line.labelAt === undefined ? null : (
                    <text x={line.labelAt.x} y={line.labelAt.y} textAnchor="end">
                      {line.text}
                    </text>
                  )}
                </g>
              ))}

              {model.legend === undefined ? null : (
                <g className="scatter-legend-box" data-scatter-legend-box="">
                  <rect
                    x={model.legend.x0}
                    y={model.legend.y0}
                    width={model.legend.x1 - model.legend.x0}
                    height={model.legend.y1 - model.legend.y0}
                    rx={3}
                  />
                  {model.legend.rows.map((row, index) =>
                    index < usedKinds.length ? (
                      <g key={usedKinds[index]} data-scatter-legend={usedKinds[index]}>
                        <g transform={`translate(${row.sampleX} ${row.y})`}>
                          <KindMark kind={usedKinds[index]!} size={5} />
                        </g>
                        <text x={row.textX} y={row.y + 4}>
                          {row.text}
                        </text>
                      </g>
                    ) : (
                      <g key="contour" data-scatter-legend-contour="">
                        <line className="scatter-contour-sample" x1={row.sampleX - 10} x2={row.sampleX + 10} y1={row.y} y2={row.y} />
                        <text x={row.textX} y={row.y + 4}>
                          {row.text}
                        </text>
                      </g>
                    ),
                  )}
                </g>
              )}

              {model.points.map((point) => {
                const row = plottedByKey.get(point.targetKey)!;
                const isActive = activeKey === point.targetKey;
                return (
                  // biome-ignore lint/a11y/noStaticElementInteractions: 点にフォーカスを当てて、値の読み取りを出す。図の読み取りの操作で、押して何かをするものではない
                  <g
                    key={point.targetKey}
                    className="scatter-point"
                    data-scatter-point={point.targetKey}
                    data-kind={row.kind}
                    data-active={isActive || undefined}
                    tabIndex={0}
                    aria-label={readoutText({ ...point, fullName: row.fullName }, axes, contour)}
                    style={{ transform: `translate(${point.px.toFixed(1)}px, ${point.py.toFixed(1)}px)` }}
                    onPointerEnter={() => setActiveKey(point.targetKey)}
                    onPointerLeave={() => setActiveKey((current) => (current === point.targetKey ? undefined : current))}
                    onFocus={() => setActiveKey(point.targetKey)}
                    onBlur={() => setActiveKey((current) => (current === point.targetKey ? undefined : current))}
                  >
                    <title>{row.fullName || row.label}</title>
                    <circle className="scatter-point-ring" r={MARK_SIZE + 4} />
                    <KindMark kind={row.kind} />
                    <text className="scatter-point-label" x={point.labelAt.x - point.px} y={point.labelAt.y - point.py} textAnchor={point.labelAt.anchor}>
                      {point.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="scatter-readout" data-scatter-readout="" aria-live="off">
            {active === undefined || activeRow === undefined ? '' : readoutText({ ...active, fullName: activeRow.fullName }, axes, contour)}
          </p>
        </>
      ) : null}

      {excluded.length > 0 ? (
        <ul className="scatter-excluded">
          {excluded.map((row) => (
            <li key={row.targetKey} data-scatter-excluded={row.status}>
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

const COLUMN_CHOICES = COMPARISON_COLUMN_IDS.map((column) => ({ value: column, label: COMPARISON_COLUMN_TEXT[column].label }));

/** 散布図の解析設定（組み合わせと、自由に選ぶ時の軸）。選べない組になる列は、選択肢から外す。 */
export function ScatterSettings({ options, onOptionsChange }: AnalyzerSettingsProps<ScatterOptions>) {
  const bind = <K extends keyof ScatterOptions>(key: K) => bindOption(options, DEFAULT_SCATTER_OPTIONS, onOptionsChange, key);
  return (
    <div className="option-groups">
      <SelectOptionField
        label="組み合わせ"
        binding={bind('preset')}
        choices={SCATTER_PRESET_IDS.map((id) => ({ value: id, label: SCATTER_PRESET_LABELS[id] }))}
      />
      {options.preset === 'free' ? (
        <>
          <SelectOptionField
            label="横軸"
            binding={bind('xAxis')}
            choices={COLUMN_CHOICES.filter((choice) => choice.value === options.xAxis || scatterAxisProblem(choice.value, options.yAxis) === undefined)}
          />
          <SelectOptionField
            label="縦軸"
            binding={bind('yAxis')}
            choices={COLUMN_CHOICES.filter((choice) => choice.value === options.yAxis || scatterAxisProblem(options.xAxis, choice.value) === undefined)}
            hint="軸の2つの数値から決まる別の数値がある組には、その数値が同じになる位置の線を引きます。"
          />
        </>
      ) : null}
    </div>
  );
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const scatterAnalyzer = {
  definition: scatterDefinition,
  ...SCATTER_PANE_META,
  Body: ScatterBody,
  Settings: ScatterSettings,
  defaultOptions: DEFAULT_SCATTER_OPTIONS,
  urlOptions: scatterOptions,
  rowContext: ({ targetKey, label, fullName, header }) => ({ targetKey, label, fullName, kind: header?.layoutKind }),
} satisfies SetAnalyzerPaneParts<ScatterOptions, ScatterExtracted, ScatterRowContext>;
