import { SHARED_METRIC_TEXT } from '../metric-labels.ts';
import { segmentationSourceSentence } from '../segmentation-text.ts';
import type { AnalyzerSettingsProps, SetAnalyzerPaneParts, SetBodyProps } from '../pane-parts.tsx';
import { countText, distanceText, EMPTY_CELL_TEXT, percentText, VISIBLE_TEXT_NOTE, visibleText } from './display.ts';
import { bunsetsuStatsDefinition, type BunsetsuStatsExtracted, type BunsetsuStatsOkRow, type BunsetsuStatsRow } from './extract.ts';
import { bunsetsuStatsOptions, DEFAULT_BUNSETSU_STATS_OPTIONS, type BunsetsuStatsOptions } from './options.ts';
import { BUNSETSU_STATS_PANE_META } from './pane-meta.ts';
import './bunsetsu-stats-view.css';

/**
 * 文節の中と境目の統計の可視化。
 *
 * 抽出の結果（`extract.ts`）を表に並べるだけで、計算し直さない。表の値は書式（`display.ts`）で文字にする。
 * 配列の並べ替え・順位・合成スコアは出さない。上位の一覧の行は出現回数で並び、配列の値では並び替えない。
 */

/** 1対象ぶんの、行の名前。条件は名前が重なった時だけ名前に足し、基本はペインの条件の要約が出す。 */
export interface BunsetsuStatsRowContext {
  readonly targetKey: string;
  readonly label: string;
  /** 集合によらない完全な名前。hover（`title`属性）に出す。 */
  readonly fullName: string;
}

export type BunsetsuStatsBodyProps = SetBodyProps<BunsetsuStatsExtracted, BunsetsuStatsOptions, BunsetsuStatsRowContext>;

const DISTANCE = SHARED_METRIC_TEXT.perCharUnits;
const SEGMENT_DISTANCE_UNIT = 'u';

interface DisplayRow {
  readonly targetKey: string;
  readonly label: string;
  readonly fullName: string;
  readonly row: BunsetsuStatsRow | undefined;
}

function displayRows(extracted: BunsetsuStatsExtracted, order: readonly string[], rowContext: BunsetsuStatsBodyProps['rowContext']): DisplayRow[] {
  const byKey = new Map(extracted.rows.map((row) => [row.targetKey, row]));
  return order.map((targetKey) => ({
    targetKey,
    label: rowContext.get(targetKey)?.label ?? '—',
    fullName: rowContext.get(targetKey)?.fullName ?? '',
    row: byKey.get(targetKey),
  }));
}

function RowName({ row }: { readonly row: DisplayRow }) {
  return (
    <th scope="row" title={row.fullName}>
      {row.label}
    </th>
  );
}

function TextTable({ text }: { readonly text: NonNullable<BunsetsuStatsExtracted['text']> }) {
  const { table } = text;
  return (
    <div className="bunsetsu-stats-scroll">
      <table className="bunsetsu-stats-table bunsetsu-stats-text-table" data-bunsetsu-stats-text-table="">
        <caption>テキストの表（配列によらない量）</caption>
        <tbody>
          <tr>
            <th scope="row">評価に渡したテキストの文字数</th>
            <td>{countText(table.charCount)}</td>
          </tr>
          <tr>
            <th scope="row">文節の数</th>
            <td data-bunsetsu-stats-segment-count="">{countText(table.segmentCount)}</td>
          </tr>
          <tr>
            <th scope="row">文節の1文字目の割合</th>
            <td data-bunsetsu-stats-boundary-share="">{percentText(table.boundaryCharShare)}</td>
          </tr>
          <tr>
            <th scope="row">またぐ並びのうち、文節の中にも出る並びの割合</th>
            <td data-bunsetsu-stats-cross-inside-share="">
              {percentText(table.crossAlsoInsideShare)}
              {table.crossCount === 0 ? '' : `（${table.crossAlsoInsideCount} / ${table.crossCount}）`}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * 配列ごとの表の列（`statsCells` の並び）の、まとまりの左右の境。見出しと本文の両方に同じ添字で付ける。
 * まとまりは2列ずつ（打てない文字・1文字目・2文字目以降・1文節の距離・文節ごとの距離）。
 */
const GROUP_START = new Set([0, 3, 5, 7, 9]);
const GROUP_END = new Set([1, 4, 6, 8, 10]);

function edgeClass(index: number): string | undefined {
  const classes = [GROUP_START.has(index) ? 'bunsetsu-stats-edge-start' : '', GROUP_END.has(index) ? 'bunsetsu-stats-edge-end' : ''].filter(Boolean);
  return classes.length === 0 ? undefined : classes.join(' ');
}

function statsCells(row: BunsetsuStatsOkRow): readonly (readonly [key: string, text: string])[] {
  const { stats } = row;
  return [
    ['skipped', countText(stats.skippedChars)],
    ['skippedAfterBoundary', countText(stats.skippedAfterBoundary)],
    ['boundaryShare', percentText(stats.boundaryDistanceShare)],
    ['boundaryPerChar', distanceText(stats.boundary.perChar)],
    ['boundaryDeviation', distanceText(stats.boundary.deviation)],
    ['interiorPerChar', distanceText(stats.interior.perChar)],
    ['interiorDeviation', distanceText(stats.interior.deviation)],
    ['segmentDeviation', distanceText(stats.segmentDistance.deviation)],
    ['segmentP90', distanceText(stats.segmentDistance.p90)],
    ['segmentPerCharMedian', distanceText(stats.segmentPerChar.median)],
    ['segmentPerCharP90', distanceText(stats.segmentPerChar.p90)],
  ];
}

const STATS_COLUMN_COUNT = 11;

function LayoutTable({ rows }: { readonly rows: readonly DisplayRow[] }) {
  return (
    <div className="bunsetsu-stats-scroll">
      <table className="bunsetsu-stats-table" data-bunsetsu-stats-layout-table="">
        <caption>配列ごとの表</caption>
        <thead>
          <tr>
            <th rowSpan={2} scope="col">
              対象
            </th>
            <th colSpan={2} scope="colgroup" className="bunsetsu-stats-edge-start bunsetsu-stats-edge-end">
              打てない文字
            </th>
            <th rowSpan={2} scope="col">
              1文字目の距離の割合
            </th>
            <th colSpan={2} scope="colgroup" className="bunsetsu-stats-edge-start bunsetsu-stats-edge-end">
              1文字目
            </th>
            <th colSpan={2} scope="colgroup" className="bunsetsu-stats-edge-start bunsetsu-stats-edge-end">
              2文字目以降
            </th>
            <th colSpan={2} scope="colgroup" className="bunsetsu-stats-edge-start bunsetsu-stats-edge-end">
              1文節の距離 [{SEGMENT_DISTANCE_UNIT}]
            </th>
            <th colSpan={2} scope="colgroup" className="bunsetsu-stats-edge-start bunsetsu-stats-edge-end">
              文節ごとの{DISTANCE.label} [{DISTANCE.unit}]
            </th>
          </tr>
          <tr>
            <th scope="col" className={edgeClass(0)}>
              数
            </th>
            <th scope="col" className={edgeClass(1)}>
              うち1文字目
            </th>
            <th scope="col" className={edgeClass(3)}>
              {DISTANCE.label} [{DISTANCE.unit}]
            </th>
            <th scope="col" className={edgeClass(4)}>
              標準偏差 [{SEGMENT_DISTANCE_UNIT}]
            </th>
            <th scope="col" className={edgeClass(5)}>
              {DISTANCE.label} [{DISTANCE.unit}]
            </th>
            <th scope="col" className={edgeClass(6)}>
              標準偏差 [{SEGMENT_DISTANCE_UNIT}]
            </th>
            <th scope="col" className={edgeClass(7)}>
              標準偏差
            </th>
            <th scope="col" className={edgeClass(8)}>
              90%点
            </th>
            <th scope="col" className={edgeClass(9)}>
              中央値
            </th>
            <th scope="col" className={edgeClass(10)}>
              90%点
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const entry = row.row;
            if (entry === undefined) {
              // extractedにまだ無いtargetKey（依頼の作り直し途中の一瞬）。値の欠落を偽らず、行の中で計算中と出す。
              return (
                <tr key={row.targetKey} data-bunsetsu-stats-row="pending">
                  <RowName row={row} />
                  <td colSpan={STATS_COLUMN_COUNT} aria-busy="true">
                    計算中…
                  </td>
                </tr>
              );
            }
            if (entry.kind === 'failed') {
              return (
                <tr key={row.targetKey} data-bunsetsu-stats-row="failed">
                  <RowName row={row} />
                  <td colSpan={STATS_COLUMN_COUNT} role="alert">
                    {entry.message}
                  </td>
                </tr>
              );
            }
            if (entry.kind === 'no-segmentation') {
              return (
                <tr key={row.targetKey} data-bunsetsu-stats-row="no-segmentation">
                  <RowName row={row} />
                  <td colSpan={STATS_COLUMN_COUNT}>文節の区切りがないので、値を出しません。</td>
                </tr>
              );
            }
            return (
              <tr key={row.targetKey} data-bunsetsu-stats-row="ok">
                <RowName row={row} />
                {statsCells(entry).map(([key, cell], index) => (
                  <td key={key} className={edgeClass(index)} data-empty={cell === EMPTY_CELL_TEXT || undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 値を出せる行（解決できて、区切りが渡された行）を取り出す。 */
function okRowOf(row: DisplayRow): BunsetsuStatsOkRow | undefined {
  return row.row?.kind === 'ok' ? row.row : undefined;
}

function FrequentSegmentsTable({ text, rows }: { readonly text: NonNullable<BunsetsuStatsExtracted['text']>; readonly rows: readonly DisplayRow[] }) {
  return (
    <div className="bunsetsu-stats-scroll">
      <table className="bunsetsu-stats-table" data-bunsetsu-stats-frequent-segments="">
        <caption>頻出の文節（上位{text.frequentSegments.length}）</caption>
        <thead>
          <tr>
            <th scope="col">文節</th>
            <th scope="col">出現回数</th>
            {rows.map((row) => (
              <th key={row.targetKey} scope="col" title={row.fullName}>
                {row.label}
                <span className="bunsetsu-stats-unit">
                  {DISTANCE.label} [{DISTANCE.unit}]
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {text.frequentSegments.map((segment, index) => (
            <tr key={segment.text}>
              <th scope="row">{visibleText(segment.text)}</th>
              <td>{countText(segment.count)}</td>
              {rows.map((row) => {
                const ok = okRowOf(row);
                const cell = ok === undefined ? EMPTY_CELL_TEXT : distanceText(ok.frequentSegmentCells[index]);
                return (
                  <td key={row.targetKey} data-empty={cell === EMPTY_CELL_TEXT || undefined}>
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FrequentBigramsTable({ text, rows }: { readonly text: NonNullable<BunsetsuStatsExtracted['text']>; readonly rows: readonly DisplayRow[] }) {
  return (
    <div className="bunsetsu-stats-scroll">
      <table className="bunsetsu-stats-table" data-bunsetsu-stats-frequent-bigrams="">
        <caption>頻出の文節をまたぐ並び（上位{text.frequentBigrams.length}）</caption>
        <thead>
          <tr>
            <th rowSpan={2} scope="col">
              並び
            </th>
            <th rowSpan={2} scope="col">
              またいだ回数
            </th>
            <th rowSpan={2} scope="col">
              文節の中の回数
            </th>
            {rows.map((row) => (
              <th key={row.targetKey} colSpan={2} scope="colgroup" className="bunsetsu-stats-edge-start bunsetsu-stats-edge-end" title={row.fullName}>
                {row.label}
              </th>
            ))}
          </tr>
          <tr>
            {rows.flatMap((row) => [
              <th key={`${row.targetKey}:cross`} scope="col" className="bunsetsu-stats-edge-start">
                <span>
                  またぐ
                  <span className="bunsetsu-stats-unit">[{DISTANCE.unit}]</span>
                </span>
              </th>,
              <th key={`${row.targetKey}:inside`} scope="col" className="bunsetsu-stats-edge-end">
                <span>
                  文節の中
                  <span className="bunsetsu-stats-unit">[{DISTANCE.unit}]</span>
                </span>
              </th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {text.frequentBigrams.map((bigram, index) => (
            <tr key={bigram.pair}>
              <th scope="row">{visibleText(bigram.pair)}</th>
              <td>{countText(bigram.crossCount)}</td>
              <td>{countText(bigram.insideCount)}</td>
              {rows.flatMap((row) => {
                const cell = okRowOf(row)?.frequentBigramCells[index];
                const cross = cell === undefined ? EMPTY_CELL_TEXT : distanceText(cell.cross);
                const inside = cell === undefined ? EMPTY_CELL_TEXT : distanceText(cell.inside);
                return [
                  <td key={`${row.targetKey}:cross`} className="bunsetsu-stats-edge-start" data-empty={cross === EMPTY_CELL_TEXT || undefined}>
                    {cross}
                  </td>,
                  <td key={`${row.targetKey}:inside`} className="bunsetsu-stats-edge-end" data-empty={inside === EMPTY_CELL_TEXT || undefined}>
                    {inside}
                  </td>,
                ];
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 文節の中と境目の統計の本体。対象が空の時はホストが選ぶボタンを出し、本体は呼ばれない。
 * 日本語以外のテキストと、分割器を読み込めなかった時は、値を出さずその旨を示す。
 */
export function BunsetsuStatsBody({ extracted, order, rowContext, segmentation }: BunsetsuStatsBodyProps) {
  const rows = displayRows(extracted, order, rowContext);
  const text = extracted.text;
  const unavailable = segmentation === 'unsupported' || segmentation === 'failed';
  const differentText = text === undefined ? [] : rows.filter((row) => okRowOf(row)?.sameText === false);
  const referenceLabel = text === undefined ? undefined : rows.find((row) => row.targetKey === text.referenceTargetKey)?.label;

  return (
    <section className="bunsetsu-stats-feature" data-react-feature="bunsetsu-stats">
      {segmentation === 'unsupported' ? (
        <p className="bunsetsu-stats-notice" data-bunsetsu-stats-unavailable="unsupported">
          文節の区切りは日本語のテキストでだけ使えるので、値を出しません。
        </p>
      ) : null}
      {segmentation === 'failed' ? (
        <p className="bunsetsu-stats-notice" data-bunsetsu-stats-unavailable="failed">
          文節の分割器を読み込めなかったので、値を出しません。
        </p>
      ) : null}

      {unavailable || text === undefined ? null : (
        <>
          <p className="bunsetsu-stats-notice" data-bunsetsu-stats-source="">
            {segmentationSourceSentence(text.source.splitter, text.source.origin)}
          </p>
          <TextTable text={text} />
          <LayoutTable rows={rows} />
          <FrequentSegmentsTable text={text} rows={rows} />
          <FrequentBigramsTable text={text} rows={rows} />
          {differentText.length > 0 ? (
            <p className="bunsetsu-stats-notice" data-bunsetsu-stats-different-text="">
              {differentText.map((row) => row.label).join('、')}は評価に渡すテキストが{referenceLabel ?? '他の対象'}と違います。テキストの表と一覧の行は
              {referenceLabel ?? '他の対象'}のテキストから求めています。
            </p>
          ) : null}
          <p className="bunsetsu-stats-notice" data-bunsetsu-stats-visible-note="">
            {VISIBLE_TEXT_NOTE}
          </p>
        </>
      )}

      {unavailable || text !== undefined ? null : (
        <p className="bunsetsu-stats-notice" data-bunsetsu-stats-empty="">
          値を出せる対象がありません。
        </p>
      )}

      {text === undefined ? <FailedList rows={rows} /> : null}
    </section>
  );
}

/** 値を出さない時も、対象の解決に失敗した行は理由を出す。 */
function FailedList({ rows }: { readonly rows: readonly DisplayRow[] }) {
  const failed = rows.filter((row) => row.row?.kind === 'failed');
  if (failed.length === 0) return null;
  return (
    <ul className="bunsetsu-stats-failures">
      {failed.map((row) => (
        <li key={row.targetKey} data-bunsetsu-stats-row="failed">
          <span title={row.fullName}>{row.label}</span>
          <span role="alert">{row.row?.kind === 'failed' ? row.row.message : ''}</span>
        </li>
      ))}
    </ul>
  );
}

/** ここで設定できる項目は無い。 */
export function BunsetsuStatsSettings(_props: AnalyzerSettingsProps<BunsetsuStatsOptions>) {
  return <p className="bunsetsu-stats-empty">ここで設定できる項目はありません。</p>;
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const bunsetsuStatsAnalyzer = {
  definition: bunsetsuStatsDefinition,
  ...BUNSETSU_STATS_PANE_META,
  Body: BunsetsuStatsBody,
  Settings: BunsetsuStatsSettings,
  defaultOptions: DEFAULT_BUNSETSU_STATS_OPTIONS,
  urlOptions: bunsetsuStatsOptions,
  rowContext: ({ targetKey, label, fullName }) => ({ targetKey, label, fullName }),
  // 文節の区切りを常に使う。ホストが文節の分割器を読み込んで、区切りを入力へ載せる
  usesSegmentation: () => true,
} satisfies SetAnalyzerPaneParts<BunsetsuStatsOptions, BunsetsuStatsExtracted, BunsetsuStatsRowContext>;
