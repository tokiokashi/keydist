import { N_SENSITIVITY_RANGE, nSensitivityDefinition, type NSensitivityExtracted, type NSensitivitySeries, type NSensitivitySeriesFailed } from './extract.ts';
import type { NSensitivityOptions } from './options.ts';
import './n-sensitivity-view.css';

/**
 * N感度の可視化（#544 Phase 3「N感度」）。
 *
 * `extracted`（`extract.ts`の計算結果）をそのまま描くだけで、`Metrics`の再計算はしない
 * （docs/architecture.md「可視化は計算しない」）。**優劣を示す色・強調・並び替えによる
 * 順位表示・傾きスコアはしない**（AGENTS.md「優劣の判定・順位付け・合成スコアを作らない」。
 * 旧実装（`src/legacy/analyzer-metrics-content.tsx`）のコメントが「傾きが小さい配列ほど
 * 指を残したまま打てる配列」と書いていた評価的な言い回しはここでは引き継がない）。
 * 系列の色はSetup自身の色（`setupColor`）をそのまま使い、値の大小で強調しない。
 */

const CHART_WIDTH = 640;
const CHART_HEIGHT = 320;
const MARGIN = { top: 16, right: 16, bottom: 32, left: 48 };

export interface NSensitivityRowContext {
  readonly setupId: string;
  readonly label: string;
  readonly layoutName: string;
  readonly geometryName: string;
  readonly fingerAssignmentName: string;
  readonly color: string;
  /**
   * 既定値と違う条件の短い併記（#544 Phase 3レビュー「集合対象ページは各行に効いている
   * 条件を併記する」。`windowSize`はこのページ自身が掃引する軸なので含まない）。
   * 空なら省略。
   */
  readonly conditionSummary?: string;
}

export interface NSensitivityVisualizationProps {
  extracted: NSensitivityExtracted;
  /** 表示順（Setup id列）。ページ自身が持つ集合の並び順（#544 §6）。 */
  order: readonly string[];
  rowContext: ReadonlyMap<string, NSensitivityRowContext>;
  options: NSensitivityOptions;
  onOptionsChange(next: NSensitivityOptions): void;
}

function seriesFor(series: readonly NSensitivitySeries[], setupId: string): NSensitivitySeries | undefined {
  return series.find((item) => item.setupId === setupId);
}

function failureLabel(kind: NSensitivitySeriesFailed['failureKind']): string {
  switch (kind) {
    case 'reference': return '配列・形状が見つからない（削除された可能性）';
    case 'incompatible-text': return 'このテキストには使えない';
    case 'geometry': return '形状を組み立てられない';
    case 'setup-missing': return 'Setupが削除された';
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
  readonly setupId: string;
  readonly label: string;
  readonly color: string;
  readonly points: readonly { readonly windowSize: number; readonly y: number; readonly totalUnits: number }[];
}

/** 折れ線チャート本体（#544指示書「非legacyの折れ線が無ければ自前でSVGを書く」）。 */
function NSensitivityChart({
  series,
  scale,
}: {
  series: readonly PlottedSeries[];
  scale: NSensitivityOptions['scale'];
}) {
  const innerWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const xMin = N_SENSITIVITY_RANGE[0];
  const xMax = N_SENSITIVITY_RANGE[N_SENSITIVITY_RANGE.length - 1]!;
  const xScale = (n: number) => MARGIN.left + ((n - xMin) / (xMax - xMin)) * innerWidth;

  // relativeは旧実装と同じくyMax=100固定（N=0を100%とした相対値なので、実測が100を
  // 超えることは通常無い。absoluteは系列の実測最大値に合わせて自動スケールする）。
  const yMax = scale === 'relative'
    ? 100
    : Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.y)));
  const yScale = (y: number) => MARGIN.top + innerHeight - (y / yMax) * innerHeight;

  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => (yMax / yTicks) * i);

  return (
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
      {N_SENSITIVITY_RANGE.map((n) => (
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
        x={MARGIN.left + innerWidth / 2}
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
          <g key={s.setupId} data-n-sensitivity-series={s.setupId}>
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
  );
}

export function NSensitivityVisualization({
  extracted,
  order,
  rowContext,
  options,
  onOptionsChange,
}: NSensitivityVisualizationProps) {
  const okRows = order
    .map((setupId) => ({ setupId, entry: seriesFor(extracted.series, setupId), context: rowContext.get(setupId) }))
    .filter((row): row is { setupId: string; entry: NSensitivitySeries; context: NSensitivityRowContext | undefined } => row.entry !== undefined);

  const plotted: PlottedSeries[] = okRows
    .filter((row) => row.entry.kind === 'ok')
    .map((row) => {
      const okEntry = row.entry as Extract<NSensitivitySeries, { kind: 'ok' }>;
      const base = okEntry.points[0]?.totalUnits ?? 0;
      return {
        setupId: row.setupId,
        label: row.context?.label ?? row.setupId,
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
      <div className="n-sensitivity-heading">
        <div>
          <p className="eyebrow">N sensitivity</p>
          <h2>N感度</h2>
        </div>
        <p>
          先読みN入力（0〜10）を振った時の総移動距離の変化。数値は観測値であり、
          配列の優劣を判定するスコアではない。
        </p>
      </div>

      <fieldset className="n-sensitivity-controls" aria-label="N感度の表示設定">
        <legend>縦軸</legend>
        <label className="n-sensitivity-control">
          <input
            type="radio"
            name="n-sensitivity-scale"
            value="relative"
            checked={options.scale === 'relative'}
            onChange={() => onOptionsChange({ ...options, scale: 'relative' })}
          />
          相対（N=0を100%）
        </label>
        <label className="n-sensitivity-control">
          <input
            type="radio"
            name="n-sensitivity-scale"
            value="absolute"
            checked={options.scale === 'absolute'}
            onChange={() => onOptionsChange({ ...options, scale: 'absolute' })}
          />
          実測値 [u]
        </label>
      </fieldset>

      {plotted.length === 0 ? (
        <p className="note">Setupを1つ以上選ぶ</p>
      ) : (
        <NSensitivityChart series={plotted} scale={options.scale} />
      )}

      <ul className="n-sensitivity-legend" aria-label="凡例">
        {okRows.map(({ setupId, entry, context }) => {
          if (entry.kind === 'failed') {
            return (
              <li key={setupId} data-n-sensitivity-row="failed">
                <span>{context?.label ?? setupId}</span>
                <span role="alert">削除された、またはこの条件では解決できない: {entry.message || failureLabel(entry.failureKind)}</span>
              </li>
            );
          }
          return (
            <li key={setupId} data-n-sensitivity-row="ok">
              <span className="n-sensitivity-swatch" style={{ backgroundColor: context?.color ?? '#666' }} aria-hidden="true" />
              <span>{context?.label ?? setupId}</span>
              <span className="n-sensitivity-condition">
                {context
                  ? `${context.layoutName} / ${context.geometryName} / 指の割当: ${context.fingerAssignmentName}`
                  : '—'}
              </span>
              {context?.conditionSummary ? (
                <span className="n-sensitivity-condition-diff">{context.conditionSummary}</span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="n-sensitivity-table-scroll">
        <table className="n-sensitivity-table">
          <caption>各Setup・各Nの実測値。相対表示中も実測値[u]をここで確認できる。</caption>
          <thead>
            <tr>
              <th scope="col">Setup</th>
              {N_SENSITIVITY_RANGE.map((n) => <th scope="col" key={n}>N={n}</th>)}
            </tr>
          </thead>
          <tbody>
            {plotted.map((s) => (
              <tr key={s.setupId}>
                <th scope="row">{s.label}</th>
                {s.points.map((p) => (
                  <td key={p.windowSize}>{p.totalUnits.toFixed(1)} u</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** engineの契約（純粋）と可視化componentの結び付け。単体ページがこれを載せる。 */
export const nSensitivityAnalyzer = {
  definition: nSensitivityDefinition,
  View: NSensitivityVisualization,
};
