import type { AnalyzerSetMember, AnalyzerSetMemberFailure, SetAnalyzerDefinition, SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import type { AnalysisTarget } from '#input/setup/index.ts';
import { LruCache } from './lru-cache.ts';
import { interpretationKeyOf, setAnalyzerExtractionKeyOf, setMemberKeyOf, singleExtractionKeyOf, traceKeyOf } from './keys.ts';
import {
  extractSet,
  extractSingle,
  generateEngineTrace,
  interpretEngineTrace,
  type EngineExtractionResult,
  type EngineInterpretationResult,
  type EngineTraceResult,
} from './pipeline.ts';
import type { EngineSetMemberInput } from './request.ts';
import type { ResolvedInput } from './resolved-input.ts';
import { describeResolvedInputError } from './resolved-input-errors.ts';
import { createTraceRequesterFor } from './trace-requester.ts';

/**
 * 表示中のSetupだけを計算する前提なので大きくしなくてよい（#544 §7）。
 * 1タブで同時に開くペイン・比較対象の目安として32を既定にする。
 * 上限を超えたら最も長く参照されていないキーを1件だけ捨てる（LRU）。
 */
const DEFAULT_MAX_ENTRIES = 32;

export interface EngineCacheOptions {
  /** Traceキャッシュの最大保持件数。省略時は`DEFAULT_MAX_ENTRIES`。 */
  readonly maxTraceEntries?: number;
  /** 解釈キャッシュの最大保持件数。省略時は`DEFAULT_MAX_ENTRIES`。 */
  readonly maxInterpretationEntries?: number;
  /** 抽出キャッシュの最大保持件数。省略時は`DEFAULT_MAX_ENTRIES`。 */
  readonly maxExtractionEntries?: number;
}

export interface EngineCache {
  /** Traceを中身のキーで引く。無ければ計算して積む。 */
  getTrace(input: ResolvedInput): EngineTraceResult;
  /**
   * 解釈を中身のキーで引く。Traceは`getTrace`と同じキャッシュを共有するので、
   * 解釈だけが違う（chain/arpeggio解釈の変更）2つの呼び出しはTraceを再利用する。
   */
  getInterpretation(input: ResolvedInput): EngineInterpretationResult;
  /**
   * 単一Setup対象のAnalyzerの抽出を、抽出のキー（解釈のキー + Analyzer id +
   * 抽出に効くoptions）で引く。無ければ解釈（さらにその中でTrace）まで遡って計算し、
   * 積む。同じ抽出のキーを要求する2つのAnalyzerインスタンスは1回しか`extract`を
   * 呼ばない（#544 §7「複数のAnalyzerが同じ抽出を使う場合も1回で済む」の、
   * 同一Analyzer内の複数インスタンス版）。
   *
   * `Options`/`Extracted`はAnalyzerごとに異なるため、キャッシュの値自体は`unknown`で
   * 保持する（呼び出し側は自分が渡した`definition`の型を知っているので、戻り値の型は
   * 呼び出し時のジェネリックでそのまま絞り込める）。
   */
  getExtraction<Options, Extracted>(
    input: ResolvedInput,
    definition: SingleAnalyzerDefinition<Options, Extracted>,
    options: Options,
  ): EngineExtractionResult<Extracted>;
  /**
   * 集合対象のAnalyzerの抽出（#544 Phase 3）。`members`は集合の各枠（配列かSetup）の解決済み
   * 入力（または解決失敗）を、表示順のまま渡す（`setAnalyzerExtractionKeyOf`のコメント
   * 参照: 順序込みでキャッシュキーに畳み込む）。
   *
   * 解決できたメンバーのTrace・解釈は`getTrace`/`getInterpretation`と同じキャッシュを
   * 共有する（同じ中身のSetupを含む集合を2つ作っても、共通するSetupの計算は1回で済む。
   * #544 §7「各Setupのcompute（Trace・解釈）は単一対象と同じキャッシュを共有する」）。
   * 解決に失敗したメンバーは`AnalyzerDefinition.extract`へ渡す`members`からは外し、
   * `failures`として渡す（#544指示書「全体を失敗にせず、メンバーごとの失敗を値で持つ」）。
   */
  getSetExtraction<Options, Extracted>(
    members: readonly EngineSetMemberInput[],
    definition: SetAnalyzerDefinition<Options, Extracted>,
    options: Options,
  ): EngineExtractionResult<Extracted>;
  /** 計算結果は永続化しない（#544 §7）。明示的に空にする時だけ使う。 */
  clear(): void;
  readonly size: { readonly trace: number; readonly interpretation: number; readonly extraction: number };
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
  // 値の型はAnalyzerごとに違うので`unknown`で持ち、`getExtraction`の呼び出し側の
  // ジェネリックで絞り込む（このファイル内では中身の型を知らないまま扱う）。
  const extractionCache = new LruCache<string, EngineExtractionResult<unknown>>(
    options.maxExtractionEntries ?? DEFAULT_MAX_ENTRIES,
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

  function getExtraction<Options, Extracted>(
    input: ResolvedInput,
    definition: SingleAnalyzerDefinition<Options, Extracted>,
    options: Options,
  ): EngineExtractionResult<Extracted> {
    const interpretationResult = getInterpretation(input);
    const key = singleExtractionKeyOf(input, definition.id, definition.extractKeyOf(options));
    const cached = extractionCache.get(key);
    if (cached) return cached as EngineExtractionResult<Extracted>;
    const traceResult = getTrace(input);
    const requester = createTraceRequesterFor({ getTrace }, input);
    const result = extractSingle(definition, options, traceResult, interpretationResult, requester);
    extractionCache.set(key, result as EngineExtractionResult<unknown>);
    return result;
  }

  function getSetExtraction<Options, Extracted>(
    members: readonly EngineSetMemberInput[],
    definition: SetAnalyzerDefinition<Options, Extracted>,
    options: Options,
  ): EngineExtractionResult<Extracted> {
    const resolvedMembers: AnalyzerSetMember[] = [];
    const failures: AnalyzerSetMemberFailure[] = [];
    const keyMembers: { readonly target: AnalysisTarget; readonly memberKey: unknown }[] = [];

    for (const member of members) {
      const memberKey = setMemberKeyOf(member);
      if (!member.resolution.ok) {
        failures.push({
          target: member.target,
          kind: member.resolution.error.kind,
          message: describeResolvedInputError(member.resolution.error),
        });
        keyMembers.push({ target: member.target, memberKey });
        continue;
      }
      const input = member.resolution.input;
      const interpretationResult = getInterpretation(input);
      const traceResult = getTrace(input);
      keyMembers.push({ target: member.target, memberKey });
      resolvedMembers.push({
        target: member.target,
        trace: traceResult.trace,
        analysis: interpretationResult.analysis,
        metrics: interpretationResult.metrics,
        // メンバー自身の解決済み入力を土台にする（`AnalyzerSetMember.requestTrace`のコメント
        // 参照。N感度は各メンバーごとに独立したNの掃引が要るため、先頭メンバー等の
        // 代表1件を土台にする窓口では成立しない）。TraceRequesterはキャッシュキーに
        // 含まれない（関数は`stableStringify`で比較できないため。`requestTrace`が返す
        // Trace自体は内部で`getTrace`と同じキャッシュ・同じキーを経由するので、
        // 抽出結果の再現性には影響しない）。
        requestTrace: createTraceRequesterFor({ getTrace }, input),
      });
    }

    const key = setAnalyzerExtractionKeyOf(keyMembers, definition.id, definition.extractKeyOf(options));
    const cached = extractionCache.get(key);
    if (cached) return cached as EngineExtractionResult<Extracted>;

    const result = extractSet(definition, options, resolvedMembers, failures);
    extractionCache.set(key, result as EngineExtractionResult<unknown>);
    return result;
  }

  return {
    getTrace,
    getInterpretation,
    getExtraction,
    getSetExtraction,
    clear() {
      traceCache.clear();
      interpretationCache.clear();
      extractionCache.clear();
    },
    get size() {
      return { trace: traceCache.size, interpretation: interpretationCache.size, extraction: extractionCache.size };
    },
  };
}
