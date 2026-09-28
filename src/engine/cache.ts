import { interpretationKeyOf, traceKeyOf } from './keys.ts';
import {
  generateEngineTrace,
  interpretEngineTrace,
  type EngineInterpretationResult,
  type EngineTraceResult,
} from './pipeline.ts';
import type { ResolvedInput } from './resolved-input.ts';

/**
 * 表示中のSetupだけを計算する前提なので大きくしなくてよい（#544 §7）。
 * 1タブで同時に開くペイン・比較対象の目安として32を既定にする。
 * 上限を超えたら最も長く参照されていないキーを1件だけ捨てる（LRU）。
 */
const DEFAULT_MAX_ENTRIES = 32;

/**
 * 挿入順を保つ`Map`を使った素朴なLRU。`get`で当たったキーを末尾へ動かし、
 * `set`で上限を超えたら先頭（最も長く触っていない）を1件捨てる。
 */
class LruCache<K, V> {
  private readonly store = new Map<K, V>();
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  get(key: K): V | undefined {
    const value = this.store.get(key);
    if (value === undefined) return undefined;
    // 触ったキーを最新として末尾へ動かす。
    this.store.delete(key);
    this.store.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    this.store.delete(key);
    this.store.set(key, value);
    if (this.store.size <= this.max) return;
    const oldest = this.store.keys().next();
    if (!oldest.done) this.store.delete(oldest.value);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

export interface EngineCacheOptions {
  /** Traceキャッシュの最大保持件数。省略時は`DEFAULT_MAX_ENTRIES`。 */
  readonly maxTraceEntries?: number;
  /** 解釈キャッシュの最大保持件数。省略時は`DEFAULT_MAX_ENTRIES`。 */
  readonly maxInterpretationEntries?: number;
}

export interface EngineCache {
  /** Traceを中身のキーで引く。無ければ計算して積む。 */
  getTrace(input: ResolvedInput): EngineTraceResult;
  /**
   * 解釈を中身のキーで引く。Traceは`getTrace`と同じキャッシュを共有するので、
   * 解釈だけが違う（chain/arpeggio解釈の変更）2つの呼び出しはTraceを再利用する。
   */
  getInterpretation(input: ResolvedInput): EngineInterpretationResult;
  /** 計算結果は永続化しない（#544 §7）。明示的に空にする時だけ使う。 */
  clear(): void;
  readonly size: { readonly trace: number; readonly interpretation: number };
}

/**
 * メモリ上のキャッシュ（#544 §7・§8-1）。永続化はしない。
 *
 * 非同期化への備え（#544 §8-1、次の作業単位）: ここでは同期のまま「依頼したら即座に
 * 値が返る」形にしているが、`getTrace` / `getInterpretation` の中身
 * （キーを作る → キャッシュを引く → 無ければ`pipeline.ts`の純関数を呼ぶ）は
 * そのまま「非同期の依頼を受けて、キャッシュに無ければ計算をキューへ積む」処理に
 * 置き換えられる形にしてある。呼び出し側（Analyzer等）が今のうちから
 * `cache.getTrace(input)` を「結果を求める窓口」として扱っておけば、次の作業単位で
 * この関数の戻り値をPromiseや購読オブジェクトに変えるだけで移行できる。
 */
export function createEngineCache(options: EngineCacheOptions = {}): EngineCache {
  const traceCache = new LruCache<string, EngineTraceResult>(options.maxTraceEntries ?? DEFAULT_MAX_ENTRIES);
  const interpretationCache = new LruCache<string, EngineInterpretationResult>(
    options.maxInterpretationEntries ?? DEFAULT_MAX_ENTRIES,
  );

  function getTrace(input: ResolvedInput): EngineTraceResult {
    const key = traceKeyOf(input);
    const cached = traceCache.get(key);
    if (cached) return cached;
    const result = generateEngineTrace(input);
    traceCache.set(key, result);
    return result;
  }

  function getInterpretation(input: ResolvedInput): EngineInterpretationResult {
    const traceResult = getTrace(input);
    const interpretationKey = interpretationKeyOf(input, traceKeyOf(input));
    const cached = interpretationCache.get(interpretationKey);
    if (cached) return cached;
    const result = interpretEngineTrace(traceResult, input);
    interpretationCache.set(interpretationKey, result);
    return result;
  }

  return {
    getTrace,
    getInterpretation,
    clear() {
      traceCache.clear();
      interpretationCache.clear();
    },
    get size() {
      return { trace: traceCache.size, interpretation: interpretationCache.size };
    },
  };
}
