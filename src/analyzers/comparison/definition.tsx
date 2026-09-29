import { comparisonDefinition, type ComparisonExtracted, type ComparisonFailedRow, type ComparisonRow } from './extract.ts';
import {
  COMPARISON_COLUMN_IDS,
  COMPARISON_COLUMNS,
  DEFAULT_COMPARISON_OPTIONS,
  type ComparisonColumnId,
  type ComparisonOptions,
} from './options.ts';
import { bindOption, CheckboxGroupOptionField, CheckboxOptionField } from '#ui/primitives/option-fields.tsx';
import { COMPARISON_PANE_META } from './pane-meta.ts';
import type { AnalyzerPaneParts, AnalyzerSettingsProps, AnalyzerTargetItemProps } from '../pane-parts.tsx';
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

/** 1 対象ぶんの、行の名前。条件は行に併記せず、ペインの条件の要約が出す。 */
export interface ComparisonRowContext {
  readonly targetKey: string;
  readonly label: string;
  /** 集合によらない完全な名前（レビュー指摘3）。hover（`title`属性）に出す。 */
  readonly fullName: string;
}

export interface ComparisonBodyProps {
  readonly extracted: ComparisonExtracted;
  /** 表示順（対象keyの列）。ホストが持つ集合の並び順（#544 §6）。 */
  readonly order: readonly string[];
  readonly rowContext: ReadonlyMap<string, ComparisonRowContext>;
  /**
   * 基準（baseline）にする対象key。解析設定ではなく「対象の集合」の一部としてホストが持つ値
   * （対象の選択に差し込む`ComparisonBaselineItem`で選ぶ）を受け取る。`undefined`は「基準なし」。
   */
  readonly baselineTargetKey: string | undefined;
  readonly options: ComparisonOptions;
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

/**
 * 比較表の本体（表）。行ごとの失敗・計算中（抽出の値として届くメンバー単位の状態）は行に出す。
 * ペイン全体の計算中・失敗・対象が空の時はホストが出し、本体は呼ばれない。
 */
export function ComparisonBody({
  extracted,
  order,
  rowContext,
  baselineTargetKey,
  options,
}: ComparisonBodyProps) {
  const { visibleColumns, showBaselineRatio } = options;
  // 基準に選んだ対象が集合から外れていたら（削除・選択解除）「基準なし」として扱う。
  // 存在しないidを指したままの表示にしない。
  const baselineRow = baselineTargetKey === undefined ? undefined : rowFor(extracted.rows, baselineTargetKey);
  const effectiveBaseline = baselineRow?.kind === 'ok' ? baselineRow : undefined;

  return (
    <section className="comparison-feature" data-react-feature="comparison">
      <div className="comparison-table-scroll">
        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">対象</th>
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
                // extractedにまだ無いtargetKey（依頼の作り直し途中の一瞬）。値の欠落を偽らず、行の中で計算中と出す。
                return (
                  <tr key={targetKey} data-comparison-row="pending">
                    <th scope="row" title={fullName}>{label}</th>
                    <td colSpan={visibleColumns.length} aria-busy="true">計算している…</td>
                  </tr>
                );
              }

              if (row.kind === 'failed') {
                return (
                  <tr key={targetKey} data-comparison-row="failed">
                    <th scope="row" title={fullName}>{label}</th>
                    <td colSpan={visibleColumns.length} role="alert">
                      {row.message || failureLabel(row.failureKind)}
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={targetKey} data-comparison-row="ok" data-baseline={targetKey === baselineTargetKey || undefined}>
                  <th scope="row" title={fullName}>
                    {label}
                    {targetKey === baselineTargetKey ? <span className="comparison-baseline-tag">基準</span> : null}
                  </th>
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
    </section>
  );
}

const COLUMN_CHOICES = COMPARISON_COLUMN_IDS.map((column) => ({ value: column, label: COMPARISON_COLUMNS[column].label }));

/** 比較表の解析設定（列の表示・基準比の表示）。 */
export function ComparisonSettings({ options, onOptionsChange }: AnalyzerSettingsProps<ComparisonOptions>) {
  const bind = <K extends keyof ComparisonOptions>(key: K) =>
    bindOption(options, DEFAULT_COMPARISON_OPTIONS, onOptionsChange, key);
  return (
    <div className="option-groups">
      <CheckboxGroupOptionField<ComparisonColumnId>
        label="表示する列"
        binding={bind('visibleColumns')}
        choices={COLUMN_CHOICES}
      />
      <CheckboxOptionField
        label="基準比（%）も表示する"
        binding={bind('showBaselineRatio')}
        hint="対象の選択で基準を選んだ時に、各値の横に基準に対する割合を出す。"
      />
    </div>
  );
}

/**
 * 対象の選択に差し込む「基準にする対象」。値の持ち主は対象の集合なので、解析設定ではなく
 * 対象の選択の中に置く（docs/architecture.md「対象の選択」）。候補の表示名はホストが集合に対して計算したもの。
 */
export function ComparisonBaselineItem({ value, candidates, onChange }: AnalyzerTargetItemProps<string | undefined>) {
  return (
    <label className="comparison-baseline-item">
      <span>基準にする対象</span>
      <select
        aria-label="基準"
        value={value ?? ''}
        onChange={(event) => onChange(event.currentTarget.value === '' ? undefined : event.currentTarget.value)}
      >
        <option value="">基準なし</option>
        {candidates.map((candidate) => (
          <option key={candidate.key} value={candidate.key} title={candidate.fullName}>
            {candidate.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const comparisonAnalyzer = {
  definition: comparisonDefinition,
  ...COMPARISON_PANE_META,
  Body: ComparisonBody,
  Settings: ComparisonSettings,
  defaultOptions: DEFAULT_COMPARISON_OPTIONS,
  TargetItem: ComparisonBaselineItem,
} satisfies AnalyzerPaneParts<typeof comparisonDefinition, ComparisonOptions, ComparisonBodyProps, string | undefined>;
