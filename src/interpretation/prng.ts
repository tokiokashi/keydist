/**
 * 名前のある決定的な乱数生成器。`Math.random` は再現できないので、乱数が要る計算はここから使う。
 * 数値の条件には、生成器の名前（`PRNG_NAME`）と種を併記する。
 */

/** 乱数生成器の名前。数値の再現の条件に書く。 */
export const PRNG_NAME = 'mulberry32';

/** mulberry32（32bitの種）。同じ種からは同じ列が出る。`[0, 1)` の値を返す。 */
export function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
