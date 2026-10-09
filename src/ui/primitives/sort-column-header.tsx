import type { ReactNode } from 'react';
import { nextColumnSort, type ColumnSort } from './column-sort.ts';
import './sort-column-header.css';

const SORT_ARIA: Readonly<Record<'asc' | 'desc', 'ascending' | 'descending'>> = {
  asc: 'ascending',
  desc: 'descending',
};

const SORT_HINT = '押すたびに昇順・降順・並び替えなしへ切り替わります';

/**
 * 表の列の見出し。名前のボタンを押す（Enter・Spaceも同じ）たびに 昇順 → 降順 → 解除 と切り替わり、
 * 並べている列には向きの印と`aria-sort`が付く。見出しは名前と印だけにする（列の説明はⓘから開く説明にまとめる。
 * 列ごとに置くと、ペインを狭めた時に見出しの並びの幅を食うため）。
 * 印は列の幅に入れず、セルの右の余白へ絶対配置する。印の出し入れで列の幅が動かず、
 * 幅を確保するための余分な幅も要らない。
 *
 * 見出しの文字を短くした列には`fullName`（正式な名前）を渡す。マウスを乗せた時の説明（`title`）と
 * 読み上げの名前（`aria-label`）に出し、並び替えの操作の説明は`title`に残す。
 */
export function SortColumnHeader<Column extends string>({ column, label, fullName, sort, onSortChange }: {
  readonly column: Column;
  /** 見出しに出す文字。 */
  readonly label: ReactNode;
  readonly fullName?: string;
  readonly sort: ColumnSort<Column>;
  readonly onSortChange: (next: ColumnSort<Column>) => void;
}) {
  const active = sort !== null && sort.column === column ? sort : undefined;
  return (
    <th className="sort-column-header" scope="col" aria-sort={active === undefined ? undefined : SORT_ARIA[active.direction]}>
      <button
        type="button"
        className="sort-column-button"
        title={fullName === undefined ? SORT_HINT : `${fullName}（${SORT_HINT}）`}
        aria-label={fullName}
        onClick={() => onSortChange(nextColumnSort(sort, column))}
      >
        {label}
        <span className="sort-column-mark" aria-hidden="true">
          {active === undefined ? '' : active.direction === 'asc' ? '↑' : '↓'}
        </span>
      </button>
    </th>
  );
}
