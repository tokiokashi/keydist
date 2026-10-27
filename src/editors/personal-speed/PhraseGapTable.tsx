import type { PhraseGapComparison } from '#interpretation/timing/sentence-measurement.ts';
import { InfoButton } from '#ui/primitives/info-button.tsx';
import {
  PHRASE_GAP_COLUMNS,
  PHRASE_GAP_HEADING,
  PHRASE_GAP_INFO,
  PHRASE_GAP_ROWS,
  PHRASE_GAP_TOO_FEW_TEXT,
  phraseGapKindCountsText,
  sentenceTableValueText,
} from './calibration-text.ts';

/**
 * 文章を打つ測定の、文節の区切りの直後のストロークとそれ以外のストロークの比較。
 * どちらかの群の打数が下限に届かない時は、差と値を示さず、数えた打数だけを示す。保存値には入れない。
 */
export function PhraseGapTable({ comparison }: { readonly comparison: PhraseGapComparison }) {
  const { after, others, difference } = comparison;
  const reached = difference !== undefined;
  return (
    <div className="personal-speed-phrase-gap" data-personal-speed-phrase-gap={reached ? 'compared' : 'counts-only'}>
      <h3>
        {PHRASE_GAP_HEADING}
        <InfoButton name={PHRASE_GAP_HEADING} description={PHRASE_GAP_INFO} />
      </h3>
      <div className="personal-speed-grid-wrap">
        <table className="personal-speed-grid personal-speed-detail-table">
          <thead>
            <tr>
              <th scope="col">{PHRASE_GAP_COLUMNS.group}</th>
              <th scope="col">{PHRASE_GAP_COLUMNS.count}</th>
              {reached ? (
                <>
                  <th scope="col">{PHRASE_GAP_COLUMNS.quartileMean}</th>
                  <th scope="col">{PHRASE_GAP_COLUMNS.mean}</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            <tr data-personal-speed-phrase-gap-row="after">
              <th scope="row">{PHRASE_GAP_ROWS.after}</th>
              <td>{after.count}打</td>
              {reached ? (
                <>
                  <td>{sentenceTableValueText(after.quartileMeanMs)}</td>
                  <td>{sentenceTableValueText(after.meanMs)}</td>
                </>
              ) : null}
            </tr>
            <tr data-personal-speed-phrase-gap-row="others">
              <th scope="row">{PHRASE_GAP_ROWS.others}</th>
              <td>{others.count}打</td>
              {reached ? (
                <>
                  <td>{sentenceTableValueText(others.quartileMeanMs)}</td>
                  <td>{sentenceTableValueText(others.meanMs)}</td>
                </>
              ) : null}
            </tr>
            {reached ? (
              <tr data-personal-speed-phrase-gap-row="difference">
                <th scope="row">{PHRASE_GAP_ROWS.difference}</th>
                <td />
                <td>{sentenceTableValueText(difference.quartileMeanMs)}</td>
                <td>{sentenceTableValueText(difference.meanMs)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="personal-speed-note" data-personal-speed-phrase-gap-kinds>
        {phraseGapKindCountsText(comparison.afterKindCounts)}
      </p>
      {reached ? null : <p className="personal-speed-note">{PHRASE_GAP_TOO_FEW_TEXT}</p>}
    </div>
  );
}
