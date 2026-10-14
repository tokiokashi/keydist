import { SENTENCE_MIN_SAMPLES, type SentenceResultTable as SentenceResultTableData } from '#interpretation/timing/sentence-measurement.ts';
import {
  SENTENCE_TABLE_COLUMNS,
  SENTENCE_TABLE_NOT_SAVED_TEXT,
  SENTENCE_TABLE_NOTES,
  sentenceTableKindLabel,
  sentenceTableSavedText,
  sentenceTableSplitLabel,
  sentenceTableValueText,
} from './calibration-text.ts';

/** 文章を打つ測定を終えた時の、差の種類ごとの値の表。 */
export function SentenceResultTable({ table }: { readonly table: SentenceResultTableData }) {
  return (
    <div className="personal-speed-result" data-personal-speed-sentence-result>
      <table className="personal-speed-result-table">
        <thead>
          <tr>
            <th scope="col">{SENTENCE_TABLE_COLUMNS.kind}</th>
            <th scope="col">{SENTENCE_TABLE_COLUMNS.count}</th>
            <th scope="col">{SENTENCE_TABLE_COLUMNS.base}</th>
            <th scope="col">{SENTENCE_TABLE_COLUMNS.interval}</th>
            <th scope="col">{SENTENCE_TABLE_COLUMNS.difference}</th>
            <th scope="col">{SENTENCE_TABLE_COLUMNS.saved}</th>
          </tr>
        </thead>
        <tbody>
          {table.kinds.map(({ kind, stats, status }) => (
            <tr key={kind} data-personal-speed-result-row={kind}>
              <th scope="row">{sentenceTableKindLabel(kind)}</th>
              <td>{stats.count}</td>
              <td>{sentenceTableValueText(stats.baseMs)}</td>
              <td>{sentenceTableValueText(stats.intervalMs)}</td>
              <td>{sentenceTableValueText(stats.differenceMs)}</td>
              <td>{sentenceTableSavedText(status)}</td>
            </tr>
          ))}
          {table.split.map(({ row, stats }) => (
            <tr key={row} data-personal-speed-result-row={`split:${row}`}>
              <th scope="row">{sentenceTableSplitLabel(row)}</th>
              <td>{stats.count}</td>
              <td>{sentenceTableValueText(stats.baseMs)}</td>
              <td>{sentenceTableValueText(stats.intervalMs)}</td>
              <td>{sentenceTableValueText(stats.differenceMs)}</td>
              <td>{stats.count < SENTENCE_MIN_SAMPLES ? `${SENTENCE_TABLE_NOT_SAVED_TEXT}（値が揺れやすい）` : SENTENCE_TABLE_NOT_SAVED_TEXT}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {SENTENCE_TABLE_NOTES.map((note) => <p key={note} className="personal-speed-note">{note}</p>)}
    </div>
  );
}
