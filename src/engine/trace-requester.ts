import type { Trace } from '#trace/generate.ts';
import type { TraceRequestInput, TraceRequester } from '#analyzers/contract.ts';
import type { ResolvedInput } from './resolved-input.ts';

/**
 * `TraceRequester`（`analyzers/contract.ts`）のengine側の実装。
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
 * `object`から値が`undefined`のキーだけを落とす。`tsconfig.json`は
 * `exactOptionalPropertyTypes`を立てていないため、`{ layout: undefined }`のような
 * 「キーはあるが値がundefined」というオブジェクトが型検査をすり抜けて渡ってくる
 * （`requestTrace({ layout: undefined })`はクラッシュし、
 * `{ tracePolicy: { windowSize: undefined } }`は省略時と別のキャッシュキーになる）。
 * 単純な`{ ...base, ...request }`はこの「キーはある」を「上書きする」と区別できず、
 * `undefined`で上書きしてしまう。呼び出し側が「省略」のつもりで書いた`undefined`を
 * 実際に「省略」として扱うため、マージの直前にこの関数で落とす。
 */
function withoutUndefinedValues<T extends object>(obj: T | undefined): Partial<T> {
  if (obj === undefined) return {};
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) (result as Record<string, unknown>)[key] = value;
  }
  return result;
}

/**
 * `baseInput`（このTraceRequesterの土台。単一対象なら抽出対象Setup自身、集合対象なら
 * `AnalyzerSetMember`ごとのSetup自身の解決済み入力）に、依頼された上書きだけを重ねて
 * Traceを求める。`request`の各フィールドは省略可（`TraceRequestInput`のコメント参照）:
 * 省略したフィールドは`baseInput`のまま、`tracePolicy`は項目ごとにマージする
 * （N感度が変えたいのは`windowSize`単体なので、呼び出し側は`{ tracePolicy: { windowSize: n } }`
 * だけを渡せばよく、`tracePolicy`の他フィールドを自分で複製し直さずに済む）。値が
 * `undefined`のキー（トップレベル・`tracePolicy`の中のどちらも）は「省略」として扱い、
 * `baseInput`側の値を残す（`withoutUndefinedValues`のコメント参照）。
 *
 * `getTrace`はキー（`keys.ts`の`traceKeyOf`）で共有されるキャッシュを経由するので、
 * 同じ`tracePolicy`を要求する2つの抽出（同じAnalyzerの2インスタンス等）は
 * 計算を1回で済ませる。
 */
export function createTraceRequesterFor(lookup: TraceLookup, baseInput: ResolvedInput): TraceRequester {
  return {
    requestTrace(request: TraceRequestInput): Trace {
      const { tracePolicy: requestTracePolicy, ...restRequest } = request;
      const merged: ResolvedInput = {
        ...baseInput,
        ...withoutUndefinedValues(restRequest),
        // tracePolicyだけは丸ごと差し替えでなく項目単位でマージする（上のコメント参照）。
        tracePolicy: { ...baseInput.tracePolicy, ...withoutUndefinedValues(requestTracePolicy) },
      };
      return lookup.getTrace(merged).trace;
    },
  };
}
