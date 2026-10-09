import { useMemo } from 'react';
import { FINGER_LABEL, FINGER_SHORT_WITH_HAND } from '#input/shapes/finger-names.ts';
import type { Finger } from '#input/shapes/geometry.ts';
import { bindOption, OptionField, SelectOptionField } from '#ui/primitives/option-fields.tsx';
import { sortOrderByColumn, type ColumnSort } from '#ui/primitives/column-sort.ts';
import { SortColumnHeader } from '#ui/primitives/sort-column-header.tsx';
import type { AnalyzerSettingsProps, SetAnalyzerPaneParts, SetBodyProps } from '../pane-parts.tsx';
import { EMPTY_CELL_TEXT, fingerMatrixCell } from './display.ts';
import {
  fingerMatrixDefinition,
  type FingerMatrixColumn,
  type FingerMatrixExtracted,
  type FingerMatrixFailedRow,
  type FingerMatrixRow,
} from './extract.ts';
import {
  DEFAULT_FINGER_MATRIX_OPTIONS,
  FINGER_MATRIX_SURFACE_IDS,
  fingerMatrixOptions,
  type FingerMatrixOptions,
} from './options.ts';
import { FINGER_MATRIX_PANE_META } from './pane-meta.ts';
import { FINGER_MATRIX_SURFACE_TEXT } from './surface-text.ts';
import './finger-matrix-view.css';

/**
 * 配列×指のマトリックスの可視化。
 *
 * 抽出の結果（`extract.ts`）を表に並べるだけで、`Metrics`の再計算はしない。表示のための割り算と書式は
 * `display.ts`にあり、ここは並べるだけ。
 *
 * **優劣を示す色・強調・順位の表示はしない**（AGENTS.md「優劣の判定・順位付け・合成スコアを作らない」）。
 * 最小の行や列を強調せず、値に応じてセルを塗り分けもしない。行の並びの既定はホストが渡す`order`の順のまま。
 * 列の値で並べるのは、利用者が見出しを押して選ぶ表示の操作（解析設定`sort`）であり、ツールが順位を決めるものではない。
 */

/** 1対象ぶんの、行の名前。条件は行に併記せず、ペインの条件の要約が出す。 */
export interface FingerMatrixRowContext {
  readonly targetKey: string;
  readonly label: string;
  /** 集合によらない完全な名前。hover（`title`属性）に出す。 */
  readonly fullName: string;
}

export type FingerMatrixBodyProps = SetBodyProps<FingerMatrixExtracted, FingerMatrixOptions, FingerMatrixRowContext>;

/** 列の見出しの短い名前と正式な名前。指の組は、短い名前は2本の指の名前を`-`でつなぎ、正式な名前は「AとBの間」と書く。 */
function columnNames(column: FingerMatrixColumn): { readonly short: string; readonly full: string } {
  const short = column.fingers.map((finger) => FINGER_SHORT_WITH_HAND[finger]).join('-');
  const full = column.fingers.map((finger) => FINGER_LABEL[finger]);
  return { short, full: full.length === 1 ? full[0]! : `${full[0]}と${full[1]}の間` };
}

function failureLabel(kind: FingerMatrixFailedRow['failureKind']): string {
  switch (kind) {
    case 'reference': return '配列・物理配列が見つかりません（削除された可能性があります）';
    case 'incompatible-text': return 'このテキストには使えません';
    case 'geometry': return 'キーボードを組み立てられません';
    case 'target-missing': return '削除されたか、見つかりません';
  }
}

function rowFor(rows: readonly FingerMatrixRow[], targetKey: string): FingerMatrixRow | undefined {
  return rows.find((row) => row.targetKey === targetKey);
}

export function FingerMatrixBody({ extracted, order, rowContext, options, onOptionsChange }: FingerMatrixBodyProps) {
  const { surface: surfaceId, sort } = options;
  const surface = extracted.surfaces.find((item) => item.id === surfaceId) ?? extracted.surfaces[0]!;
  const text = FINGER_MATRIX_SURFACE_TEXT[surface.id];
  const columnIds = surface.columns.map((column) => column.id);
  // 並び替えに使う列が今の面に無い時（指の面と指間の面を切り替えた時）は、並び替えていない状態として扱う。
  const effectiveSort: ColumnSort<string> = sort !== null && columnIds.includes(sort.column) ? sort : null;

  const displayOrder = useMemo(() => {
    const byKey = new Map<string, FingerMatrixRow>(extracted.rows.map((row) => [row.targetKey, row]));
    const indexOf = new Map<string, number>(surface.columns.map((column, index) => [column.id, index]));
    return sortOrderByColumn<string>(order, (targetKey, column) => {
      const row = byKey.get(targetKey);
      const index = indexOf.get(column);
      if (row?.kind !== 'ok' || index === undefined) return undefined;
      return fingerMatrixCell(surface.id, row, index).value;
    }, effectiveSort);
  }, [order, extracted.rows, surface, effectiveSort]);

  return (
    <section className="finger-matrix-feature" data-react-feature="finger-matrix">
      <div className="finger-matrix-scroll">
        <table className="finger-matrix-table" data-surface={surface.id}>
          <caption>{text.label}（{text.unit}）</caption>
          <thead>
            <tr>
              <th scope="col">対象</th>
              {surface.columns.map((column) => {
                const names = columnNames(column);
                return (
                  <SortColumnHeader<string>
                    key={column.id}
                    column={column.id}
                    label={names.short}
                    fullName={names.full}
                    sort={effectiveSort}
                    onSortChange={(next) => onOptionsChange({ ...options, sort: next })}
                  />
                );
              })}
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
                  <tr key={targetKey} data-finger-matrix-row="pending">
                    <th scope="row" title={fullName}>{label}</th>
                    <td colSpan={surface.columns.length} aria-busy="true">計算中…</td>
                  </tr>
                );
              }

              if (row.kind === 'failed') {
                return (
                  <tr key={targetKey} data-finger-matrix-row="failed">
                    <th scope="row" title={fullName}>{label}</th>
                    <td colSpan={surface.columns.length} role="alert">
                      {row.message || failureLabel(row.failureKind)}
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={targetKey} data-finger-matrix-row="ok">
                  <th scope="row" title={fullName}>{label}</th>
                  {surface.columns.map((column, index) => {
                    const cell = fingerMatrixCell(surface.id, row, index);
                    return (
                      <td
                        key={column.id}
                        title={`${columnNames(column).full}：${cell.tip}`}
                        data-empty={cell.text === EMPTY_CELL_TEXT || undefined}
                      >
                        {cell.text}
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

const SURFACE_CHOICES = FINGER_MATRIX_SURFACE_IDS.map((id) => ({ value: id, label: FINGER_MATRIX_SURFACE_TEXT[id].label }));

const SORT_DIRECTION_TEXT = { asc: '昇順', desc: '降順' } as const;

/** 並び替えの欄に出す列の名前（列のidは指のid、または`-`でつないだ2本の指のid）。 */
function sortColumnName(column: string): string {
  return column.split('-').map((id) => FINGER_SHORT_WITH_HAND[id as Finger] ?? id).join('-');
}

/** 配列×指のマトリックスの解析設定（見る量・並び替え）。 */
export function FingerMatrixSettings({ options, onOptionsChange }: AnalyzerSettingsProps<FingerMatrixOptions>) {
  const bind = <K extends keyof FingerMatrixOptions>(key: K) =>
    bindOption(options, DEFAULT_FINGER_MATRIX_OPTIONS, onOptionsChange, key);
  return (
    <div className="option-groups">
      <SelectOptionField
        label="見る量"
        binding={bind('surface')}
        choices={SURFACE_CHOICES}
        hint="同指連続の比率は、その指で押した回数に対する割合です。"
      />
      <OptionField
        label="並び替え"
        binding={bind('sort')}
        hint="列の見出しを押すと切り替わります。"
      >
        {(id) => (
          <span id={id}>
            {options.sort === null
              ? 'なし'
              : `${sortColumnName(options.sort.column)}（${SORT_DIRECTION_TEXT[options.sort.direction]}）`}
          </span>
        )}
      </OptionField>
    </div>
  );
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const fingerMatrixAnalyzer = {
  definition: fingerMatrixDefinition,
  ...FINGER_MATRIX_PANE_META,
  Body: FingerMatrixBody,
  Settings: FingerMatrixSettings,
  defaultOptions: DEFAULT_FINGER_MATRIX_OPTIONS,
  urlOptions: fingerMatrixOptions,
  rowContext: ({ targetKey, label, fullName }) => ({ targetKey, label, fullName }),
} satisfies SetAnalyzerPaneParts<FingerMatrixOptions, FingerMatrixExtracted, FingerMatrixRowContext>;
