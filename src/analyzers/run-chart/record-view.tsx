import { useId } from 'react';
import { SeriesMark } from '#ui/charts/series-mark.tsx';
import type { TargetMark } from '#ui/theme/target-marks.ts';
import type { RecordGapGroup, RecordMismatchItem } from '#interpretation/record/keystroke-gaps.ts';
import { chartX, CHART_DOT_LIMIT, CHART_HEIGHT, CHART_MARGIN, CHART_PLOT_HEIGHT, CHART_PLOT_RIGHT, CHART_WIDTH } from '../chart-frame.ts';
import { FigureTable } from '../figure-table-view.tsx';
import type { KeystrokeRecordChoice, KeystrokeRecordTexts, SegmentationStatus } from '../pane-parts.tsx';
import { SegmentationSourceButton } from '../segmentation-source-button.tsx';
import { BOUNDARY_FULL_LINE_LIMIT } from './chart-model.ts';
import { positionLabel } from './table-model.ts';
import type { RunChartRecord, RunChartRecordOrigin } from './extract.ts';
import {
  formatGapMs,
  mismatchLabel,
  recordCoversSpan,
  recordGapModel,
  recordGapTableModel,
  recordRangeLabel,
  recordedAtLabel,
  type RecordGapFrame,
} from './record-chart-model.ts';

/**
 * 打鍵の記録の間隔（`spec/keystroke-record.md` §6）を、Run Chartの指標の図と同じ横軸の下に並べる部品。
 * 抽出が出した値を並べるだけで、間隔も表も計算し直さない。記録の優劣・順位・指標との相関は出さない。
 */

type ReadyRecord = Extract<RunChartRecord, { readonly kind: 'ready' }>;

export interface RunChartRecordSectionProps {
  /** 抽出の結果。記録を選んでいなければ無い。 */
  readonly record: RunChartRecord | undefined;
  /** ペインで選べる記録。ホストが渡さない時は、記録を扱わない。 */
  readonly choices: readonly KeystrokeRecordChoice[] | undefined;
  /** 解析設定が選んでいる記録の`id`（空は選んでいない）。 */
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
  /** 選んだ記録を取った時の物理配列・指の割り当て・条件の名前。 */
  readonly texts: KeystrokeRecordTexts | undefined;
  /** 指標の図と同じ横軸。 */
  readonly frame: RecordGapFrame;
  /** 図に出している範囲。 */
  readonly span: { readonly start: number; readonly end: number };
  /** 指標の図に重ねている区切りの位置。 */
  readonly boundaries: readonly number[];
  /** 記録の対象の系列の色と点の形。 */
  readonly color: string;
  readonly mark: TargetMark;
  /** 記録の対象の表示名（表の見出しと表題に使う）。 */
  readonly label: string;
  readonly asTable: boolean;
  /** 文節の区切りの用意の状態。 */
  readonly segmentation: SegmentationStatus | undefined;
}

function RecordPicker({
  choices,
  selectedId,
  unlistedLabel,
  onSelect,
}: {
  readonly choices: readonly KeystrokeRecordChoice[];
  readonly selectedId: string;
  /** 選んだ記録が一覧に無い時の、選択肢の文。 */
  readonly unlistedLabel: string;
  readonly onSelect: (id: string) => void;
}) {
  const id = useId();
  const listed = selectedId === '' || choices.some((choice) => choice.id === selectedId);
  return (
    <div className="run-chart-record-picker">
      <label htmlFor={id}>打鍵の記録</label>
      <select id={id} value={selectedId} onChange={(event) => onSelect(event.target.value)} data-run-chart-record-select="">
        <option value="">選ばない</option>
        {listed ? null : <option value={selectedId}>{unlistedLabel}</option>}
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {recordedAtLabel(choice.recordedAt)}　{choice.targetLabel}　{recordRangeLabel(choice.rangeStart, choice.rangeEnd)}
          </option>
        ))}
      </select>
    </div>
  );
}

function RecordOrigin({ origin, texts }: { readonly origin: RunChartRecordOrigin; readonly texts: KeystrokeRecordTexts | undefined }) {
  const rows: readonly (readonly [string, string])[] = [
    ['対象', origin.targetName],
    ['テキスト', `${origin.textName}（${origin.textChars.toLocaleString('ja-JP')}字）`],
    ['範囲', `${recordRangeLabel(origin.range.start, origin.range.end)}（${origin.typedStrokes.toLocaleString('ja-JP')}打）`],
    ['記録した日時', recordedAtLabel(origin.recordedAt)],
    ['アプリの版', `${origin.appVersion}（モデルの版 ${origin.modelVersion}）`],
    ...(texts?.rows.map((row): readonly [string, string] => [row.label, row.value]) ?? []),
  ];
  return (
    <dl className="run-chart-record-origin" data-run-chart-record-origin="">
      {rows.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 食い違う項目の文。条件は、値が違う項目の名前を括って並べる。 */
function mismatchText(items: readonly RecordMismatchItem[], conditionKeys: readonly string[], texts: KeystrokeRecordTexts | undefined): string {
  return items
    .map((item) => {
      if (item !== 'conditions' || conditionKeys.length === 0) return mismatchLabel(item);
      const names = conditionKeys.map((key) => texts?.conditionLabel(key) ?? key);
      return `${mismatchLabel(item)}（${names.join('、')}）`;
    })
    .join('、');
}

function GapFigure({
  record,
  frame,
  boundaries,
  color,
  mark,
}: {
  readonly record: ReadyRecord;
  readonly frame: RecordGapFrame;
  readonly boundaries: readonly number[];
  readonly color: string;
  readonly mark: TargetMark;
}) {
  const model = recordGapModel(record, frame);
  const shownBoundaries = boundaries.filter((boundary) => boundary >= frame.start && boundary <= frame.start + frame.total);
  const base = CHART_MARGIN.top + CHART_PLOT_HEIGHT;
  const dots = model.stems.length <= CHART_DOT_LIMIT;
  return (
    <div className="run-chart-figure" data-run-chart-record-figure="">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="打鍵の間隔の推移。横軸はテキスト上の位置">
        <text className="run-chart-axis-title" x={CHART_MARGIN.left} y={CHART_MARGIN.top - 12}>
          打鍵の間隔 [ms]
        </text>
        {model.yTicks.map((tick) => (
          <g key={tick.value}>
            <line className="run-chart-grid" x1={CHART_MARGIN.left} y1={tick.position} x2={CHART_PLOT_RIGHT} y2={tick.position} />
            <text className="run-chart-tick" x={CHART_MARGIN.left - 8} y={tick.position + 4} textAnchor="end">
              {formatGapMs(tick.value)}
            </text>
          </g>
        ))}
        {[0, Math.round(frame.total / 2), frame.total].map((at, index, all) =>
          all.indexOf(at) === index ? (
            <text key={at} className="run-chart-tick" x={chartX(at, frame.total)} y={CHART_HEIGHT - 8} textAnchor="middle">
              {frame.start + at}
            </text>
          ) : null,
        )}
        <path className="run-chart-record-missing" d={model.missingPath} data-run-chart-record-gaps={model.missingXs.length} fill="none" />
        <path
          className="run-chart-record-stem"
          d={model.stemPath}
          fill="none"
          style={{ stroke: color }}
          data-run-chart-record-stems={model.stems.length}
        />
        {dots
          ? model.stems.map((stem) => (
              <SeriesMark key={stem.position} className="run-chart-point" mark={mark} color={color} x={stem.x} y={stem.y}>
                <title>{`${positionLabel(stem.position)}、${formatGapMs(stem.ms)}ミリ秒`}</title>
              </SeriesMark>
            ))
          : null}
        {shownBoundaries.length === 0 ? null : (
          <g className="run-chart-boundaries" data-run-chart-record-boundaries={shownBoundaries.length}>
            {shownBoundaries.map((boundary) => {
              const x = chartX(boundary - frame.start, frame.total);
              const full = shownBoundaries.length <= BOUNDARY_FULL_LINE_LIMIT;
              return <line key={boundary} className="run-chart-boundary" x1={x} x2={x} y1={full ? CHART_MARGIN.top : base - 6} y2={base} />;
            })}
          </g>
        )}
      </svg>
    </div>
  );
}

function groupCells(group: RecordGapGroup): readonly string[] {
  return [
    String(group.count),
    group.quartileMeanMs === undefined ? '—' : formatGapMs(group.quartileMeanMs),
    group.meanMs === undefined ? '—' : formatGapMs(group.meanMs),
  ];
}

function PhraseGapTable({ record, segmentation }: { readonly record: ReadyRecord; readonly segmentation: SegmentationStatus | undefined }) {
  if (record.table === undefined || record.tableSource === undefined) {
    return (
      <p className="run-chart-notice" data-run-chart-record-table-unavailable="">
        {segmentation === 'unsupported'
          ? '文節の区切りは日本語のテキストでだけ使えるので、文節の区切りの直後の表を出しません。'
          : segmentation === 'failed'
            ? '文節の分割器を読み込めなかったので、文節の区切りの直後の表を出しません。'
            : '文節の区切りを用意しています。'}
      </p>
    );
  }
  const rows: readonly (readonly [string, RecordGapGroup])[] = [
    ['区切りの直後', record.table.after],
    ['それ以外', record.table.others],
  ];
  return (
    <div className="run-chart-segment-block" data-run-chart-record-table="">
      <p className="run-chart-segment-condition">
        文節の区切りの直後とそれ以外の、打鍵の間隔 [ms]
        <SegmentationSourceButton splitter={record.tableSource.splitter} origin={record.tableSource.origin} />
      </p>
      <div className="run-chart-segment-scroll">
        <table className="run-chart-segment-table">
          <thead>
            <tr>
              <th scope="col">打ち始め</th>
              <th scope="col">打数</th>
              <th scope="col">四分位平均</th>
              <th scope="col">平均</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, group]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {groupCells(group).map((cell, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 列の順が同一性
                  <td key={index}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 指標の図の下に出す、打鍵の記録の選択・出どころ・間隔の図・表。 */
export function RunChartRecordSection({
  record,
  choices,
  selectedId,
  onSelect,
  texts,
  frame,
  span,
  boundaries,
  color,
  mark,
  label,
  asTable,
  segmentation,
}: RunChartRecordSectionProps) {
  if (choices === undefined || (choices.length === 0 && selectedId === '')) return null;
  return (
    <section className="run-chart-record" data-run-chart-record="" aria-label="打鍵の記録">
      <RecordPicker
        choices={choices}
        selectedId={selectedId}
        unlistedLabel={
          record?.kind === 'missing' ? '選んだ記録（手元にありません）' : record === undefined ? '選んだ記録' : '選んだ記録（今の条件と食い違います）'
        }
        onSelect={onSelect}
      />
      {record === undefined ? null : record.kind === 'missing' ? (
        <p className="run-chart-notice" role="status" data-run-chart-record-missing-note="">
          選んだ打鍵の記録が手元にありません。
        </p>
      ) : (
        <>
          <RecordOrigin origin={record.origin} texts={texts} />
          {record.kind === 'mismatch' ? (
            <p className="run-chart-notice" role="status" data-run-chart-record-mismatch="">
              打鍵の記録が今の条件と食い違うので、間隔を出しません。食い違う項目は、{mismatchText(record.items, record.conditionKeys, texts)}です。
            </p>
          ) : recordCoversSpan(record, span) ? (
            <>
              {asTable ? (
                <FigureTable model={recordGapTableModel(record, span, label)} />
              ) : (
                <GapFigure record={record} frame={frame} boundaries={boundaries} color={color} mark={mark} />
              )}
              <PhraseGapTable record={record} segmentation={segmentation} />
            </>
          ) : (
            <>
              <p className="run-chart-notice" role="status" data-run-chart-record-out-of-range="">
                この範囲には打鍵の記録がありません。記録の範囲は{recordRangeLabel(record.origin.range.start, record.origin.range.end)}です。
              </p>
              <PhraseGapTable record={record} segmentation={segmentation} />
            </>
          )}
        </>
      )}
    </section>
  );
}
