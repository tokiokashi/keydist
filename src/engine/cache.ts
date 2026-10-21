import type { AnalyzerSetMember, AnalyzerSetMemberFailure, SetAnalyzerDefinition, SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import type { AnalysisTarget } from '#input/setup/index.ts';
import { stableStringify } from './cache-key.ts';
import { LruCache } from './lru-cache.ts';
import { basisIdOf, interpretationKeyOf, setAnalyzerExtractionKeyOf, setKeyMemberOf, setMemberKeyOf, singleExtractionKeyOf, traceKeyOf } from './keys.ts';
import {
  computeEngineKeyDetails,
  extractSet,
  extractSingle,
  generateEngineTrace,
  interpretEngineTrace,
  type EngineExtractionResult,
  type EngineInterpretationResult,
  type EngineKeyDetailsResult,
  type EngineTraceResult,
} from './pipeline.ts';
import type { EngineSetMemberInput } from './request.ts';
import type { ResolvedInput } from './resolved-input.ts';
import { describeResolvedInputError } from './resolved-input-errors.ts';
import { createTraceRequesterFor } from './trace-requester.ts';

/**
 * 表示中のSetupだけを計算する前提なので大きくしなくてよい。
 * 1タブで同時に開くペイン・比較対象の目安として32を既定にする。
 * 上限を超えたら最も長く参照されていないキーを1件だけ捨てる（LRU）。
 */
const DEFAULT_MAX_ENTRIES = 32;

/**
 * 部分結果の既定の最大件数。1件は数値の組で小さいので、Traceより大きく取る。
 * N感度の既定のWorkspace（7配列 × 11通りのN）の77件に、条件を替えた分の余裕を足した値。
 */
const DEFAULT_MAX_PART_ENTRIES = 1024;

export interface EngineCacheOptions {
  /** Traceキャッシュの最大保持件数。省略時は`DEFAULT_MAX_ENTRIES`。 */
  readonly maxTraceEntries?: number;
  /** 解釈キャッシュの最大保持件数。省略時は`DEFAULT_MAX_ENTRIES`。 */
  readonly maxInterpretationEntries?: number;
  /** 抽出キャッシュの最大保持件数。省略時は`DEFAULT_MAX_ENTRIES`。 */
  readonly maxExtractionEntries?: number;
  /** キーの詳細のキャッシュの最大保持件数。省略時は`DEFAULT_MAX_ENTRIES`。 */
  readonly maxKeyDetailsEntries?: number;
  /** 集合の抽出が覚える部分結果（`AnalyzerSetMember.remember`）の最大保持件数。省略時は`DEFAULT_MAX_PART_ENTRIES`。 */
  readonly maxPartEntries?: number;
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
   * キーの詳細（仕様 §11.11）をTraceのキーで引く。無ければ計算して積む。
   * 同じTrace（と物理配列）を見る抽出どうし（ヒートマップとBigram Flow等）は、抽出の `keyDetails()` を通して
   * 1回の計算を共有する。
   */
  getKeyDetails(input: ResolvedInput): EngineKeyDetailsResult;
  /**
   * 単一Setup対象のAnalyzerの抽出を、抽出のキー（解釈のキー + Analyzer id +
   * 抽出に効くoptions）で引く。無ければ解釈（さらにその中でTrace）まで遡って計算し、
   * 積む。同じ抽出のキーを要求する2つのAnalyzerインスタンスは1回しか`extract`を
   * 呼ばない（複数のAnalyzerが同じ抽出を使う場合も1回で済む、の
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
   * 集合対象のAnalyzerの抽出。`members`は集合の各枠（配列かSetup）の解決済み
   * 入力（または解決失敗）を、表示順のまま渡す（`setAnalyzerExtractionKeyOf`のコメント
   * 参照: 順序込みでキャッシュキーに畳み込む）。
   *
   * 解決できたメンバーのTrace・解釈は`getTrace`/`getInterpretation`と同じキャッシュを
   * 共有する（同じ中身のSetupを含む集合を2つ作っても、共通するSetupの計算は1回で済む）。
   * 解決に失敗したメンバーは`AnalyzerDefinition.extract`へ渡す`members`からは外し、
   * `failures`として渡す。
   */
  getSetExtraction<Options, Extracted>(
    members: readonly EngineSetMemberInput[],
    definition: SetAnalyzerDefinition<Options, Extracted>,
    options: Options,
  ): EngineExtractionResult<Extracted>;
  /**
   * 集合の抽出を小さい段に分けて先に求める（`SetAnalyzerWarmup`）。`member`1件の`step`番目の段だけを求め、
   * 結果は部分結果として覚える。後の`getSetExtraction`が同じメンバーの部分結果を読むので、
   * 抽出の値は段を先に求めても求めなくても同じ。メンバーの解決に失敗している時、Analyzerが段を持たない時は何もしない。
   */
  warmSetMember<Options, Extracted>(member: EngineSetMemberInput, definition: SetAnalyzerDefinition<Options, Extracted>, step: number): void;
  /** 計算結果は永続化しない。明示的に空にする時だけ使う。 */
  clear(): void;
  readonly size: {
    readonly trace: number;
    readonly interpretation: number;
    readonly extraction: number;
    readonly keyDetails: number;
    readonly parts: number;
  };
}

/**
 * メモリ上のキャッシュ。永続化はしない。
 *
 * 非同期化への備え: ここでは同期のまま「依頼したら即座に
 * 値が返る」形にしているが、`getTrace` / `getInterpretation` の中身
 * （キーを作る → キャッシュを引く → 無ければ`pipeline.ts`の純関数を呼ぶ）は
 * そのまま「非同期の依頼を受けて、キャッシュに無ければ計算をキューへ積む」処理に
 * 置き換えられる形にしてある。呼び出し側（Analyzer等）が今のうちから
 * `cache.getTrace(input)` を「結果を求める窓口」として扱っておけば、次の作業単位で
 * この関数の戻り値をPromiseや購読オブジェクトに変えるだけで移行できる。
 */
export function createEngineCache(options: EngineCacheOptions = {}): EngineCache {
  const traceCache = new LruCache<string, EngineTraceResult>(options.maxTraceEntries ?? DEFAULT_MAX_ENTRIES);
  const interpretationCache = new LruCache<string, EngineInterpretationResult>(options.maxInterpretationEntries ?? DEFAULT_MAX_ENTRIES);
  const keyDetailsCache = new LruCache<string, EngineKeyDetailsResult>(options.maxKeyDetailsEntries ?? DEFAULT_MAX_ENTRIES);
  // 値の型はAnalyzerごとに違うので`unknown`で持ち、`getExtraction`の呼び出し側の
  // ジェネリックで絞り込む（このファイル内では中身の型を知らないまま扱う）。
  const extractionCache = new LruCache<string, EngineExtractionResult<unknown>>(options.maxExtractionEntries ?? DEFAULT_MAX_ENTRIES);
  const partCache = new LruCache<string, unknown>(options.maxPartEntries ?? DEFAULT_MAX_PART_ENTRIES);
  // 部分結果のキーにメンバーの中身（テキストと配列を含む長い文字列）を毎回入れると、部分結果の件数ぶんだけ長い文字列を持つ。
  // 中身は番号に置き換えて持つ。番号は使い回さないので、番号の記録が追い出された後に同じ中身が来ても、古い部分結果を引かない。
  const partOwnerIds = new LruCache<string, number>(DEFAULT_MAX_ENTRIES * 2);
  let nextPartOwnerId = 1;

  function partOwnerIdOf(ownerKey: string): number {
    const known = partOwnerIds.get(ownerKey);
    if (known !== undefined) return known;
    const id = nextPartOwnerId++;
    partOwnerIds.set(ownerKey, id);
    return id;
  }

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

  function getKeyDetails(input: ResolvedInput): EngineKeyDetailsResult {
    // 物理配列は指の割当を含んだ形でTraceのキーに入っているので、Traceのキーだけで決まる
    const key = traceKeyOf(input);
    const cached = keyDetailsCache.get(key);
    if (cached) return cached;
    const result = computeEngineKeyDetails(getTrace(input), input);
    keyDetailsCache.set(key, result);
    return result;
  }

  function getExtraction<Options, Extracted>(
    input: ResolvedInput,
    definition: SingleAnalyzerDefinition<Options, Extracted>,
    options: Options,
  ): EngineExtractionResult<Extracted> {
    const interpretationResult = getInterpretation(input);
    const key = singleExtractionKeyOf(input, definition, options);
    const cached = extractionCache.get(key);
    if (cached) return cached as EngineExtractionResult<Extracted>;
    const traceResult = getTrace(input);
    const requester = createTraceRequesterFor({ getTrace }, input);
    const result = extractSingle(
      definition,
      options,
      traceResult,
      interpretationResult,
      requester,
      () => getKeyDetails(input).keyDetails,
      input,
      basisIdOf(input),
    );
    extractionCache.set(key, result as EngineExtractionResult<unknown>);
    return result;
  }

  /**
   * 追加のTraceを求める窓口。`getTrace`と違い、無ければ作って返すだけで、キャッシュには積まない。
   * N感度は1メンバーにつきNの数だけTraceを作るが、そのTraceは1度読んだら使わない。積むと、
   * 比較表などが共有するTraceを追い出して、後で作り直しになる。
   */
  function getTraceWithoutStoring(input: ResolvedInput): EngineTraceResult {
    return traceCache.get(traceKeyOf(input)) ?? generateEngineTrace(input);
  }

  /** 集合の解決できたメンバー1件。`memberKey`は部分結果の入れ物を、メンバーの中身ごとに分けるのに使う。 */
  function buildSetMember(target: AnalysisTarget, input: ResolvedInput, memberKey: unknown, definitionId: string): AnalyzerSetMember {
    const interpretationResult = getInterpretation(input);
    const traceResult = getTrace(input);
    const partPrefix = String(partOwnerIdOf(stableStringify({ memberKey, definitionId })));
    return {
      target,
      text: input.text,
      trace: traceResult.trace,
      analysis: interpretationResult.analysis,
      metrics: interpretationResult.metrics,
      assets: input.extractionAssets,
      // メンバー自身の解決済み入力を土台にする（`AnalyzerSetMember.requestTrace`のコメント
      // 参照。N感度は各メンバーごとに独立したNの掃引が要るため、先頭メンバー等の
      // 代表1件を土台にする窓口では成立しない）。TraceRequesterはキャッシュキーに
      // 含まれない（関数は`stableStringify`で比較できないため。`requestTrace`が返す
      // Traceは、積んであれば`getTrace`と同じキーで引くので、
      // 抽出結果の再現性には影響しない）。
      requestTrace: createTraceRequesterFor({ getTrace: getTraceWithoutStoring }, input),
      remember<T>(key: string, compute: () => T): T {
        const partKey = `${partPrefix}\u0000${key}`;
        const known = partCache.get(partKey);
        if (known !== undefined) return known as T;
        const value = compute();
        partCache.set(partKey, value);
        return value;
      },
    };
  }

  function warmSetMember<Options, Extracted>(member: EngineSetMemberInput, definition: SetAnalyzerDefinition<Options, Extracted>, step: number): void {
    const warmup = definition.warmup;
    if (warmup === undefined || !member.resolution.ok) return;
    warmup.run(buildSetMember(member.target, member.resolution.input, setMemberKeyOf(member), definition.id), step);
  }

  function getSetExtraction<Options, Extracted>(
    members: readonly EngineSetMemberInput[],
    definition: SetAnalyzerDefinition<Options, Extracted>,
    options: Options,
  ): EngineExtractionResult<Extracted> {
    const resolvedMembers: AnalyzerSetMember[] = [];
    const failures: AnalyzerSetMemberFailure[] = [];
    const keyMembers: { readonly target: AnalysisTarget; readonly memberKey: unknown; readonly assetsKey?: unknown }[] = [];

    for (const member of members) {
      const memberKey = setMemberKeyOf(member);
      if (!member.resolution.ok) {
        failures.push({
          target: member.target,
          kind: member.resolution.error.kind,
          message: describeResolvedInputError(member.resolution.error),
        });
        keyMembers.push(setKeyMemberOf(member, definition, options));
        continue;
      }
      keyMembers.push(setKeyMemberOf(member, definition, options));
      resolvedMembers.push(buildSetMember(member.target, member.resolution.input, memberKey, definition.id));
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
    getKeyDetails,
    getExtraction,
    getSetExtraction,
    warmSetMember,
    clear() {
      traceCache.clear();
      interpretationCache.clear();
      extractionCache.clear();
      keyDetailsCache.clear();
      partCache.clear();
      partOwnerIds.clear();
    },
    get size() {
      return {
        trace: traceCache.size,
        interpretation: interpretationCache.size,
        extraction: extractionCache.size,
        keyDetails: keyDetailsCache.size,
        parts: partCache.size,
      };
    },
  };
}
