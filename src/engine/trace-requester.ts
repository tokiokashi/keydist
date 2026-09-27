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
 * `baseInput`（このTraceRequesterの土台。単一対象なら抽出対象Setup自身、集合対象なら
 * `AnalyzerSetMember`ごとのSetup自身の解決済み入力）に、依頼された上書きだけを重ねて
 * Traceを求める。`request`の各フィールドは省略可（`TraceRequestInput`のコメント参照）:
 * 省略したフィールドは`baseInput`のまま、`tracePolicy`は項目ごとにマージする
 * （N感度が変えたいのは`windowSize`単体なので、呼び出し側は`{ tracePolicy: { windowSize: n } }`
 * だけを渡せばよく、`tracePolicy`の他フィールドを自分で複製し直さずに済む）。
 *
 * `getTrace`はキー（`keys.ts`の`traceKeyOf`）で共有されるキャッシュを経由するので、
 * 同じ`tracePolicy`を要求する2つの抽出（同じAnalyzerの2インスタンス等）は
 * 計算を1回で済ませる。
 */
export function createTraceRequesterFor(lookup: TraceLookup, baseInput: ResolvedInput): TraceRequester {
  return {
    requestTrace(request: TraceRequestInput): Trace {
      const merged: ResolvedInput = {
        ...baseInput,
        ...request,
        // tracePolicyだけは丸ごと差し替えでなく項目単位でマージする（上のコメント参照）。
        tracePolicy: { ...baseInput.tracePolicy, ...request.tracePolicy },
      };
      return lookup.getTrace(merged).trace;
    },
  };
}
