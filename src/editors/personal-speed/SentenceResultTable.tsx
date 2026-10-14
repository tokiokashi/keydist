import { OVERHEAD_KINDS } from '#interpretation/timing/calibration.ts';
import type { SentenceResultTable as SentenceResultTableData } from '#interpretation/timing/sentence-measurement.ts';
import {
  OVERHEAD_TABLE_COLUMNS,
  OVERHEAD_TABLE_ROWS,
  SENTENCE_TABLE_CAPTION,
  SENTENCE_TABLE_COLUMNS,
  SENTENCE_TABLE_DETAILS_SUMMARY,
  SENTENCE_TABLE_NOTES,
  sentenceTableKindLabel,
  sentenceTableSavedDetail,
  sentenceTableSavedText,
  sentenceTableValueText,
} from './calibration-text.ts';

/**
 * 文章を打つ測定を終えた時の表。行が差の種類、列が全体・かなの中・かなの境目で、
 * 各マスに打鍵の上乗せ・数えた打鍵の数・保存したかを出す。
 * 基準の時間と打った間隔の四分位平均は、マスに収めず、注記と一緒に畳んだ欄に出す。
 */
export function SentenceResultTable({ table }: { readonly table: SentenceResultTableData }) {
  const byKind = new Map(table.kinds.map((entry) => [entry.kind, entry]));
  const unsaved = (['below-minimum', 'out-of-range'] as const).filter((status) => table.kinds.some((entry) => entry.status === status));
  return (
    <div className="personal-speed-result" data-personal-speed-sentence-result>
      <div className="personal-speed-grid-wrap">
        <table className="personal-speed-grid personal-speed-result-table">
          <caption>{SENTENCE_TABLE_CAPTION}</caption>
          <thead>
            <tr>
              <th scope="col"><span className="personal-speed-visually-hidden">種類</span></th>
              {OVERHEAD_TABLE_COLUMNS.map(({ part, label }) => <th key={part} scope="col">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {OVERHEAD_TABLE_ROWS.map(({ label, kinds }) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {OVERHEAD_TABLE_COLUMNS.map(({ part }) => {
                  const kind = kinds[part];
                  const entry = kind === undefined ? undefined : byKind.get(kind);
                  if (kind === undefined || entry === undefined) {
                    return <td key={part} className="personal-speed-cell personal-speed-cell-blank" aria-hidden="true" />;
                  }
                  return (
                    <td key={part} className="personal-speed-cell personal-speed-result-cell" data-personal-speed-result-cell={kind} data-saved={entry.status}>
                      <span className="personal-speed-result-value">{sentenceTableValueText(entry.stats.differenceMs)}</span>
                      <span>{entry.stats.count}打</span>
                      <span>{sentenceTableSavedText(entry.status)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unsaved.map((status) => <p key={status} className="personal-speed-note">{sentenceTableSavedDetail(status)}</p>)}
      <details className="personal-speed-details" data-personal-speed-result-details>
        <summary>{SENTENCE_TABLE_DETAILS_SUMMARY}</summary>
        <div className="personal-speed-grid-wrap">
          <table className="personal-speed-grid personal-speed-detail-table">
            <thead>
              <tr>
                <th scope="col">{SENTENCE_TABLE_COLUMNS.kind}</th>
                <th scope="col">{SENTENCE_TABLE_COLUMNS.base}</th>
                <th scope="col">{SENTENCE_TABLE_COLUMNS.interval}</th>
              </tr>
            </thead>
            <tbody>
              {OVERHEAD_KINDS.map((kind) => {
                const stats = byKind.get(kind)?.stats;
                return (
                  <tr key={kind} data-personal-speed-result-row={kind}>
                    <th scope="row">{sentenceTableKindLabel(kind)}</th>
                    <td>{sentenceTableValueText(stats?.baseMs)}</td>
                    <td>{sentenceTableValueText(stats?.intervalMs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {SENTENCE_TABLE_NOTES.map((note) => <p key={note} className="personal-speed-note">{note}</p>)}
      </details>
    </div>
  );
}
