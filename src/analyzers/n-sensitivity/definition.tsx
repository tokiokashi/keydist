import { useEffect, useRef, useState } from 'react';
import { N_SENSITIVITY_RANGE, nSensitivityDefinition, type NSensitivityExtracted, type NSensitivitySeries, type NSensitivitySeriesFailed } from './extract.ts';
import { DEFAULT_N_SENSITIVITY_OPTIONS, type NSensitivityOptions } from './options.ts';
import { bindOption, RadioOptionField } from '#ui/primitives/option-fields.tsx';
import { N_SENSITIVITY_PANE_META } from './pane-meta.ts';
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
/** Nの目盛りの間隔がこれを割ったら、目盛りを1つ飛ばしにする（10pxの文字の「10」が並べる幅）。 */
const MIN_TICK_SPACING = 30;
const MARGIN = { top: 16, right: 16, bottom: 32, left: 48 };

export interface NSensitivityRowContext {
  readonly targetKey: string;
  readonly label: string;
  /** 集合によらない完全な名前（レビュー指摘3）。hover（`title`属性）に出す。 */
  readonly fullName: string;
  readonly layoutName: string;
  readonly geometryName: string;
  readonly fingerAssignmentName: string;
  readonly color: string;
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

interface PlottedSeries {
  readonly targetKey: string;
  readonly label: string;
  readonly fullName: string;
  readonly color: string;
  readonly points: readonly { readonly windowSize: number; readonly y: number; readonly totalUnits: number }[];
}

/**
 * 要素の幅を測る。測れるのはハイドレーション後なので、それまでは`null`（既定の幅で描く）。
 * 観測はアンマウントで必ず解除する。
 */
function useMeasuredWidth(): [React.RefObject<HTMLDivElement | null>, number | null] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const next = Math.floor(el.clientWidth);
      if (next > 0) setWidth(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** 折れ線チャート本体（#544指示書「非legacyの折れ線が無ければ自前でSVGを書く」）。 */
function NSensitivityChart({
  series,
  scale,
}: {
  series: readonly PlottedSeries[];
  scale: NSensitivityOptions['scale'];
}) {
  // 置かれた領域の幅をそのままviewBoxの幅にする（表示と等倍になり、文字が縮まない）。
  // 高さは2:1を基本に、狭い領域でも線の間隔が潰れない下限と、広い領域で伸びすぎない上限で止める。
  const [wrapRef, measured] = useMeasuredWidth();
  const CHART_WIDTH = measured ?? DEFAULT_CHART_WIDTH;
  const CHART_HEIGHT = Math.min(MAX_CHART_HEIGHT, Math.max(MIN_CHART_HEIGHT, Math.round(CHART_WIDTH / 2)));
  const plotWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const tickStep = plotWidth / (N_SENSITIVITY_RANGE.length - 1) < MIN_TICK_SPACING ? 2 : 1;
  const xMin = N_SENSITIVITY_RANGE[0];
  const xMax = N_SENSITIVITY_RANGE[N_SENSITIVITY_RANGE.length - 1]!;
  const xScale = (n: number) => MARGIN.left + ((n - xMin) / (xMax - xMin)) * plotWidth;

  // relativeは旧実装と同じくyMax=100固定（N=0を100%とした相対値なので、実測が100を
  // 超えることは通常無い。absoluteは系列の実測最大値に合わせて自動スケールする）。
  const yMax = scale === 'relative'
    ? 100
    : Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.y)));
  const yScale = (y: number) => MARGIN.top + plotHeight - (y / yMax) * plotHeight;

  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => (yMax / yTicks) * i);

  return (
    <div className="n-sensitivity-chart" ref={wrapRef}>
    <svg
      className="n-sensitivity-svg"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label="N感度チャート"
    >
      {yTickValues.map((value) => (
        <g key={value}>
          <line
            className="n-sensitivity-grid-line"
            x1={MARGIN.left}
            x2={CHART_WIDTH - MARGIN.right}
            y1={yScale(value)}
            y2={yScale(value)}
          />
          <text className="n-sensitivity-axis-label" x={MARGIN.left - 6} y={yScale(value)} textAnchor="end" dominantBaseline="middle">
            {formatY(scale, value)}
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
            <path className="n-sensitivity-line" d={path} stroke={s.color} fill="none" />
            {s.points.map((p) => (
              <circle
                key={p.windowSize}
                className="n-sensitivity-point"
                cx={xScale(p.windowSize)}
                cy={yScale(p.y)}
                r={2.5}
                fill={s.color}
              >
                <title>{`${s.label} N=${p.windowSize}: ${formatY(scale, p.y)}（実測 ${p.totalUnits.toFixed(1)} u）`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
    </div>
  );
}

/**
 * N感度の本体（チャート・凡例・実測値の表）。メンバー単位の失敗は凡例の行に出す。
 * 対象が空の時はホストが選ぶボタンを出し、本体は呼ばれない。全メンバーが失敗した時は凡例の失敗行だけが残る。
 */
export function NSensitivityBody({
  extracted,
  order,
  rowContext,
  options,
}: NSensitivityBodyProps) {
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
        points: okEntry.points.map((point) => ({
          windowSize: point.windowSize,
          y: yValueOf(options.scale, base, point.totalUnits),
          totalUnits: point.totalUnits,
        })),
      };
    });

  return (
    <section className="n-sensitivity-feature" data-react-feature="n-sensitivity">
      {plotted.length > 0 ? <NSensitivityChart series={plotted} scale={options.scale} /> : null}

      <ul className="n-sensitivity-legend" aria-label="凡例">
        {okRows.map(({ targetKey, entry, context }) => {
          if (entry.kind === 'failed') {
            return (
              <li key={targetKey} data-n-sensitivity-row="failed">
                <span title={context?.fullName}>{context?.label ?? '—'}</span>
                <span role="alert">{entry.message || failureLabel(entry.failureKind)}</span>
              </li>
            );
          }
          return (
            <li key={targetKey} data-n-sensitivity-row="ok">
              <span className="n-sensitivity-swatch" style={{ backgroundColor: context?.color ?? '#666' }} aria-hidden="true" />
              <span title={context?.fullName}>{context?.label ?? '—'}</span>
              <span className="n-sensitivity-condition">
                {context
                  ? `${context.layoutName} / ${context.geometryName} / 指の割当: ${context.fingerAssignmentName}`
                  : '—'}
              </span>
            </li>
          );
        })}
      </ul>

      {plotted.length > 0 ? (
      <div className="n-sensitivity-table-scroll">
        <table className="n-sensitivity-table">
          <caption>各対象・各Nの実測値。相対表示中も実測値[u]をここで確認できる。</caption>
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
      ) : null}
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
