import { comparisonDefinition, type ComparisonExtracted, type ComparisonFailedRow, type ComparisonRow } from './extract.ts';
import { COMPARISON_COLUMN_IDS, COMPARISON_COLUMN_LABELS, type ComparisonColumnId, type ComparisonOptions } from './options.ts';
import './comparison-view.css';

/**
 * 比較表の可視化（#544 Phase 3「集合を対象にする最初のAnalyzer（比較表）」）。
 *
 * `extracted`（`extract.ts`の計算結果）をそのまま描くだけで、`Metrics`の再計算は
 * しない（docs/architecture.md「可視化は計算しない」）。基準（baseline）との比較比率
 * （%）はこのcomponentが行うが、これは表示用の軽い割り算であって新しい指標の算出では
 * ない（`options.ts`のコメントの通り、baselineの選択自体が`affects: 'view'`）。
 *
 * **優劣を示す色・強調・並び替えによる順位表示はしない**（AGENTS.md「優劣の判定・
 * 順位付け・合成スコアを作らない」）。行の並びは呼び出し側（ホスト）が渡す`order`の
 * 順のまま描き、列の値で自動ソートするUIも持たない。
 */

/** 1 Setupぶんの、行に併記する条件（配列・形状・指の割当・カスケードの出どころ）。 */
export interface ComparisonRowContext {
  readonly setupId: string;
  readonly label: string;
  readonly layoutName: string;
  readonly geometryName: string;
  readonly fingerAssignmentName: string;
  /** カスケードの出どころの短い要約（例: "Setup override" "global"）。空なら省略。 */
  readonly cascadeOriginSummary?: string;
}

export interface ComparisonVisualizationProps {
  extracted: ComparisonExtracted;
  /** 表示順（Setup id列）。ページ自身が持つ集合の並び順（#544 §6）。 */
  order: readonly string[];
  rowContext: ReadonlyMap<string, ComparisonRowContext>;
  /**
   * 基準（baseline）にするSetup id。`options.ts`のコメントの通り、これはAnalyzerの
   * 解析設定ではなく「対象の集合」の一部としてホスト（単体ページ）が持つ値を
   * そのまま受け取る。`undefined`は「基準なし」。
   */
  baselineSetupId: string | undefined;
  onBaselineSetupIdChange(next: string | undefined): void;
  options: ComparisonOptions;
  onOptionsChange(next: ComparisonOptions): void;
}

function formatValue(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
}

/** 基準比（%）。基準が0の時は「基準自体が0」という事実をそのまま出す（優劣の判定はしない）。 */
function formatRatio(value: number, baseline: number): string {
  if (baseline === 0) return value === 0 ? '基準と同値(0)' : '基準が0';
  return `${((value / baseline) * 100).toFixed(1)}%`;
}

function rowFor(rows: readonly ComparisonRow[], setupId: string): ComparisonRow | undefined {
  return rows.find((row) => row.setupId === setupId);
}

function failureLabel(kind: ComparisonFailedRow['failureKind']): string {
  switch (kind) {
    case 'reference': return '配列・形状が見つからない（削除された可能性）';
    case 'incompatible-text': return 'このテキストには使えない';
    case 'geometry': return '形状を組み立てられない';
  }
}

function ColumnPicker({
  visibleColumns,
  onToggle,
}: {
  visibleColumns: readonly ComparisonColumnId[];
  onToggle: (column: ComparisonColumnId) => void;
}) {
  return (
    <fieldset className="comparison-column-picker">
      <legend>表示する列</legend>
      {COMPARISON_COLUMN_IDS.map((column) => (
        <label key={column}>
          <input
            type="checkbox"
            checked={visibleColumns.includes(column)}
            onChange={() => onToggle(column)}
          />
          {COMPARISON_COLUMN_LABELS[column]}
        </label>
      ))}
    </fieldset>
  );
}

export function ComparisonVisualization({
  extracted,
  order,
  rowContext,
  baselineSetupId,
  onBaselineSetupIdChange,
  options,
  onOptionsChange,
}: ComparisonVisualizationProps) {
  const { visibleColumns, showBaselineRatio } = options;
  // 基準に選んだSetupが集合から外れていたら（削除・選択解除）「基準なし」として扱う
  // （#544指示書「基準に選んだSetupが集合から外れた場合の扱い」）。存在しないidを
  // 指したままの表示にしない。
  const baselineRow = baselineSetupId === undefined ? undefined : rowFor(extracted.rows, baselineSetupId);
  const effectiveBaseline = baselineRow?.kind === 'ok' ? baselineRow : undefined;

  const toggleColumn = (column: ComparisonColumnId) => {
    const next = visibleColumns.includes(column)
      ? visibleColumns.filter((candidate) => candidate !== column)
      : [...visibleColumns, column];
    onOptionsChange({ ...options, visibleColumns: next });
  };

  return (
    <section className="comparison-feature" data-react-feature="comparison">
      <div className="comparison-heading">
        <div>
          <p className="eyebrow">Setup comparison</p>
          <h2>比較表</h2>
        </div>
        <p>
          選んだSetupを並べて、共通指標（`interpretation/metrics.ts`）を横に並べて見る。
          優劣の判定・順位付け・合成スコアはこの表では作らない。基準行との比較は
          差分の実測値を出すだけで、良し悪しの色付けはしない。
        </p>
      </div>

      <section className="comparison-controls" aria-label="比較表の表示設定">
        <ColumnPicker visibleColumns={visibleColumns} onToggle={toggleColumn} />

        <label className="comparison-control">
          <span>基準（baseline）</span>
          <select
            aria-label="基準Setup"
            value={baselineSetupId ?? ''}
            onChange={(event) => onBaselineSetupIdChange(
              event.currentTarget.value === '' ? undefined : event.currentTarget.value,
            )}
          >
            <option value="">基準なし</option>
            {order.map((setupId) => (
              <option key={setupId} value={setupId}>
                {rowContext.get(setupId)?.label ?? setupId}
              </option>
            ))}
          </select>
        </label>

        <label className="comparison-control comparison-checkbox-row">
          <input
            type="checkbox"
            checked={showBaselineRatio}
            disabled={effectiveBaseline === undefined}
            onChange={(event) => onOptionsChange({ ...options, showBaselineRatio: event.currentTarget.checked })}
          />
          <span>基準比（%）も表示する</span>
        </label>
      </section>

      <div className="comparison-table-scroll">
        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">Setup</th>
              <th scope="col">条件</th>
              {visibleColumns.map((column) => (
                <th scope="col" key={column}>{COMPARISON_COLUMN_LABELS[column]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map((setupId) => {
              const context = rowContext.get(setupId);
              const row = rowFor(extracted.rows, setupId);
              const label = context?.label ?? setupId;

              if (row === undefined) {
                // extractedにもrowContextにも無いsetupId（依頼の作り直し途中の一瞬）。
                // 空行として描き、値の欠落を偽らない。
                return (
                  <tr key={setupId} data-comparison-row="pending">
                    <th scope="row">{label}</th>
                    <td colSpan={1 + visibleColumns.length} aria-busy="true">計算している…</td>
                  </tr>
                );
              }

              if (row.kind === 'failed') {
                return (
                  <tr key={setupId} data-comparison-row="failed">
                    <th scope="row">{label}</th>
                    <td colSpan={1 + visibleColumns.length} role="alert">
                      削除された、またはこの条件では解決できない: {row.message || failureLabel(row.failureKind)}
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={setupId} data-comparison-row="ok" data-baseline={setupId === baselineSetupId || undefined}>
                  <th scope="row">{label}</th>
                  <td className="comparison-condition-cell">
                    {context
                      ? `${context.layoutName} / ${context.geometryName} / 指の割当: ${context.fingerAssignmentName}${
                        context.cascadeOriginSummary ? ` ・ ${context.cascadeOriginSummary}` : ''
                      }`
                      : '—'}
                  </td>
                  {visibleColumns.map((column) => {
                    const value = row.values[column];
                    const showRatio = showBaselineRatio
                      && effectiveBaseline !== undefined
                      && effectiveBaseline.setupId !== setupId;
                    return (
                      <td key={column} className="comparison-value-cell">
                        <span className="comparison-value">{formatValue(value)}</span>
                        {showRatio ? (
                          <span className="comparison-ratio">
                            {formatRatio(value, effectiveBaseline!.values[column])}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="comparison-footnote">
        数値は観測値であり、配列の優劣を判定するスコアではない。基準行との比較は差分を示すだけで、
        どちらが良いかはこの表では決めない。
      </p>
    </section>
  );
}

/** engineの契約（純粋）と可視化componentの結び付け。単体ページがこれを載せる。 */
export const comparisonAnalyzer = {
  definition: comparisonDefinition,
  View: ComparisonVisualization,
};
