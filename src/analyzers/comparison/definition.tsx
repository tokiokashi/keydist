import { comparisonDefinition, type ComparisonExtracted, type ComparisonFailedRow, type ComparisonRow } from './extract.ts';
import { COMPARISON_COLUMN_IDS, COMPARISON_COLUMNS, type ComparisonColumnId, type ComparisonOptions } from './options.ts';
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
  readonly targetKey: string;
  readonly label: string;
  /** 集合によらない完全な名前（レビュー指摘3）。hover（`title`属性）に出す。 */
  readonly fullName: string;
  readonly layoutName: string;
  readonly geometryName: string;
  readonly fingerAssignmentName: string;
  /** カスケードの出どころの短い要約（例: "Setup override" "global"）。空なら省略。 */
  readonly cascadeOriginSummary?: string;
}

export interface ComparisonVisualizationProps {
  extracted: ComparisonExtracted;
  /** 表示順（対象keyの列）。ページ自身が持つ集合の並び順（#544 §6）。 */
  order: readonly string[];
  rowContext: ReadonlyMap<string, ComparisonRowContext>;
  /**
   * 基準（baseline）にする対象key。`options.ts`のコメントの通り、これはAnalyzerの
   * 解析設定ではなく「対象の集合」の一部としてホスト（単体ページ）が持つ値を
   * そのまま受け取る。`undefined`は「基準なし」。
   */
  baselineTargetKey: string | undefined;
  onBaselineTargetKeyChange(next: string | undefined): void;
  options: ComparisonOptions;
  onOptionsChange(next: ComparisonOptions): void;
}

/**
 * 列ごとの表示形式（`COMPARISON_COLUMNS[column].format`）で描く。値が非有限
 * （メンバー0件時の集計等、通常のMetricsでは起きないが念のため）なら「—」。
 */
function formatValue(column: ComparisonColumnId, value: number): string {
  if (!Number.isFinite(value)) return '—';
  return COMPARISON_COLUMNS[column].format(value);
}

/** 基準比（%）。基準が0の時は「基準自体が0」という事実をそのまま出す（優劣の判定はしない）。 */
function formatRatio(value: number, baseline: number): string {
  if (baseline === 0) return value === 0 ? '基準と同値（0）' : '基準が0';
  return `${((value / baseline) * 100).toFixed(1)}%`;
}

function rowFor(rows: readonly ComparisonRow[], targetKey: string): ComparisonRow | undefined {
  return rows.find((row) => row.targetKey === targetKey);
}

function failureLabel(kind: ComparisonFailedRow['failureKind']): string {
  switch (kind) {
    case 'reference': return '配列・物理配列が見つからない（削除された可能性がある）';
    case 'incompatible-text': return 'このテキストには使えない';
    case 'geometry': return 'キーボードを組み立てられない';
    case 'target-missing': return '削除された、または見つからない';
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
          {COMPARISON_COLUMNS[column].label}
        </label>
      ))}
    </fieldset>
  );
}

export function ComparisonVisualization({
  extracted,
  order,
  rowContext,
  baselineTargetKey,
  onBaselineTargetKeyChange,
  options,
  onOptionsChange,
}: ComparisonVisualizationProps) {
  const { visibleColumns, showBaselineRatio } = options;
  // 基準に選んだSetupが集合から外れていたら（削除・選択解除）「基準なし」として扱う
  // （#544指示書「基準に選んだSetupが集合から外れた場合の扱い」）。存在しないidを
  // 指したままの表示にしない。
  const baselineRow = baselineTargetKey === undefined ? undefined : rowFor(extracted.rows, baselineTargetKey);
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
          <h2>比較表</h2>
        </div>
        <p>
          選んだ配列やSetupを並べて、同じテキストを打った時の指の移動距離などを横に比べる。
          どれが良いかの判定や順位付けはしない。基準を選ぶと、基準に対する割合（%）も出せる
          （良し悪しの色付けはしない）。
        </p>
      </div>

      <section className="comparison-controls" aria-label="比較表の表示設定">
        <ColumnPicker visibleColumns={visibleColumns} onToggle={toggleColumn} />

        <label className="comparison-control">
          <span>基準にする対象</span>
          <select
            aria-label="基準"
            value={baselineTargetKey ?? ''}
            onChange={(event) => onBaselineTargetKeyChange(
              event.currentTarget.value === '' ? undefined : event.currentTarget.value,
            )}
          >
            <option value="">基準なし</option>
            {order.map((targetKey) => (
              <option key={targetKey} value={targetKey} title={rowContext.get(targetKey)?.fullName}>
                {rowContext.get(targetKey)?.label ?? '—'}
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
              <th scope="col">対象</th>
              <th scope="col">条件</th>
              {visibleColumns.map((column) => (
                <th scope="col" key={column}>{COMPARISON_COLUMNS[column].label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map((targetKey) => {
              const context = rowContext.get(targetKey);
              const row = rowFor(extracted.rows, targetKey);
              const label = context?.label ?? '—';
              const fullName = context?.fullName ?? '';

              if (row === undefined) {
                // extractedにもrowContextにも無いtargetKey（依頼の作り直し途中の一瞬）。
                // 空行として描き、値の欠落を偽らない。
                return (
                  <tr key={targetKey} data-comparison-row="pending">
                    <th scope="row" title={fullName}>{label}</th>
                    <td colSpan={1 + visibleColumns.length} aria-busy="true">計算している…</td>
                  </tr>
                );
              }

              if (row.kind === 'failed') {
                return (
                  <tr key={targetKey} data-comparison-row="failed">
                    <th scope="row" title={fullName}>{label}</th>
                    <td colSpan={1 + visibleColumns.length} role="alert">
                      {row.message || failureLabel(row.failureKind)}
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={targetKey} data-comparison-row="ok" data-baseline={targetKey === baselineTargetKey || undefined}>
                  <th scope="row" title={fullName}>{label}</th>
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
                      && effectiveBaseline.targetKey !== targetKey;
                    return (
                      <td key={column} className="comparison-value-cell">
                        <span className="comparison-value">{formatValue(column, value)}</span>
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
        数値は観測値であり、配列の優劣を判定するスコアではない。基準行との比較は基準に対する割合を示すだけで、
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
