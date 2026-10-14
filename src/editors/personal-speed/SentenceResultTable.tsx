import type { SentenceResultTable as SentenceResultTableData } from '#interpretation/timing/sentence-measurement.ts';
import {
  SENTENCE_TABLE_COLUMNS,
  SENTENCE_TABLE_NOTES,
  sentenceTableKindLabel,
  sentenceTableSavedText,
  sentenceTableValueText,
} from './calibration-text.ts';

/** 文章を打つ測定を終えた時の、保存する行ごとの値の表。 */
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
        </tbody>
      </table>
      {SENTENCE_TABLE_NOTES.map((note) => <p key={note} className="personal-speed-note">{note}</p>)}
    </div>
  );
}
