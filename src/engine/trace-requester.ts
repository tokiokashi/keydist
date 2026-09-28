import type { Trace } from '#trace/generate.ts';
import type { TraceRequestInput, TraceRequester } from '#analyzers/contract.ts';
import type { ResolvedInput } from './resolved-input.ts';

/**
 * `TraceRequester`（`analyzers/contract.ts`）のengine側の実装（#544 §1の例外・§7）。
 *
 * 追加で要るのは`getTrace`だけなので、`EngineCache`まるごとではなく最小のインタフェースを
 * 引数に取る（`EngineCache`は`cache.ts`が持つ。ここで完全な形を要求すると、
 * `cache.ts`が自分自身をこの関数へ渡す時に「まだ組み立て途中の自分」を参照する
 * 循環になる。`getTrace`だけを渡せば、`cache.ts`は自分のクロージャ内の関数を
 * そのまま渡せる）。
 */
export interface TraceLookup {
  getTrace(input: ResolvedInput): { readonly trace: Trace };
}

/**
 * `baseInput`（今動いている抽出のSetupが解決された入力）に、依頼されたN等の
 * 上書きだけを重ねてTraceを求める。text/layout/geometryは`baseInput`のまま、
 * `tracePolicy`だけ丸ごと差し替える形にする（N感度が変えたいのは`windowSize`
 * 単体だが、`TraceRequestInput`は`tracePolicy`をまとめて持つ形なので、
 * 呼び出し側が`{ ...baseInput.tracePolicy, windowSize: n }`のように組み立てて渡す）。
 *
 * `getTrace`はキー（`keys.ts`の`traceKeyOf`）で共有されるキャッシュを経由するので、
 * 同じ`tracePolicy`を要求する2つの抽出（同じAnalyzerの2インスタンス等）は
 * 計算を1回で済ませる。
 */
export function createTraceRequesterFor(lookup: TraceLookup, baseInput: ResolvedInput): TraceRequester {
  return {
    requestTrace(request: TraceRequestInput): Trace {
      // フィールドを列挙せずに重ねる。`TraceRequestInput`に項目が増えても自動で差し替えに含まれる
      const merged: ResolvedInput = { ...baseInput, ...request };
      return lookup.getTrace(merged).trace;
    },
  };
}
