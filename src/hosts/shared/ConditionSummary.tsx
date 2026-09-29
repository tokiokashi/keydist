import {
  conditionDiagnosticText,
  conditionSummaryLine,
  isChangedConditionRow,
  orderConditionRowsForDetail,
  type ConditionHeaderInfo,
  type ConditionSummaryRow,
  type ConditionTargetDiff,
} from './condition-summary.ts';

/**
 * 条件の要約（docs/architecture.md「画面の構成 > 条件の要約」）。
 *
 * 閉じた状態は1行で、変えた項目の先頭2件（項目の定義順）と「他N件」。何も変えていなければ
 * 「すべて既定値」。開くと先頭に対象の実体（配列 / 物理配列 · 指の割当）、その下に変えた項目を上にして各行に出どころを添える。
 * 狭いペインで項目名と値を縦に積むのはCSS（ペインのcontainer query）が行う。
 *
 * ペインの枠から切り離しておくのは、個別画面とWorkspaceのどちらのペインにも同じ部品を置くため（#629）。
 * 複数の対象を持つペインは、共通の条件を`rows`に、対象ごとの差を`targetDiffs`に渡す。
 */
export interface ConditionSummaryProps {
  /** Traceに効く条件の一覧。項目の定義順（`traceConditionSummary`の順）で渡す。 */
  readonly rows: readonly ConditionSummaryRow[];
  /**
   * 開いた先頭に出す、対象の実体（配列・物理配列・指の割当）の名前。解決前（読み込み中）は省略する。
   * 対象のフル名（既定と違う条件つき）は出さない。条件の差分は直下の行が出どころつきで出すため。
   */
  readonly header?: ConditionHeaderInfo;
  /**
   * 複数の対象を持つペインで、共通の条件（`rows`）と違う対象とその項目。全対象が同じなら空か省略。
   * 単一の対象のペインは渡さない。
   */
  readonly targetDiffs?: readonly ConditionTargetDiff[];
}

export function ConditionSummary({ rows, header, targetDiffs = [] }: ConditionSummaryProps) {
  if (rows.length === 0) return null;
  const line = conditionSummaryLine(rows);
  const ordered = orderConditionRowsForDetail(rows);

  return (
    <details className="pane-condition-summary" data-changed-count={line.changedCount}>
      <summary>
        <svg className="pane-condition-caret" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M5 3l6 5-6 5z" />
        </svg>
        <span className="pane-condition-key">条件</span>
        {line.changedCount === 0 ? (
          <span className="pane-condition-default">すべて既定値</span>
        ) : (
          <>
            <span className="pane-condition-items">
              {line.shown.map((row) => `${row.label}: ${row.displayValue}`).join(' · ')}
            </span>
            {line.restCount > 0 ? <span className="pane-condition-more">他{line.restCount}件</span> : null}
          </>
        )}
        {targetDiffs.length > 0 ? <span className="pane-condition-diff-flag">対象ごとに差あり</span> : null}
      </summary>
      <div className="pane-condition-body">
        {header !== undefined ? (
          <p className="pane-condition-target">
            {header.layoutName} / {header.shapeName} · 指の割当: {header.fingerAssignmentName}
          </p>
        ) : null}
        <dl>
          {ordered.map((row) => {
            const changed = isChangedConditionRow(row);
            const texts = row.diagnostics
              .map((diagnostic) => conditionDiagnosticText(row, diagnostic))
              .filter((text): text is string => text !== undefined);
            return (
              <div
                key={row.id}
                className="pane-condition-row"
                data-changed={changed ? 'true' : undefined}
                data-not-applicable={row.applicable ? undefined : 'true'}
              >
                <dt>{row.label}</dt>
                <dd>
                  <span className="pane-condition-value">{row.displayValue}</span>
                  {' '}
                  <span className="pane-condition-origin">（{row.originLabel}）</span>
                  {!row.applicable ? <span className="pane-condition-flag">この配列・Setupでは効かない</span> : null}
                  {texts.length > 0 ? (
                    <ul className="pane-condition-diagnostics">
                      {texts.map((text, index) => <li key={index}>{text}</li>)}
                    </ul>
                  ) : null}
                </dd>
              </div>
            );
          })}
        </dl>
        {targetDiffs.length > 0 ? (
          <section className="pane-condition-diffs" aria-label="対象ごとの差">
            <h4>対象ごとの差</h4>
            <dl>
              {targetDiffs.map((diff) => (
                <div key={diff.key} className="pane-condition-diff">
                  <dt>{diff.label}</dt>
                  <dd>{diff.items.map((item) => `${item.label}=${item.displayValue}`).join('、')}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>
    </details>
  );
}
