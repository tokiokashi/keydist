import { useMemo, useState } from 'react';
import type { LayoutKind } from '#input/layouts/kind.ts';
import { bindOption, SelectOptionField } from '#ui/primitives/option-fields.tsx';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import { targetMarkPath } from '#ui/theme/target-marks.ts';
import type { AnalyzerSettingsProps, SetAnalyzerPaneParts, SetBodyProps } from '../pane-parts.tsx';
import type { TextLanguage } from '#input/text/language.ts';
import { COMPARISON_COLUMN_IDS, comparisonColumnText } from '../comparison-column-text.ts';
import { useTextLanguage } from '../text-language-context.tsx';
import { kanaUnitOf } from '../unit-words.ts';
import type { ComparisonRowValues } from '../comparison-column-values.ts';
import {
  SCATTER_PRESET_AXES,
  SCATTER_PRESET_IDS,
  scatterPresetLabels,
  isHandShareColumn,
  scatterAxisProblem,
  scatterContour,
  type ScatterAxes,
  type ScatterAxisProblem,
} from './axes.ts';
import { axisName, axisPlotTitle, axisTitle, axisUnit, SCATTER_KANA_SCRIPT } from './axis-names.ts';
import { scatterDefinition, type ScatterExtracted, type ScatterRow } from './extract.ts';
import { SCATTER_KIND_ORDER, SCATTER_KIND_STYLES } from './kinds.ts';
import { DEFAULT_SCATTER_OPTIONS, scatterOptions, type ScatterOptions } from './options.ts';
import { SCATTER_PANE_META } from './pane-meta.ts';
import { readoutText, scatterCaption, scatterQuantityHelp } from './quantity-help.ts';
import { MARK_RADIUS, PLOT_HEIGHT, PLOT_MARGIN, PLOT_WIDTH, scatterPlotModel } from './plot-model.ts';
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
const MARK_SIZE = MARK_RADIUS;

const PLOT_RIGHT = PLOT_WIDTH - PLOT_MARGIN.right;
const PLOT_BOTTOM = PLOT_HEIGHT - PLOT_MARGIN.bottom;
/** 目盛りの線の長さ。枠の内側へ向ける。 */
const TICK_LENGTH = 5;

function axesOf(options: ScatterOptions): ScatterAxes {
  return options.preset === 'free' ? { x: options.xAxis, y: options.yAxis } : SCATTER_PRESET_AXES[options.preset];
}

function axisProblemText(problem: ScatterAxisProblem, language: TextLanguage): string {
  const k = kanaUnitOf(language, SCATTER_KANA_SCRIPT);
  return problem === 'same'
    ? '同じ列は、横軸と縦軸の両方に選べません。'
    : `アクション数とアクション数/${k}、距離とu/${k}、u/アクションとアクション/uのように、同じテキストなら一方が他方の定数倍か、積が一定になる2列は、同時に選べません。`;
}

interface PlottedRow {
  readonly targetKey: string;
  readonly label: string;
  readonly fullName: string;
  readonly kind: LayoutKind;
  readonly x: number;
  readonly y: number;
  /** 全列の値。点の読み取りで、等位線の量の列が値を持つかを見る。 */
  readonly values: ComparisonRowValues;
}

interface ExcludedRow {
  readonly targetKey: string;
  readonly label: string;
  readonly fullName: string;
  readonly status: 'computing' | 'failed' | 'no-value';
  readonly message: string;
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
  const language = useTextLanguage();
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
        if (Number.isFinite(x) && Number.isFinite(y))
          plotted.push({ targetKey, label, fullName, kind: context?.kind ?? 'alpha', x, y, values: row.values });
        else excluded.push({ targetKey, label, fullName, status: 'no-value', message: '値なし' });
      }
    }
    return { plotted, excluded, inputChars };
  }, [order, rowContext, rowByKey, axes.x, axes.y]);

  const contour = useMemo(
    () => (problem === undefined ? scatterContour(axes.x, axes.y, inputChars, language) : undefined),
    [problem, axes.x, axes.y, inputChars, language],
  );
  // 線を引かない組でも、3つの量の関係は図の見方に出すので`contour`は残す。点の読み取りと凡例には、線を引く組の線の量だけを出す
  const lineContour = contour?.drawsLines === true ? contour : undefined;
  const usedKinds = useMemo(() => SCATTER_KIND_ORDER.filter((kind) => plotted.some((row) => row.kind === kind)), [plotted]);
  const model = useMemo(
    () =>
      scatterPlotModel({
        points: plotted.map(({ targetKey, label, x, y }) => ({ targetKey, label, x, y })),
        contour: lineContour,
        legendRows: usedKinds.map((kind) => SCATTER_KIND_STYLES[kind].label),
        contourName: lineContour === undefined ? '' : axisTitle(lineContour.column, language),
        contourSuffix: lineContour !== undefined && axisUnit(lineContour.column) === '%' ? '%' : '',
        centerAxes: { x: isHandShareColumn(axes.x), y: isHandShareColumn(axes.y) },
      }),
    [plotted, lineContour, usedKinds, language, axes.x, axes.y],
  );
  const plottedByKey = new Map(plotted.map((row) => [row.targetKey, row] as const));
  const active = activeKey === undefined ? undefined : model.points.find((point) => point.targetKey === activeKey);
  const activeRow = active === undefined ? undefined : plottedByKey.get(active.targetKey);

  const quantityHelp = scatterQuantityHelp(axes, contour, language);

  return (
    <section className="scatter-feature" data-react-feature="scatter">
      {problem !== undefined ? (
        <p className="scatter-notice" role="alert" data-scatter-axis-problem="">
          {axisProblemText(problem, language)}
        </p>
      ) : plotted.length > 0 ? (
        <>
          <div className="scatter-heading">
            <InfoButton name="図の見方" description={quantityHelp.description} help={quantityHelp.help} />
          </div>
          <figure className="scatter-figure">
            <svg
              viewBox={`${model.viewBoxX} 0 ${PLOT_WIDTH - model.viewBoxX} ${PLOT_HEIGHT}`}
              aria-label={`${axisName(axes.x, language)}と${axisName(axes.y, language)}の散布図`}
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
                transform={`translate(${model.yTitleX} ${(PLOT_MARGIN.top + PLOT_BOTTOM) / 2}) rotate(-90)`}
                textAnchor="middle"
                data-scatter-y-title=""
              >
                {axisPlotTitle(axes.y, language)}
              </text>
              <text
                className="scatter-axis-title"
                x={(PLOT_MARGIN.left + PLOT_RIGHT) / 2}
                y={PLOT_HEIGHT - 8}
                textAnchor="middle"
                data-scatter-x-title=""
              >
                {axisPlotTitle(axes.x, language)}
              </text>

              {model.centerLines.map((line) => (
                <line
                  key={line.axis}
                  className="scatter-center-line"
                  data-scatter-center-line={line.axis}
                  x1={line.axis === 'x' ? line.position : PLOT_MARGIN.left}
                  x2={line.axis === 'x' ? line.position : PLOT_RIGHT}
                  y1={line.axis === 'x' ? PLOT_MARGIN.top : line.position}
                  y2={line.axis === 'x' ? PLOT_BOTTOM : line.position}
                />
              ))}

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
                    aria-label={readoutText({ ...point, fullName: row.fullName, values: row.values }, axes, contour, language)}
                    style={{ transform: `translate(${point.px.toFixed(1)}px, ${point.py.toFixed(1)}px)` }}
                    onPointerEnter={() => setActiveKey(point.targetKey)}
                    onPointerLeave={() => setActiveKey((current) => (current === point.targetKey ? undefined : current))}
                    onFocus={() => setActiveKey(point.targetKey)}
                    onBlur={() => setActiveKey((current) => (current === point.targetKey ? undefined : current))}
                  >
                    <title>{row.fullName || row.label}</title>
                    <circle className="scatter-point-ring" r={MARK_SIZE + 4} />
                    <KindMark kind={row.kind} />
                  </g>
                );
              })}

              {/* 点の名前。印が重なる点の組は複数の点に属するので、点ごとの要素の外に描く。読み上げは点ごとの値の読み取りが担う */}
              {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: この要素はフォーカスを受けない。フォーカスを受ける点の要素は別に描いている */}
              <g className="scatter-names" aria-hidden="true">
                {model.names.map((name) => (
                  <g key={name.lines.map((line) => line.targetKey).join('\n')} className="scatter-name" data-scatter-name={name.lines.length}>
                    {name.leader === undefined ? null : (
                      <line className="scatter-leader" x1={name.leader.x1} y1={name.leader.y1} x2={name.leader.x2} y2={name.leader.y2} />
                    )}
                    {name.lines.map((line) => (
                      <text
                        key={line.targetKey}
                        className="scatter-point-label"
                        data-scatter-name-of={line.targetKey}
                        data-active={activeKey === line.targetKey || undefined}
                        x={line.x}
                        y={line.y}
                      >
                        {line.text}
                      </text>
                    ))}
                  </g>
                ))}
              </g>
            </svg>
            <figcaption className="scatter-caption" data-scatter-caption="">
              {scatterCaption(axes, language)}
            </figcaption>
          </figure>
          <p className="scatter-readout" data-scatter-readout="" aria-live="off">
            {active === undefined || activeRow === undefined
              ? ''
              : readoutText({ ...active, fullName: activeRow.fullName, values: activeRow.values }, axes, contour, language)}
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

/** 散布図の解析設定（組み合わせと、自由に選ぶ時の軸）。選べない組になる列は、選択肢から外す。 */
export function ScatterSettings({ options, onOptionsChange }: AnalyzerSettingsProps<ScatterOptions>) {
  const bind = <K extends keyof ScatterOptions>(key: K) => bindOption(options, DEFAULT_SCATTER_OPTIONS, onOptionsChange, key);
  const language = useTextLanguage();
  const text = comparisonColumnText(language, SCATTER_KANA_SCRIPT);
  const presetLabels = scatterPresetLabels(language);
  const COLUMN_CHOICES = COMPARISON_COLUMN_IDS.map((column) => ({ value: column, label: text[column].label }));
  return (
    <div className="option-groups">
      <SelectOptionField label="組み合わせ" binding={bind('preset')} choices={SCATTER_PRESET_IDS.map((id) => ({ value: id, label: presetLabels[id] }))} />
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
            hint="軸の2つの数値から決まる別の数値がある組には、その数値が同じになる位置の線を引きます。1キーあたりの距離など、配列ごとに違う回数で割った距離の線は引きません。"
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
