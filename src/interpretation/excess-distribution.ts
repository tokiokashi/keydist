/**
 * 隣接指間距離の超過 `E` の分布を、状態別の頻度（状態の値 → 打鍵数）で持つ（仕様 §11.6）。
 *
 * 値は位置の組み合わせで決まる離散値なので、固定幅の区間に分けず、同じ値を1つの状態として数える。
 */

/** 状態の値の丸めの桁。誤差（1e-15程度）よりずっと粗く、座標が作る状態の差（1e-3以上）よりずっと細かい。 */
const STATE_DECIMALS = 6;
const STATE_SCALE = 10 ** STATE_DECIMALS;

/**
 * 超過 `E` [u] を状態の値に丸める。同じ位置の組から得た `E` が、計算順序による浮動小数の誤差で
 * 別の状態に分かれないようにする。整数に丸めてから戻すので、同じ整数に丸まる値は必ず同じ値になる。
 * `-0` は `0` に揃える。
 */
export function excessState(excess: number): number {
  return Math.round(excess * STATE_SCALE) / STATE_SCALE + 0;
}

/** 状態の値 → その状態の打鍵数。 */
export type StateCounts = ReadonlyMap<number, number>;

/** 超過の標本から、状態別の頻度を数える。母集団は渡された標本の全部（ホームにある打鍵も含む）。 */
export function countStates(excesses: readonly number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const excess of excesses) {
    const state = excessState(excess);
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return counts;
}

export interface StateShare {
  /** 状態の値 [u] */
  readonly state: number;
  readonly count: number;
  /** 全打鍵に対する割合 [%] */
  readonly share: number;
}

/** 頻度を、状態の値の昇順に並べた割合 [%] へ直す。打鍵が0件なら空。 */
export function stateShares(counts: StateCounts): StateShare[] {
  let total = 0;
  for (const count of counts.values()) total += count;
  return [...counts].sort(([a], [b]) => a - b).map(([state, count]) => ({ state, count, share: (count / total) * 100 }));
}
