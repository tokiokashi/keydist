import { useId, useMemo, useState } from 'react';
import { comparisonDefinition, type ComparisonExtracted, type ComparisonFailedRow, type ComparisonRow } from './extract.ts';
import {
  COMPARISON_COLUMN_IDS,
  COMPARISON_COLUMNS,
  COMPARISON_UNIT_NOTE,
  DEFAULT_COMPARISON_OPTIONS,
  type ComparisonColumnId,
  type ComparisonOptions,
  type ComparisonSort,
} from './options.ts';
import { bindOption, CheckboxGroupOptionField, CheckboxOptionField, OptionField } from '#ui/primitives/option-fields.tsx';
import { nextComparisonSort, sortComparisonOrder } from './sort.ts';
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
 * **優劣を示す色・強調・順位の表示はしない**（AGENTS.md「優劣の判定・順位付け・合成スコアを
 * 作らない」）。行の並びの既定は呼び出し側（ホスト）が渡す`order`の順のまま。列の値で並べるのは、
 * 利用者が見出しを押して選ぶ表示の操作（解析設定`sort`）であり、ツールが順位を決めるものではない。
 * 並べ替えるのはこの表の表示だけで、`order`（N感度と共有している対象の集合の順）は変えない。
 * 最小の行を太字にするなどの強調もしない。
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
  /** 見出しを押した時の並び替えの切り替えに使う。 */
  readonly onOptionsChange: (next: ComparisonOptions) => void;
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

const SORT_ARIA: Readonly<Record<'asc' | 'desc', 'ascending' | 'descending'>> = {
  asc: 'ascending',
  desc: 'descending',
};

/**
 * 列の見出し。名前のボタンを押す（Enter・Spaceも同じ）たびに 昇順 → 降順 → 解除 と切り替わり、
 * 並べている列には向きの印と`aria-sort`が付く。見出しは名前と印だけにする（列の説明は表の下の
 * 「列の説明」の開閉ブロックにまとめる。見出しごとに置くと、ペインを狭めた時に見出しの並びの幅を食うため）。
 * 印は列の幅に入れず、セルの右の余白へ絶対配置する。印の出し入れで列の幅が動かず、
 * 幅を確保するための余分な幅も要らない。
 */
function ColumnHeader({ column, sort, onSortChange }: {
  readonly column: ComparisonColumnId;
  readonly sort: ComparisonSort;
  readonly onSortChange: (next: ComparisonSort) => void;
}) {
  const active = sort !== null && sort.column === column ? sort : undefined;
  return (
    <th scope="col" aria-sort={active === undefined ? undefined : SORT_ARIA[active.direction]}>
      <button
        type="button"
        className="comparison-sort-button"
        title="押すたびに昇順・降順・並び替えなしへ切り替える"
        onClick={() => onSortChange(nextComparisonSort(sort, column))}
      >
        {COMPARISON_COLUMNS[column].label}
        <span className="comparison-sort-mark" aria-hidden="true">
          {active === undefined ? '' : active.direction === 'asc' ? '↑' : '↓'}
        </span>
      </button>
    </th>
  );
}

/**
 * 表示している列の説明を、列名と組にしてまとめて出す。距離の単位もここに書く。
 * 浮かせる説明にはしない。長い説明が画面の外へ出たり、キーボードだけでは後半を読めなかったりするため、
 * 表の下に開閉するブロックとして置く（入れ物の幅に収まり、読むのはページのスクロール）。
 * 開閉は表示の一時的な状態で、保存しない。
 */
function ColumnDescriptions({ columns }: { readonly columns: readonly ComparisonColumnId[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (columns.length === 0) return null;
  return (
    <div className="comparison-column-help">
      <button
        type="button"
        className="comparison-column-help-button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
        </svg>
        列の説明
      </button>
      {open ? (
        <dl id={panelId} className="comparison-column-descriptions">
          <p className="comparison-column-unit">{COMPARISON_UNIT_NOTE}</p>
          {columns.map((column) => (
            <div key={column} className="comparison-column-description">
              <dt>{COMPARISON_COLUMNS[column].label}</dt>
              <dd>{COMPARISON_COLUMNS[column].description}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
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
  onOptionsChange,
}: ComparisonBodyProps) {
  const { visibleColumns, showBaselineRatio, sort } = options;
  // 並び替えは表の表示だけ。集合の順（order）はそのまま、描く順だけを並べ直す。
  const displayOrder = useMemo(() => sortComparisonOrder(order, extracted.rows, sort), [order, extracted.rows, sort]);
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
                <ColumnHeader
                  key={column}
                  column={column}
                  sort={sort}
                  onSortChange={(next) => onOptionsChange({ ...options, sort: next })}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {displayOrder.map((targetKey) => {
              const context = rowContext.get(targetKey);
              const row = rowFor(extracted.rows, targetKey);
              const label = context?.label ?? '—';
              const fullName = context?.fullName ?? '';

              if (row === undefined) {
                // extractedにまだ無いtargetKey（依頼の作り直し途中の一瞬）。値の欠落を偽らず、行の中で計算中と出す。
                return (
                  <tr key={targetKey} data-comparison-row="pending">
                    <th scope="row" title={fullName}>{label}</th>
                    <td colSpan={visibleColumns.length} aria-busy="true">計算中…</td>
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
      <ColumnDescriptions columns={visibleColumns} />
    </section>
  );
}

const COLUMN_CHOICES = COMPARISON_COLUMN_IDS.map((column) => ({ value: column, label: COMPARISON_COLUMNS[column].label }));

const SORT_DIRECTION_TEXT = { asc: '昇順', desc: '降順' } as const;

/** 比較表の解析設定（列の表示・基準比の表示・並び替え）。 */
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
      <OptionField
        label="並び替え"
        binding={bind('sort')}
        hint="列の見出しを押すと切り替わる。"
      >
        {(id) => (
          <span id={id}>
            {options.sort === null
              ? 'なし'
              : `${COMPARISON_COLUMNS[options.sort.column].label}（${SORT_DIRECTION_TEXT[options.sort.direction]}）`}
          </span>
        )}
      </OptionField>
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
