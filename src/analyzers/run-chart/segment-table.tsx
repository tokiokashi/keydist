import type { ReactElement } from 'react';
import { SEGMENT_SEED_COUNT, type RankAmongRandom, type SegmentMetricStats, type SegmentStats } from '#interpretation/segments.ts';
import { SPAN_METRIC_IDS, type SpanMetricId } from '#interpretation/span-metrics.ts';
import { segmentationSourceSentence } from '../segmentation-text.ts';
import type { RunChartSegments } from './extract.ts';
import { displayValue, RUN_CHART_METRICS } from './metric-catalog.ts';

/**
 * 区切り方ごとの区間の指標と、区切りの前後の指標の表（定義は `docs/segment-metrics.md`）。
 * 抽出が出した値を並べるだけで、計算し直さない。配列の優劣・順位・合成スコアは出さない。
 * 順位を付けるのは、文節の区切りとランダムの区切りの比べだけ（1文字あたりの距離の2つの量）。
 */

export interface SegmentTableRow {
  readonly targetKey: string;
  readonly label: string;
  readonly fullName: string;
  readonly segments: RunChartSegments;
}

function cell(metric: SpanMetricId, value: number | undefined): string {
  if (value === undefined) return '—';
  const def = RUN_CHART_METRICS[metric];
  return displayValue(metric, value).toFixed(def.digits);
}

function range(metric: SpanMetricId, values: readonly (number | undefined)[]): string {
  const defined = values.filter((value): value is number => value !== undefined);
  if (defined.length === 0) return '—';
  const low = Math.min(...defined);
  const high = Math.max(...defined);
  return low === high ? cell(metric, low) : `${cell(metric, low)}〜${cell(metric, high)}`;
}

const COLUMNS = [
  { key: 'median', label: '区間の中央値' },
  { key: 'p90', label: '区間の90%点' },
  { key: 'max', label: '区間の最大' },
  { key: 'before', label: '区切りの直前の1文字' },
  { key: 'after', label: '区切りの直後の1文字' },
] as const satisfies readonly { key: keyof SegmentMetricStats; label: string }[];

function statsRow(metric: SpanMetricId, name: string, stats: SegmentStats): ReactElement {
  const m = stats.byMetric[metric];
  return (
    <tr key={name}>
      <th scope="row">{name}</th>
      <td>{stats.segmentCount}</td>
      {COLUMNS.map((column) => (
        <td key={column.key}>{cell(metric, m[column.key])}</td>
      ))}
    </tr>
  );
}

function randomRow(metric: SpanMetricId, random: readonly SegmentStats[]): ReactElement {
  return (
    <tr key="random">
      <th scope="row">ランダム（{random.length}個の最小〜最大）</th>
      <td>{random[0]?.segmentCount ?? '—'}</td>
      {COLUMNS.map((column) => (
        <td key={column.key}>
          {range(
            metric,
            random.map((stats) => stats.byMetric[metric][column.key]),
          )}
        </td>
      ))}
    </tr>
  );
}

function rankText(rank: RankAmongRandom): string {
  const place = rank.low === rank.high ? `${rank.low}番目` : `${rank.low}〜${rank.high}番目`;
  const end = rank.extreme === 'lowest' ? '（最も小さい端）' : rank.extreme === 'highest' ? '（最も大きい端）' : '';
  return `${rank.of}個のうち小さい方から${place}${end}`;
}

function rankSentence(rank: RankAmongRandom | undefined): string {
  return rank === undefined ? '順位を付けられません。' : `${rankText(rank)}です。`;
}

function SegmentTableFor({ row }: { readonly row: SegmentTableRow }) {
  const { segments } = row;
  const report = segments.report;
  return (
    <div className="run-chart-segment-block" data-run-chart-segment-block={row.targetKey}>
      <h4 className="run-chart-segment-title" title={row.fullName || row.label}>
        {row.label}
      </h4>
      {report === undefined ? (
        <p className="run-chart-notice" data-run-chart-segment-empty="">
          文節の区切りが1つもなく、区間を作れません。
        </p>
      ) : (
        <>
          <p className="run-chart-segment-condition" data-run-chart-segment-condition="">
            {segmentationSourceSentence(segments.splitter, segments.origin)}固定長の長さは{report.fixedLength}文字です。
          </p>
          <div className="run-chart-segment-scroll">
            <table className="run-chart-segment-table" data-run-chart-segment-table="">
              <thead>
                <tr>
                  <th scope="col">指標と区切り方</th>
                  <th scope="col">区間の数</th>
                  {COLUMNS.map((column) => (
                    <th key={column.key} scope="col">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              {SPAN_METRIC_IDS.map((metric) => (
                <tbody key={metric}>
                  <tr className="run-chart-segment-metric">
                    <th colSpan={2 + COLUMNS.length} scope="colgroup">
                      {RUN_CHART_METRICS[metric].label} [{RUN_CHART_METRICS[metric].unit}]
                    </th>
                  </tr>
                  {statsRow(metric, '文節', report.bunsetsu)}
                  {statsRow(metric, '固定長', report.fixed)}
                  {randomRow(metric, report.random)}
                </tbody>
              ))}
            </table>
          </div>
          <details className="run-chart-segment-seeds">
            <summary>ランダムの種ごとの値（1文字あたりの距離）</summary>
            <table className="run-chart-segment-table" data-run-chart-segment-seeds="">
              <thead>
                <tr>
                  <th scope="col">種</th>
                  <th scope="col">区間の90%点</th>
                  <th scope="col">区切りの直後の1文字</th>
                </tr>
              </thead>
              <tbody>
                {report.seeds.map((seed, index) => (
                  <tr key={seed}>
                    <th scope="row">{seed}</th>
                    <td>{cell('perCharUnits', report.random[index]?.byMetric.perCharUnits.p90)}</td>
                    <td>{cell('perCharUnits', report.random[index]?.byMetric.perCharUnits.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <ul className="run-chart-segment-rank" data-run-chart-segment-rank="">
            <li>
              1文字あたりの距離の区間の90%点: 文節の値は、ランダムの{SEGMENT_SEED_COUNT}個と合わせた
              {rankSentence(report.rank.p90)}
            </li>
            <li>
              1文字あたりの距離の区切りの直後の1文字: 文節の値は、同じく
              {rankSentence(report.rank.after)}
            </li>
          </ul>
        </>
      )}
    </div>
  );
}

/** 区切りを選んだ時に図の下へ出す、区切り方ごとの表。配列ごとにブロックを分ける。 */
export function SegmentTables({ rows }: { readonly rows: readonly SegmentTableRow[] }) {
  if (rows.length === 0) return null;
  // 乱数生成器と種の範囲は対象によらず同じなので、表を出した対象のうち最初のものから1回だけ出す
  const seeded = rows.find((row) => row.segments.report !== undefined)?.segments;
  return (
    <section className="run-chart-segments" data-run-chart-segments="" aria-label="区切り方ごとの指標">
      <h3 className="run-chart-segments-title">区切り方ごとの指標</h3>
      {seeded === undefined ? null : (
        <p className="run-chart-segment-condition" data-run-chart-segment-seed-range="">
          ランダムの乱数生成器は{seeded.rng}で、種は{seeded.seedStart}〜{seeded.seedStart + seeded.seedCount - 1}の{seeded.seedCount}個です。
        </p>
      )}
      {rows.map((row) => (
        <SegmentTableFor key={row.targetKey} row={row} />
      ))}
    </section>
  );
}
