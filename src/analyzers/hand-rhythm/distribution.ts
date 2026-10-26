import type { RunLengthCount } from './extract.ts';

/**
 * 連続の長さごとの数を、図の行に並べる。長い連続は1行にまとめる。
 * 長さの下限から最も長い連続（上限でまとめた長さ）までの間で、数が0の長さも行として残す
 * （途中の長さが抜けると、分布の形が読めなくなるため）。
 */

/** 図に出す最も長い行の長さ。これ以上の連続は1行にまとめる。 */
export const DISTRIBUTION_CAP = 10;

export interface DistributionRow {
  readonly key: string;
  /** 行の見出し（「3」「10以上」） */
  readonly label: string;
  readonly count: number;
  /** この行がまとめた長さの範囲。まとめない行は `from` と `to` が同じ */
  readonly from: number;
  readonly to: number | undefined;
}

export function distributionRowsOf(counts: readonly RunLengthCount[], minLength: number, cap: number = DISTRIBUTION_CAP): DistributionRow[] {
  if (counts.length === 0) return [];
  const longest = Math.min(cap, counts[counts.length - 1].length);
  const rows: DistributionRow[] = [];
  for (let length = minLength; length <= longest; length++) {
    const isCap = length === cap;
    const count = counts.filter((item) => (isCap ? item.length >= cap : item.length === length)).reduce((sum, item) => sum + item.count, 0);
    rows.push({ key: String(length), label: isCap ? `${length}以上` : String(length), count, from: length, to: isCap ? undefined : length });
  }
  return rows;
}
