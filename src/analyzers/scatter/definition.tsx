import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { LayoutKind } from '#input/layouts/kind.ts';
import { bindOption, CheckboxGroupOptionField, SegmentedOptionField, SelectOptionField } from '#ui/primitives/option-fields.tsx';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import { targetMarkPath } from '#ui/theme/target-marks.ts';
import type { AnalyzerSettingsProps, FigureImageSource, SetAnalyzerPaneParts, SetBodyProps } from '../pane-parts.tsx';
import type { TextLanguage } from '#input/text/language.ts';
import { COMPARISON_COLUMN_IDS, comparisonColumnText } from '../comparison-column-text.ts';
import { useTextLanguage } from '../text-language-context.tsx';
import { kanaUnitOf } from '../unit-words.ts';
import { SCATTER_PRESET_IDS, scatterPresetLabels, scatterAxisProblem, type ScatterAxisProblem } from './axes.ts';
import { axisName, axisPlotTitle, SCATTER_KANA_SCRIPT } from './axis-names.ts';
import { scatterDefinition, type ScatterExtracted } from './extract.ts';
import { FIGURE_GAP, FIGURE_MAX_WIDTH, scatterColumnCount } from './figure-layout.ts';
import { scatterFigureModels, type ScatterFigureModel } from './figure-model.ts';
import { SCATTER_KIND_STYLES } from './kinds.ts';
import { DEFAULT_SCATTER_OPTIONS, scatterOptions, type ScatterOptions } from './options.ts';
import { SCATTER_PANE_META } from './pane-meta.ts';
import { READING_NOTE, readoutAriaLabel, readoutParts, scatterCaption, scatterQuantityHelp } from './quantity-help.ts';
import { MARK_RADIUS, PLOT_HEIGHT, PLOT_MARGIN, PLOT_WIDTH } from './plot-model.ts';
import { readingTargets, stillPinned, togglePinned } from './reading.ts';
import './scatter-view.css';

/**
 * 散布図の可視化。`extracted`（`extract.ts`の計算結果）の列の値を、`plot-model.ts`が決めた座標に置くだけで、
 * 指標は計算し直さない（docs/architecture.md「可視化は計算しない」）。
 * 選んだ組み合わせごとに図を1つ描き、図の並びの幅から列の数を決める。点の読み取りは全ての図で連動する。
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

/** 対数の目盛りを選んでいるのに通常の目盛りで描く理由を、理由ごとに1文で伝える。 */
const LOG_BLOCKER_TEXTS = {
  noStraightLines: '細い線が直線にならない図なので、対数の目盛りにはできず、通常の目盛りで表示しています。',
  nonPositive: '0以下の値があるので、対数の目盛りにはできず、通常の目盛りで表示しています。',
} as const;

function axisProblemText(problem: ScatterAxisProblem, language: TextLanguage): string {
  const k = kanaUnitOf(language, SCATTER_KANA_SCRIPT);
  return problem === 'same'
    ? '同じ列は、横軸と縦軸の両方に選べません。'
    : `アクション数とアクション数/${k}、距離とu/${k}、u/アクションとアクション/uのように、同じテキストなら一方が他方の定数倍か、積が一定になる2列は、同時に選べません。`;
}

function KindMark({ kind, size = MARK_SIZE }: { readonly kind: LayoutKind; readonly size?: number }) {
  const style = SCATTER_KIND_STYLES[kind];
  // 色は`var(--kind-color-*)`が来るので、属性でなくstyleで渡す
  return <path className="scatter-mark" data-kind={kind} data-mark={style.shape} d={targetMarkPath(style.shape, size)} style={{ fill: style.color }} />;
}

/** 画像の書き出しの結果を、ボタンのそばにしばらく出す時間 [ms]。 */
const COPY_STATUS_MS = 1800;
const COPY_IMAGE_LABEL = '図を画像でコピー';

/** 図を画像にして書き出すボタンと、結果の知らせ。 */
function CopyImageControl({
  copyFigureImage,
  source,
}: {
  readonly copyFigureImage: (source: FigureImageSource) => Promise<boolean>;
  readonly source: () => FigureImageSource | undefined;
}) {
  const [result, setResult] = useState<'copied' | 'failed' | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const show = (next: 'copied' | 'failed') => {
    setResult(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setResult(undefined), COPY_STATUS_MS);
  };
  const copy = () => {
    const target = source();
    if (target === undefined) {
      show('failed');
      return;
    }
    copyFigureImage(target).then(
      (copied) => show(copied ? 'copied' : 'failed'),
      () => show('failed'),
    );
  };
  return (
    <span className="scatter-copy">
      <button type="button" className="scatter-copy-button" aria-label={COPY_IMAGE_LABEL} title={COPY_IMAGE_LABEL} onClick={copy}>
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <rect x="5.25" y="5.25" width="8.25" height="8.25" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M10.75 3.5V3.1c0-.9-.7-1.6-1.6-1.6H3.1c-.9 0-1.6.7-1.6 1.6v6.05c0 .9.7 1.6 1.6 1.6h.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <span className="scatter-copy-status" role="status">
        {result === 'copied' ? '画像をコピーしました' : result === 'failed' ? '画像をコピーできませんでした' : ''}
      </span>
    </span>
  );
}

/** 要素の幅 [px]。まだ測っていない間は`undefined`。 */
function useElementWidth(ref: RefObject<HTMLElement | null>): number | undefined {
  const [width, setWidth] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

interface FigureViewProps {
  readonly figure: ScatterFigureModel;
  readonly language: TextLanguage;
  /** 留めた対象。 */
  readonly pinned: string | undefined;
  /** ポインターを重ねているかフォーカスしている対象（留めた対象と同じ時は`undefined`）。 */
  readonly hovered: string | undefined;
  readonly onHover: (targetKey: string) => void;
  readonly onLeave: (targetKey: string) => void;
  readonly onTogglePin: (targetKey: string) => void;
  /** 図を画像にして書き出す手段（ホストが渡す）。無い画面ではボタンを出さない。 */
  readonly copyFigureImage: ((source: FigureImageSource) => Promise<boolean>) | undefined;
}

/** 組み合わせ1つぶんの図（見出し・知らせ・図・読み取り・描けない対象の一覧）。 */
function FigureView({ figure, language, pinned, hovered, onHover, onLeave, onTogglePin, copyFigureImage }: FigureViewProps) {
  const figureRef = useRef<HTMLElement>(null);
  const readoutsRef = useRef<HTMLDivElement>(null);
  // 画像に含めるのは、留めた点の読み取りだけ（ポインターを重ねた点の読み取りは含めない）
  const imageSource = (): FigureImageSource | undefined => {
    const svg = figureRef.current?.querySelector('svg');
    const caption = figureRef.current?.querySelector('figcaption');
    if (svg == null || caption == null) return undefined;
    const row = pinned === undefined ? null : readoutsRef.current?.querySelector('[data-scatter-readout="pinned"]');
    const text = row?.querySelector('.scatter-readout-text');
    return {
      svg,
      caption,
      readout: row == null || text == null ? undefined : { row, mark: row.querySelector('.scatter-readout-mark'), text },
    };
  };
  const { axes, problem, plotted, excluded, contour, logScale, logReasons, usedKinds, model } = figure;
  const plottedByKey = new Map(plotted.map((row) => [row.targetKey, row] as const));
  const quantityHelp = scatterQuantityHelp(axes, contour, language, logScale);
  const readouts = [
    { role: 'pinned', point: pinned === undefined ? undefined : model.points.find((point) => point.targetKey === pinned) },
    { role: 'hover', point: hovered === undefined ? undefined : model.points.find((point) => point.targetKey === hovered) },
  ] as const;
  const shownReadouts = readouts.flatMap(({ role, point }) => {
    const row = point === undefined ? undefined : plottedByKey.get(point.targetKey);
    return point === undefined || row === undefined
      ? []
      : [{ role, key: point.targetKey, parts: readoutParts({ ...point, fullName: row.fullName, values: row.values }, axes, contour, language) }];
  });

  return (
    <div className="scatter-cell" data-scatter-figure={figure.preset}>
      {problem !== undefined ? (
        <p className="scatter-notice" role="alert" data-scatter-axis-problem="">
          {axisProblemText(problem, language)}
        </p>
      ) : plotted.length > 0 ? (
        <>
          <div className="scatter-heading">
            <InfoButton
              name="図の見方"
              description={quantityHelp.description}
              help={{ ...quantityHelp.help, notes: [...quantityHelp.help.notes, READING_NOTE] }}
            />
            {copyFigureImage === undefined ? null : <CopyImageControl copyFigureImage={copyFigureImage} source={imageSource} />}
          </div>
          {logReasons.map((reason) => (
            <p key={reason} className="scatter-notice" data-scatter-log-notice={reason}>
              {LOG_BLOCKER_TEXTS[reason]}
            </p>
          ))}
          <figure ref={figureRef} className="scatter-figure">
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
                {axisPlotTitle(axes.y, language, logScale)}
              </text>
              <text
                className="scatter-axis-title"
                x={(PLOT_MARGIN.left + PLOT_RIGHT) / 2}
                y={PLOT_HEIGHT - 8}
                textAnchor="middle"
                data-scatter-x-title=""
              >
                {axisPlotTitle(axes.x, language, logScale)}
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

              {/* 名前の文字を押せるようにする透明な層。点の印より下に置き、名前の文字が別の点の印と重なる所では、点の印が操作を受ける。見える名前は、この層の上に点の印より手前で描く */}
              {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: この要素はフォーカスを受けない。フォーカスを受ける点の要素は別に描いている */}
              <g className="scatter-name-hits" aria-hidden="true">
                {model.names.map((name) => (
                  <g key={name.lines.map((line) => line.targetKey).join('\n')} textAnchor={name.anchor}>
                    {name.lines.map((line) => (
                      // biome-ignore lint/a11y/noStaticElementInteractions: ポインターだけの補助で、キーボードの操作と読み上げは点の要素が受け持つ
                      <text
                        key={line.targetKey}
                        className="scatter-name-hit"
                        data-scatter-name-hit-of={line.targetKey}
                        x={line.x}
                        y={line.y}
                        onPointerEnter={() => onHover(line.targetKey)}
                        onPointerLeave={() => onLeave(line.targetKey)}
                        onClick={() => onTogglePin(line.targetKey)}
                      >
                        {line.text}
                      </text>
                    ))}
                  </g>
                ))}
              </g>

              {model.points.map((point) => {
                const row = plottedByKey.get(point.targetKey)!;
                const isPinned = pinned === point.targetKey;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: SVGの<g>はbuttonに置き換えられない。押すと読み取りを留める操作の部品で、役割とキー操作をここで付けている
                  <g
                    key={point.targetKey}
                    className="scatter-point"
                    role="button"
                    aria-pressed={isPinned}
                    data-scatter-point={point.targetKey}
                    data-kind={row.kind}
                    data-active={hovered === point.targetKey || undefined}
                    data-pinned={isPinned || undefined}
                    tabIndex={0}
                    aria-label={readoutAriaLabel({ ...point, fullName: row.fullName, values: row.values }, axes, contour, language)}
                    style={{ transform: `translate(${point.px.toFixed(1)}px, ${point.py.toFixed(1)}px)` }}
                    onPointerEnter={() => onHover(point.targetKey)}
                    onPointerLeave={() => onLeave(point.targetKey)}
                    onFocus={() => onHover(point.targetKey)}
                    onBlur={() => onLeave(point.targetKey)}
                    onClick={() => onTogglePin(point.targetKey)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      onTogglePin(point.targetKey);
                    }}
                  >
                    <circle className="scatter-point-ring" r={MARK_SIZE + 4} />
                    <KindMark kind={row.kind} />
                  </g>
                );
              })}

              {/* 点の名前。印が重なる点の組は複数の点に属するので、点ごとの要素の外に描く。読み上げは点ごとの値の読み取りが担う。ポインターの操作は下の透明な層が受ける */}
              {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: この要素はフォーカスを受けない。フォーカスを受ける点の要素は別に描いている */}
              <g className="scatter-names" aria-hidden="true">
                {model.names.map((name) => (
                  <g
                    key={name.lines.map((line) => line.targetKey).join('\n')}
                    className="scatter-name"
                    data-scatter-name={name.lines.length}
                    textAnchor={name.anchor}
                  >
                    {name.leader === undefined ? null : (
                      <line className="scatter-leader" x1={name.leader.x1} y1={name.leader.y1} x2={name.leader.x2} y2={name.leader.y2} />
                    )}
                    {name.lines.map((line) => (
                      <text
                        key={line.targetKey}
                        className="scatter-point-label"
                        data-scatter-name-of={line.targetKey}
                        data-active={hovered === line.targetKey || undefined}
                        data-pinned={pinned === line.targetKey || undefined}
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
          <div ref={readoutsRef} className="scatter-readouts" data-scatter-readouts="" data-pinned={pinned !== undefined || undefined} aria-live="off">
            {shownReadouts.map(({ role, key, parts }) => (
              <p key={role} className="scatter-readout" data-scatter-readout={role} data-scatter-readout-of={key}>
                {pinned === undefined ? null : <span className="scatter-readout-mark" aria-hidden="true" />}
                <span className="scatter-readout-text">
                  {parts.name}
                  {'　'}
                  <span className="scatter-readout-nowrap" data-scatter-readout-coordinates="">
                    {parts.coordinates}
                  </span>
                  {parts.contour === undefined ? null : (
                    <>
                      {'　'}
                      <span className="scatter-readout-nowrap" data-scatter-readout-contour="">
                        {parts.contour}
                      </span>
                    </>
                  )}
                </span>
              </p>
            ))}
          </div>
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
    </div>
  );
}

/**
 * 散布図の本体。対象が空の時はホストが選ぶボタンを出し、本体は呼ばれない。
 * 選んだ組み合わせごとの図を、並べる領域の幅で決めた列の数で並べる。
 * 計算中・失敗・値なしの対象は、図ごとに図の外へ名前と状態を出す。
 */
export function ScatterBody({ extracted, order, rowContext, options, copyFigureImage }: ScatterBodyProps) {
  const language = useTextLanguage();
  const gridRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(gridRef);
  const [hoveredKey, setHoveredKey] = useState<string | undefined>(undefined);
  const [pinnedKey, setPinnedKey] = useState<string | undefined>(undefined);

  const figures = useMemo(
    () =>
      scatterFigureModels(options.presets, {
        order,
        rowContext,
        rows: extracted.rows,
        xAxis: options.xAxis,
        yAxis: options.yAxis,
        tickScale: options.tickScale,
        language,
      }),
    [options.presets, options.xAxis, options.yAxis, options.tickScale, order, rowContext, extracted.rows, language],
  );

  // 留めた対象がどの図にも描かれなくなったら、留めるのをやめる
  const plottedKeys = useMemo(() => new Set(figures.flatMap((figure) => figure.model.points.map((point) => point.targetKey))), [figures]);
  const pinned = stillPinned(pinnedKey, plottedKeys);
  useEffect(() => {
    if (pinnedKey !== undefined && pinned === undefined) setPinnedKey(undefined);
  }, [pinnedKey, pinned]);
  const reading = readingTargets(pinned, hoveredKey);

  const columns = scatterColumnCount(options.columns, width, figures.length);

  // Escは、フォーカスが散布図の中にある時だけ留めるのをやめる。ⓘの小窓などの別の要素のEscには反応しない
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && pinned !== undefined && event.currentTarget.contains(event.target as Node)) setPinnedKey(undefined);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 点にフォーカスがある間のEscで、留めた読み取りをやめる。操作の入口は点の要素にある
    <section className="scatter-feature" data-react-feature="scatter" data-scatter-columns={columns} onKeyDown={onKeyDown}>
      <div
        ref={gridRef}
        className="scatter-grid"
        style={{ gap: FIGURE_GAP, gridTemplateColumns: `repeat(${columns}, minmax(0, ${FIGURE_MAX_WIDTH}px))` }}
      >
        {figures.map((figure) => (
          <FigureView
            key={figure.preset}
            figure={figure}
            language={language}
            copyFigureImage={copyFigureImage}
            pinned={reading.pinned}
            hovered={reading.hovered}
            onHover={setHoveredKey}
            onLeave={(targetKey) => setHoveredKey((current) => (current === targetKey ? undefined : current))}
            onTogglePin={(targetKey) => setPinnedKey((current) => togglePinned(stillPinned(current, plottedKeys), targetKey))}
          />
        ))}
      </div>
    </section>
  );
}

/** 散布図の解析設定（組み合わせ・列の数・目盛りと、自由に選ぶ時の軸）。選べない組になる列は、選択肢から外す。 */
export function ScatterSettings({ options, onOptionsChange }: AnalyzerSettingsProps<ScatterOptions>) {
  const bind = <K extends keyof ScatterOptions>(key: K) => bindOption(options, DEFAULT_SCATTER_OPTIONS, onOptionsChange, key);
  const language = useTextLanguage();
  const text = comparisonColumnText(language, SCATTER_KANA_SCRIPT);
  const presetLabels = scatterPresetLabels(language);
  const COLUMN_CHOICES = COMPARISON_COLUMN_IDS.map((column) => ({ value: column, label: text[column].label }));
  return (
    <div className="option-groups">
      <CheckboxGroupOptionField
        label="組み合わせ"
        binding={bind('presets')}
        choices={SCATTER_PRESET_IDS.map((id) => ({ value: id, label: presetLabels[id] }))}
        minSelected={1}
        listed
      />
      {options.presets.includes('free') ? (
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
            hint="軸の2つの数値から決まる別の数値がある組には、その数値が同じになる位置の線を引きます。キー1つで動く距離など、配列ごとに違う回数で割った距離の線は引きません。"
          />
        </>
      ) : null}
      <SegmentedOptionField
        label="目盛り"
        binding={bind('tickScale')}
        choices={[
          { value: 'linear', label: '通常' },
          { value: 'log', label: '対数' },
        ]}
        hint="対数にできるのは、細い線が直線になる図だけです。"
      />
      <SegmentedOptionField
        label="列の数"
        binding={bind('columns')}
        choices={[
          { value: 'auto', label: '自動' },
          { value: '1', label: '1' },
          { value: '2', label: '2' },
          { value: '3', label: '3' },
        ]}
        hint="自動は、幅に収まる最大の列の数にします。数を選ぶと、その数が上限になります。"
      />
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
