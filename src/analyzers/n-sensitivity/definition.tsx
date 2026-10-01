import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { N_SENSITIVITY_RANGE, nSensitivityDefinition, type NSensitivityExtracted, type NSensitivitySeries, type NSensitivitySeriesFailed } from './extract.ts';
import { DEFAULT_N_SENSITIVITY_OPTIONS, type NSensitivityOptions } from './options.ts';
import { bindOption, RadioOptionField } from '#ui/primitives/option-fields.tsx';
import { N_SENSITIVITY_PANE_META } from './pane-meta.ts';
import { computeYRange, formatYTicks } from './y-range.ts';
import {
  estimateTextWidth,
  fitLabels,
  legendItemOffset,
  placeLegend,
  LEGEND_FONT_SIZE,
  LEGEND_PADDING,
  LEGEND_SWATCH_GAP,
  LEGEND_SWATCH_WIDTH,
  type MeasureText,
} from './legend-placement.ts';
import { isStrokeOnlyMark, targetMarkPath, TARGET_DASH_ARRAY, targetMark, type TargetMark } from '#ui/theme/target-marks.ts';
import type { AnalyzerPaneParts, AnalyzerSettingsProps } from '../pane-parts.tsx';
import './n-sensitivity-view.css';

/**
 * N感度の可視化（#544 Phase 3「N感度」）。
 *
 * `extracted`（`extract.ts`の計算結果）をそのまま描くだけで、`Metrics`の再計算はしない
 * （docs/architecture.md「可視化は計算しない」）。**優劣を示す色・強調・並び替えによる
 * 順位表示・傾きスコアはしない**（AGENTS.md「優劣の判定・順位付け・合成スコアを作らない」。
 * 旧実装（`src/legacy/analyzer-metrics-content.tsx`）のコメントが「傾きが小さい配列ほど
 * 指を残したまま打てる配列」と書いていた評価的な言い回しはここでは引き継がない）。
 * 系列の色はhostが集合の中で配った色（`rowContext`の`color`）をそのまま使い、値の大小で強調しない。
 */

/** プリレンダーと、幅を測る前の最初の描画に使う幅。 */
const DEFAULT_CHART_WIDTH = 640;
const MIN_CHART_HEIGHT = 200;
const MAX_CHART_HEIGHT = 360;
/**
 * Workspaceのペインでペインの高さに合わせる時の、図の高さ（凡例を図の下に置く分を除く）の下限。
 * ペインの領域が低くても、線の間隔と軸の文字が読める高さは残す（CSS側の下限と揃える）。
 */
const MIN_FIT_CHART_HEIGHT = 170;
/**
 * ペインの高さに合わせる時の、図の縦横比（高さ÷幅）の上限。縦に長いペインで図が細長くなりすぎないよう、
 * 高さは幅を超えない（1:1まで）。余った高さは図の下（表の見出しの下）の余白になる。
 */
const MAX_FIT_ASPECT = 1;
/**
 * ホストが本体の領域に高さを持たせている時（Workspaceのペイン）にCSSが立てる印（n-sensitivity-view.css）。
 * 高さに合わせるかどうかは、container queryの結果を要素の計算済みスタイルから読んで知る。
 */
const FIT_FLAG = '--n-sensitivity-fit';
/** 凡例をプロットの下に置く時の、図の左右の余白と、軸の見出しとの間隔。 */
const LEGEND_BELOW_SIDE = 8;
const LEGEND_BELOW_GAP = 6;
/** Nの目盛りの間隔がこれを割ったら、目盛りを1つ飛ばしにする（10pxの文字の「10」が並べる幅）。 */
const MIN_TICK_SPACING = 30;
const MARGIN = { top: 16, right: 16, bottom: 40, left: 48 };

export interface NSensitivityRowContext {
  readonly targetKey: string;
  readonly label: string;
  /** 集合によらない完全な名前（レビュー指摘3）。hover（`title`属性）に出す。 */
  readonly fullName: string;
  readonly layoutName: string;
  readonly geometryName: string;
  readonly fingerAssignmentName: string;
  readonly color: string;
  /** 色以外の手がかり（点の形と線種）。同じ対象は色と同じ番号から決まり、どのペインでも同じになる。 */
  readonly mark: TargetMark;
}

export interface NSensitivityBodyProps {
  readonly extracted: NSensitivityExtracted;
  /** 表示順（対象keyの列）。ホストが持つ集合の並び順（#544 §6）。 */
  readonly order: readonly string[];
  readonly rowContext: ReadonlyMap<string, NSensitivityRowContext>;
  readonly options: NSensitivityOptions;
}

function seriesFor(series: readonly NSensitivitySeries[], targetKey: string): NSensitivitySeries | undefined {
  return series.find((item) => item.targetKey === targetKey);
}

function failureLabel(kind: NSensitivitySeriesFailed['failureKind']): string {
  switch (kind) {
    case 'reference': return '配列・物理配列が見つからない（削除された可能性がある）';
    case 'incompatible-text': return 'このテキストには使えない';
    case 'geometry': return 'キーボードを組み立てられない';
    case 'target-missing': return '削除された、または見つからない';
  }
}

/** relative: N=0を100%とした相対値。absolute: 実測値[u]をそのまま使う。 */
function yValueOf(scale: NSensitivityOptions['scale'], base: number, totalUnits: number): number {
  if (scale === 'absolute') return totalUnits;
  return base === 0 ? 0 : (totalUnits / base) * 100;
}

function formatY(scale: NSensitivityOptions['scale'], value: number): string {
  return scale === 'relative' ? `${value.toFixed(0)}%` : `${value.toFixed(0)} u`;
}

/** 点の半径。形が変わっても外接がこの前後に収まる（`target-marks.ts`）。線との間隔は凡例の配置が見る。 */
const MARK_RADIUS = 3;

/** 系列の点・凡例の見本。形は対象ごとに違い、色を見分けられなくても区別できる。 */
function SeriesMark({ mark, color, x, y, className, children }: {
  readonly mark: TargetMark;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly className: string;
  readonly children?: React.ReactNode;
}) {
  const d = targetMarkPath(mark.shape, MARK_RADIUS);
  return (
    <path
      className={className}
      data-mark={mark.shape}
      transform={`translate(${x},${y})`}
      d={d}
      // 色は`var(--target-color-N)`が来るので、属性でなくstyleで渡す（属性ではvar()が解けない）
      style={isStrokeOnlyMark(mark.shape) ? { fill: 'none', stroke: color } : { fill: color }}
      strokeWidth={isStrokeOnlyMark(mark.shape) ? 1.8 : undefined}
    >
      {children}
    </path>
  );
}

interface PlottedSeries {
  readonly targetKey: string;
  readonly label: string;
  readonly fullName: string;
  readonly color: string;
  readonly mark: TargetMark;
  readonly points: readonly { readonly windowSize: number; readonly y: number; readonly totalUnits: number }[];
}

/**
 * 要素の幅を測る。測れるのはハイドレーション後なので、それまでは`null`（既定の幅で描く）。
 * 高さは、領域がペインの残りの高さに合わせている時（`FIT_FLAG`が立つ時）だけ測る。
 * 個別画面の領域の高さは図の高さで決まるので、測ると自分の高さを読み返してしまう。
 * 観測はアンマウントで必ず解除する。最初の測定は描画前（layout effect）に行い、既定の幅のまま
 * 一度描かれてから描き直されるのを避ける（表の開閉の判定が、この測定の後に続く）。
 */
function useMeasuredSize(): [React.RefObject<HTMLDivElement | null>, { width: number; fitHeight: number | null } | null] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; fitHeight: number | null } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const width = Math.floor(el.clientWidth);
      if (width <= 0) return;
      const fit = getComputedStyle(el).getPropertyValue(FIT_FLAG).trim() === '1';
      const height = Math.floor(el.clientHeight);
      const fitHeight = fit && height > 0 ? height : null;
      setSize((prev) => (prev !== null && prev.width === width && prev.fitHeight === fitHeight ? prev : { width, fitHeight }));
    };
    update();
    // 同期で反映する。裏のタブから表示された時、描き直しが描画の後に回ると、判定の前の状態（開いた表・既定幅の図）が一度描かれる。
    const observer = new ResizeObserver(() => flushSync(update));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

let measureContext: CanvasRenderingContext2D | null | undefined;

/**
 * 凡例の文字の幅を、実際に描くフォントで測る関数。フォントは要素の計算済みスタイルから読む。
 * 測れる（ブラウザで、描画後）までは見積もりを返す。フォントの読み込み完了で測り直す
 * （字幅が変わると凡例の枠の大きさが変わるため）。
 */
function useLegendMeasure(ref: React.RefObject<HTMLElement | null>): MeasureText {
  // 読み直すたびに新しいオブジェクトを入れる。文字列（フォント名）が前と同じでも再描画させ、
  // フォントの読み込み完了後の字幅で凡例の枠を測り直すため。
  const [source, setSource] = useState<{ font: string } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let cancelled = false;
    const read = () => {
      if (!cancelled) setSource({ font: `${LEGEND_FONT_SIZE}px ${getComputedStyle(el).fontFamily}` });
    };
    read();
    void document.fonts?.ready.then(read);
    return () => { cancelled = true; };
  }, [ref]);
  if (source === null) return estimateTextWidth;
  if (measureContext === undefined) measureContext = document.createElement('canvas').getContext('2d');
  const context = measureContext;
  if (!context) return estimateTextWidth;
  return (text) => {
    context.font = source.font;
    return context.measureText(text).width;
  };
}

/** 折れ線チャート本体（#544指示書「非legacyの折れ線が無ければ自前でSVGを書く」）。 */
function NSensitivityChart({
  series,
  scale,
  yRangeMode,
  onMeasured,
}: {
  series: readonly PlottedSeries[];
  scale: NSensitivityOptions['scale'];
  yRangeMode: NSensitivityOptions['yRange'];
  /** 領域が初めて大きさを持って測れた時に呼ぶ（表の開閉の判定を、図の高さの上限が決まった後に行うため）。 */
  onMeasured: (ready: boolean) => void;
}) {
  // 置かれた領域の幅をそのままviewBoxの幅にする（表示と等倍になり、文字が縮まない）。
  // 高さは2:1を基本に、狭い領域でも線の間隔が潰れない下限と、広い領域で伸びすぎない上限で止める。
  // Workspaceのペインでは、幅ではなくペインの残りの高さに合わせる（下限は置く）。
  const [wrapRef, measured] = useMeasuredSize();
  const isMeasured = measured !== null;
  useLayoutEffect(() => {
    if (!isMeasured) return undefined;
    onMeasured(true);
    // 図が外れる（表示できる対象が0件になる）時に戻す。残ると、作り直された表が上限の入る前に判定される。
    return () => onMeasured(false);
  }, [isMeasured, onMeasured]);
  const CHART_WIDTH = measured?.width ?? DEFAULT_CHART_WIDTH;
  const fitHeight = measured?.fitHeight ?? null;
  const baseHeight = Math.min(MAX_CHART_HEIGHT, Math.max(MIN_CHART_HEIGHT, Math.round(CHART_WIDTH / 2)));
  const plotWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
  const tickStep = plotWidth / (N_SENSITIVITY_RANGE.length - 1) < MIN_TICK_SPACING ? 2 : 1;
  const xMin = N_SENSITIVITY_RANGE[0];
  const xMax = N_SENSITIVITY_RANGE[N_SENSITIVITY_RANGE.length - 1]!;
  const xScale = (n: number) => MARGIN.left + ((n - xMin) / (xMax - xMin)) * plotWidth;

  // 縦軸の範囲は決め方を`y-range.ts`に閉じている（既定は0から）。相対は上限100%固定
  // （N=0が100%で、Nを増やしても距離は増えないため）。実測は系列の最大値に合わせる。
  const yRange = computeYRange(yRangeMode, scale === 'relative', series.flatMap((s) => s.points.map((p) => p.y)));
  const ySpan = yRange.hi - yRange.lo || 1;
  const yTickValues = yRange.ticks;

  // 凡例は図の中の空いた所に置く。線の実際の位置から空きを調べるので、線と重ならない。
  // 対象が多くて（または図が狭くて）どこにも収まらない時は、プロットの下に並べて図を高くする
  // （線を隠すより、図が高い方を選ぶ）。
  const measure = useLegendMeasure(wrapRef);
  const labelRoom = CHART_WIDTH - LEGEND_BELOW_SIDE * 2 - LEGEND_PADDING * 2 - LEGEND_SWATCH_WIDTH - LEGEND_SWATCH_GAP;
  const legendLabels = fitLabels(series.map((s) => s.label), measure, undefined, labelRoom);
  const layoutFor = (chartHeight: number) => {
    const plotHeight = chartHeight - MARGIN.top - MARGIN.bottom;
    const yScale = (y: number) => MARGIN.top + plotHeight - ((y - yRange.lo) / ySpan) * plotHeight;
    const legend = placeLegend(
      { x: MARGIN.left, y: MARGIN.top, width: plotWidth, height: plotHeight },
      series.map((s) => s.points.map((p) => ({ x: xScale(p.windowSize), y: yScale(p.y) }))),
      legendLabels,
      measure,
      { x: LEGEND_BELOW_SIDE, y: chartHeight + LEGEND_BELOW_GAP, width: CHART_WIDTH - LEGEND_BELOW_SIDE * 2 },
    );
    const svgHeight = legend.corner === 'below' ? legend.rect.y + legend.rect.height + LEGEND_BELOW_GAP : chartHeight;
    return { chartHeight, yScale, legend, svgHeight };
  };
  let layout = layoutFor(baseHeight);
  if (fitHeight !== null) {
    // 領域の高さを図と、図の下に並べる凡例で分け合う。凡例が下に出るなら、その分を引いて組み直す。
    layout = layoutFor(Math.max(MIN_FIT_CHART_HEIGHT, fitHeight));
    if (layout.legend.corner === 'below') {
      const below = layout.svgHeight - layout.chartHeight;
      layout = layoutFor(Math.max(MIN_FIT_CHART_HEIGHT, fitHeight - below));
    }
  }
  const { chartHeight: CHART_HEIGHT, yScale, legend } = layout;
  // 領域に合わせる時の描画の高さは領域の高さそのもの（等倍）。下限は領域の min-height が保つので、
  // 領域が描画より低くなることはない。
  const svgHeight = fitHeight === null ? layout.svgHeight : Math.max(fitHeight, layout.svgHeight);
  // 領域の高さは幅から決まる上限（縦横比の頭打ち）と、凡例が図の下に出る時の下限で挟む。どちらも測った高さに
  // 依らない値にする。測った高さから決めると、測るたびに領域の高さが変わって描き直しが止まらなくなる。
  let wrapStyle: React.CSSProperties | undefined;
  if (fitHeight !== null) {
    const floor = layoutFor(MIN_FIT_CHART_HEIGHT);
    wrapStyle = {
      maxHeight: Math.round(CHART_WIDTH * MAX_FIT_ASPECT),
      minHeight: floor.legend.corner === 'below' ? floor.svgHeight : undefined,
    };
  }
  const yTickLabels = formatYTicks(scale === 'relative', yTickValues);

  return (
    <div className="n-sensitivity-chart" ref={wrapRef} style={wrapStyle}>
    <svg
      className="n-sensitivity-svg"
      viewBox={`0 0 ${CHART_WIDTH} ${svgHeight}`}
      role="img"
      aria-label={`N感度チャート: ${series.map((s) => s.label).join('、')}`}
    >
      {yTickValues.map((value, i) => (
        <g key={value}>
          <line
            className="n-sensitivity-grid-line"
            x1={MARGIN.left}
            x2={CHART_WIDTH - MARGIN.right}
            y1={yScale(value)}
            y2={yScale(value)}
          />
          <text className="n-sensitivity-axis-label" x={MARGIN.left - 6} y={yScale(value)} textAnchor="end" dominantBaseline="middle">
            {yTickLabels[i]}
          </text>
        </g>
      ))}
      {N_SENSITIVITY_RANGE.filter((_, i) => i % tickStep === 0).map((n) => (
        <text
          key={n}
          className="n-sensitivity-axis-label"
          x={xScale(n)}
          y={CHART_HEIGHT - MARGIN.bottom + 16}
          textAnchor="middle"
        >
          {n}
        </text>
      ))}
      <text
        className="n-sensitivity-axis-title"
        x={MARGIN.left + plotWidth / 2}
        y={CHART_HEIGHT - 4}
        textAnchor="middle"
      >
        N（先読み入力数）
      </text>

      {series.map((s) => {
        const path = s.points
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.windowSize)},${yScale(p.y)}`)
          .join(' ');
        return (
          <g key={s.targetKey} data-n-sensitivity-series={s.targetKey}>
            <path
              className="n-sensitivity-line"
              d={path}
              style={{ stroke: s.color }}
              fill="none"
              strokeDasharray={s.mark.dashed ? TARGET_DASH_ARRAY : undefined}
            />
            {s.points.map((p) => (
              <SeriesMark
                key={p.windowSize}
                className="n-sensitivity-point"
                mark={s.mark}
                color={s.color}
                x={xScale(p.windowSize)}
                y={yScale(p.y)}
              >
                <title>{`${s.label} N=${p.windowSize}: ${formatY(scale, p.y)}（実測 ${p.totalUnits.toFixed(1)} u）`}</title>
              </SeriesMark>
            ))}
          </g>
        );
      })}

      <g
        className="n-sensitivity-legend"
        data-n-sensitivity-legend={legend.corner}
        transform={`translate(${legend.rect.x},${legend.rect.y})`}
      >
        <rect className="n-sensitivity-legend-frame" width={legend.rect.width} height={legend.rect.height} rx={3} />
        {series.map((s, i) => {
          const at = legendItemOffset(legend, i);
          return (
            <g key={s.targetKey} data-n-sensitivity-row="ok" transform={`translate(${at.x},${at.y})`}>
              <title>{s.fullName || s.label}</title>
              <line
                className="n-sensitivity-line"
                x1={0}
                x2={LEGEND_SWATCH_WIDTH}
                style={{ stroke: s.color }}
                strokeDasharray={s.mark.dashed ? TARGET_DASH_ARRAY : undefined}
              />
              <SeriesMark className="n-sensitivity-legend-mark" mark={s.mark} color={s.color} x={LEGEND_SWATCH_WIDTH / 2} y={0} />
              <text
                className="n-sensitivity-legend-label"
                x={LEGEND_SWATCH_WIDTH + 6}
                dominantBaseline="middle"
                fontSize={LEGEND_FONT_SIZE}
              >
                {legendLabels[i]}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
    </div>
  );
}

/**
 * 各Nの実測値の表。見出し（summary）で開閉できる。個別画面は開いて始める。Workspaceのペイン
 * （領域がペインの高さに合わせている時）は、図の下の余りに表が収まれば開いて始め、収まらなければ畳んで始める。
 * 図が主役で、表は数値が要る時に開けば足りるため。余りがあるのに畳むと、ペインの下が空白になる。
 * 開閉は標準の`<details>`なので、畳んでいてもキーボード（Tab・Enter・Space）と読み上げで届く。
 *
 * 開いて始めるかの判定は、図の大きさが決まった後に一度だけ行い、以後の開閉は利用者の操作に任せる
 * （リサイズで勝手に開閉しない）。裏のタブにある間は大きさが無いので、図が初めて測れた時まで待つ。
 *
 * 振動を避けるため、判定は開閉で変わらない値だけで行う。畳んだ状態で測った余り（ペインの下端 - 見出しの下端。
 * 図は上限（幅）で止まっているので、余りは図が使わない分になる）と、開いた時に表が増やす高さを比べる。
 * 開いた後の余りは見ない（開くと余りが減るので、見ると畳む側に倒れて行き来する）。
 */
function NSensitivityTable({ plotted, chartReady }: { plotted: readonly PlottedSeries[]; chartReady: boolean }) {
  const ref = useRef<HTMLDetailsElement | null>(null);
  const decided = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || decided.current || !chartReady || el.offsetWidth === 0) return;
    decided.current = true;
    const feature = el.parentElement;
    // 領域がペインの高さに合わせていなければ（個別画面・縦積み）、開いたまま
    if (!feature || getComputedStyle(el).getPropertyValue(FIT_FLAG).trim() !== '1') return;
    // 同期的に畳み→測り→開き→測る。描画は挟まらないので、途中の状態は画面に出ない。
    el.open = false;
    const closedBottom = el.getBoundingClientRect().bottom;
    const closedHeight = el.getBoundingClientRect().height;
    const spare = feature.getBoundingClientRect().bottom - closedBottom;
    el.open = true;
    const extra = el.getBoundingClientRect().height - closedHeight;
    if (extra > spare) el.open = false;
  }, [chartReady]);
  return (
    <details className="n-sensitivity-table-details" ref={ref} open>
      <summary>各Nの実測値 [u]</summary>
      <div className="n-sensitivity-table-scroll">
        <table className="n-sensitivity-table" aria-label="各Nの実測値 [u]">
          <thead>
            <tr>
              <th scope="col">対象</th>
              {N_SENSITIVITY_RANGE.map((n) => <th scope="col" key={n}>N={n}</th>)}
            </tr>
          </thead>
          <tbody>
            {plotted.map((s) => (
              <tr key={s.targetKey}>
                <th scope="row" title={s.fullName}>{s.label}</th>
                {s.points.map((p) => (
                  <td key={p.windowSize}>{p.totalUnits.toFixed(1)} u</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * N感度の本体（凡例を図の中に持つチャートと実測値の表）。メンバー単位の失敗は図の下に行で出す。
 * 対象が空の時はホストが選ぶボタンを出し、本体は呼ばれない。全メンバーが失敗した時は失敗の行だけが残る。
 */
export function NSensitivityBody({
  extracted,
  order,
  rowContext,
  options,
}: NSensitivityBodyProps) {
  const [chartReady, setChartReady] = useState(false);
  const markChartReady = useCallback((ready: boolean) => setChartReady(ready), []);
  const okRows = order
    .map((targetKey) => ({ targetKey, entry: seriesFor(extracted.series, targetKey), context: rowContext.get(targetKey) }))
    .filter((row): row is { targetKey: string; entry: NSensitivitySeries; context: NSensitivityRowContext | undefined } => row.entry !== undefined);

  const plotted: PlottedSeries[] = okRows
    .filter((row) => row.entry.kind === 'ok')
    .map((row) => {
      const okEntry = row.entry as Extract<NSensitivitySeries, { kind: 'ok' }>;
      const base = okEntry.points[0]?.totalUnits ?? 0;
      return {
        targetKey: row.targetKey,
        label: row.context?.label ?? '—',
        fullName: row.context?.fullName ?? '',
        color: row.context?.color ?? '#666',
        mark: row.context?.mark ?? targetMark(0),
        points: okEntry.points.map((point) => ({
          windowSize: point.windowSize,
          y: yValueOf(options.scale, base, point.totalUnits),
          totalUnits: point.totalUnits,
        })),
      };
    });

  const failedRows = okRows.filter(
    (row): row is typeof row & { entry: NSensitivitySeriesFailed } => row.entry.kind === 'failed',
  );

  return (
    <section className="n-sensitivity-feature" data-react-feature="n-sensitivity">
      {plotted.length > 0 ? <NSensitivityChart series={plotted} scale={options.scale} yRangeMode={options.yRange} onMeasured={markChartReady} /> : null}

      {failedRows.length > 0 ? (
        <ul className="n-sensitivity-failures">
          {failedRows.map(({ targetKey, entry, context }) => (
            <li key={targetKey} data-n-sensitivity-row="failed">
              <span title={context?.fullName}>{context?.label ?? '—'}</span>
              <span role="alert">{entry.message || failureLabel(entry.failureKind)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {plotted.length > 0 ? <NSensitivityTable plotted={plotted} chartReady={chartReady} /> : null}
    </section>
  );
}

/** N感度の解析設定（縦軸の見せ方）。 */
export function NSensitivitySettings({ options, onOptionsChange }: AnalyzerSettingsProps<NSensitivityOptions>) {
  return (
    <div className="option-groups">
      <RadioOptionField
        label="縦軸"
        binding={bindOption(options, DEFAULT_N_SENSITIVITY_OPTIONS, onOptionsChange, 'scale')}
        choices={[
          { value: 'relative', label: '相対（N=0を100%）' },
          { value: 'absolute', label: '実測値 [u]' },
        ]}
      />
      <RadioOptionField
        label="縦軸の範囲"
        binding={bindOption(options, DEFAULT_N_SENSITIVITY_OPTIONS, onOptionsChange, 'yRange')}
        choices={[
          { value: 'full', label: '0から' },
          { value: 'fit', label: '値の範囲' },
          { value: 'coarse', label: '粗い区切り' },
        ]}
      />
    </div>
  );
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const nSensitivityAnalyzer = {
  definition: nSensitivityDefinition,
  ...N_SENSITIVITY_PANE_META,
  Body: NSensitivityBody,
  Settings: NSensitivitySettings,
  defaultOptions: DEFAULT_N_SENSITIVITY_OPTIONS,
} satisfies AnalyzerPaneParts<typeof nSensitivityDefinition, NSensitivityOptions, NSensitivityBodyProps>;
