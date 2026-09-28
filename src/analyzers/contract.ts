import type { CodecDiagnostic } from '#input/codec/index.ts';
import type { Geometry } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { Trace, TracePolicy } from '#trace/generate.ts';
import type { AggregatedAnalysisResult } from '#interpretation/structure/aggregate.ts';
import type { Metrics } from '#interpretation/metrics.ts';
import type { OptionsDefinition, OptionsDisciplineFixture, OptionsRegistry, OptionsValueMap } from './options.ts';

// `OptionsRegistry`はこのファイルの型なので再exportして、横断テスト
// （`test/analyzer-options-discipline.test.ts`）が`optionsItems`の型を書けるようにする。
export type { OptionsRegistry } from './options.ts';

/**
 * Analyzerの契約のうち純粋な部分（#544 §7・§9、docs/architecture.md）。
 *
 * ここに置くのは「抽出（extract）・解析設定（Options）・Traceを依頼する窓口の型」だけ。
 * 可視化のcomponentとの結び付けは各Analyzerの `definition.tsx` が行う（このファイルは
 * Reactを一切知らない。`import type` も含めて禁止 — 純粋さは推移的に守る。
 * docs/architecture.md「純粋さは推移的に守る」）。
 *
 * engineはこの契約（`analyzers/` 直下）だけを知り、個別のAnalyzer（`analyzers/<name>/`）を
 * importしない（依存の規則）。逆にこのファイルも個別のAnalyzerへは向かない。
 */

// ---------------------------------------------------------------------------
// 抽出の入力
// ---------------------------------------------------------------------------

/**
 * Traceを依頼する引数。`engine/resolved-input.ts` の `ResolvedInput` を丸ごと渡さない。
 * `ResolvedInput` は engine 層の型で、analyzers はengineをimportできない（依存の規則）ため、
 * Trace生成に実際に要る4フィールドだけをここで複製する（`engine/keys.ts` の `traceKeyOf` が
 * キーに使うフィールドと同じ）。
 */
export interface TraceRequestInput {
  readonly text: string;
  readonly layout: Layout;
  readonly geometry: Geometry;
  readonly tracePolicy: TracePolicy;
}

/**
 * 「Traceを依頼する窓口」（#544 §1 の例外・§7「集合対象とN感度」向け）。
 *
 * N感度のように、1つの抽出がNを振った複数本のTraceを必要とする場合、抽出は
 * このAPIを通じて追加のTraceを依頼する。実装（キャッシュ経由で共有する・
 * 同期で返す）はengine側が持つ（`engine/trace-requester.ts`）。契約はここでは
 * 「同期でTraceが返る窓口」という形だけを決める。
 *
 * 依存の向きは一方向のまま: 抽出がengineを呼び返すのではなく、engineが抽出へ
 * この窓口を渡す（依存性の注入）。
 */
export interface TraceRequester {
  requestTrace(input: TraceRequestInput): Trace;
}

/** 単一Setup対象の抽出に渡す値（#544 §7「単一対象の extract は Trace結果 + 解釈結果 + 抽出に効くoptions」）。 */
export interface SingleAnalyzerExtractContext<Options> {
  readonly trace: Trace;
  readonly analysis: AggregatedAnalysisResult;
  readonly metrics: Metrics;
  readonly options: Options;
  /** N感度など、追加のTraceが要る抽出だけが使う。多くの抽出は無視してよい。 */
  readonly requestTrace: TraceRequester;
}

/** 集合対象の抽出が受け取る、集合の1メンバー分のTrace結果・解釈結果。 */
export interface AnalyzerSetMember {
  readonly setupId: string;
  readonly trace: Trace;
  readonly analysis: AggregatedAnalysisResult;
  readonly metrics: Metrics;
}

/**
 * 集合の1メンバーの解決が失敗した時の値（#544 Phase 3「集合を対象にする最初のAnalyzer」）。
 *
 * 集合対象では、メンバーの一部が失敗（Setup参照切れ・このテキストに使えない配列・
 * 形状を組み立てられない）しても集合全体を`failed`にしない。失敗したメンバーは
 * `members`からは外し、代わりにこの値として`failures`へ積む（#544指示書「メンバーごとの
 * 失敗を値で持つ形を推奨」）。`kind`は`engine/resolved-input.ts`の`ResolvedInputError.kind`と
 * 同じ語彙にするが、`analyzers/contract.ts`（契約側）は`engine`をimportできない
 * （依存の規則）ため、ここでは文字列リテラルとして複製する。表示用の文言
 * （`message`）はengine側（`resolveEngineInput`を呼ぶ側）が組み立てて渡す。
 */
export interface AnalyzerSetMemberFailure {
  readonly setupId: string;
  readonly kind: 'reference' | 'incompatible-text' | 'geometry' | 'setup-missing';
  readonly message: string;
}

/** 集合対象の抽出に渡す値。 */
export interface SetAnalyzerExtractContext<Options> {
  readonly members: readonly AnalyzerSetMember[];
  /** 解決に失敗したメンバー（#544指示書「部分失敗」）。空配列なら全メンバーが解決できている。 */
  readonly failures: readonly AnalyzerSetMemberFailure[];
  readonly options: Options;
  /**
   * N感度など追加のTraceが要る抽出だけが使う（`SingleAnalyzerExtractContext`と同じ役割）。
   * 集合対象では「どのメンバーを基準にするか」が一意に決まらないため、`members`の先頭
   * （解決できた最初のメンバー）のTrace生成条件を土台にする。メンバーが1件も解決できて
   * いない場合はこの窓口を呼ぶと例外になる（#544 Phase 3「決めきれなかった点」として
   * PR本文へ残す: 集合対象のTraceRequesterは当面この単純な規則に留め、メンバーごとの
   * 個別条件が必要になったら窓口の形を見直す）。
   */
  readonly requestTrace: TraceRequester;
}

// ---------------------------------------------------------------------------
// AnalyzerDefinition
// ---------------------------------------------------------------------------

/**
 * `SingleAnalyzerDefinition`/`SetAnalyzerDefinition`の“証”（#544レビュー対応A）。
 *
 * この`unique symbol`はこのモジュールの外へexportしないので、外のコードはこのキーを
 * 持つオブジェクトリテラルを書けない。結果として、この2つの型はオブジェクトリテラルを
 * 手組みして満たすことができず、`defineSingleAnalyzer`/`defineSetAnalyzer`（このファイルの
 * 中でだけこのsymbolを使える）を経由してしか作れなくなる。狙いは`defaultOptions`/
 * `decodeOptions`/`extractKeyOf`を宣言（`options.ts`）からしか得られない状態を
 * 型検査でも強制すること: 手組みで3つを個別に書ける経路が残っていると、
 * 「抽出に効く設定をextractKeyOfへ入れ忘れる」事故がAnalyzerを足すたびに再発しうる。
 */
const ANALYZER_DEFINITION_BRAND: unique symbol = Symbol('AnalyzerDefinition');

/**
 * `AnalyzerDefinition` を対象の種類で2つに分ける（#544 用語集「Analyzerの対象はSetup 1つか
 * Setupの集合」）。1つの型に両方の形を詰め込むと、`cardinality` によって `extract` の引数の
 * 形が変わることをTypeScriptの型で表現しづらくなる（呼び出し側で毎回絞り込みが要る）ため、
 * 判別可能なUnionの片側ずつを別の型として定義し、`AnalyzerDefinition` はその合併にする。
 */
export interface SingleAnalyzerDefinition<Options = unknown, Extracted = unknown> {
  readonly [ANALYZER_DEFINITION_BRAND]: 'single';
  readonly id: string;
  readonly cardinality: 'single';
  readonly defaultOptions: Options;
  /**
   * 保存された解析設定をdecodeする（`#input/codec` の `decodeField` 等と同じ作法。
   * 未知・壊れた値は診断を積んで既定値へ戻す。例外を投げない）。
   */
  decodeOptions(raw: unknown, diagnostics: CodecDiagnostic[]): Options;
  /**
   * 解析設定のうち抽出に効く部分だけを取り出す（#544 §7「解析設定は『抽出に効くもの』と
   * 『見た目だけのもの』をAnalyzerごとに宣言する」）。ここで返した値がそのまま抽出の
   * キャッシュキーへ畳み込まれる（`engine/keys.ts` の `analyzerExtractionKeyOf`）ので、
   * 見た目だけの項目（色・並び順の表示切替等）はここで返り値から外す。
   * それだけで「見た目だけの設定変更では抽出を走らせない」が実現する
   * （engine側で二重に判定しない）。
   */
  extractKeyOf(options: Options): unknown;
  /** 抽出の純関数。Trace・解釈・options以外の外部状態を参照しない。 */
  extract(context: SingleAnalyzerExtractContext<Options>): Extracted;
  /**
   * 入れ忘れ防止テストの材料（#544レビュー対応B）。`defineSingleAnalyzer`が必須で
   * 要求するので、宣言（items）だけ書いてテストの材料を用意し忘れる、という状態を
   * 型検査の時点で作れない。横断テスト（`test/analyzer-options-discipline.test.ts`）が
   * これを使って全Analyzerへ`checkOptionsDiscipline`（`options.ts`）を回す。
   */
  readonly optionsDiscipline: OptionsDisciplineFixture<Options, Extracted>;
  /**
   * 宣言（`options.ts`の`items`）そのもの。ジェネリックを`OptionsRegistry`まで消した形
   * （`OptionsValueMap<R>`が`Options`と一致する保証をこの型だけでは表現できないため）。
   * `test/analyzer-options-discipline.test.ts`が個別のAnalyzerユニットをimportできない
   * 場所（analyzers/直下・engineから）から動的に読み込んだ定義を検査するために使う
   * （`items`の`affects`宣言が要る。`extractKeyOf`は上の`extractKeyOf`をそのまま使う）。
   */
  readonly optionsItems: OptionsRegistry;
}

export interface SetAnalyzerDefinition<Options = unknown, Extracted = unknown> {
  readonly [ANALYZER_DEFINITION_BRAND]: 'set';
  readonly id: string;
  readonly cardinality: 'set';
  readonly defaultOptions: Options;
  decodeOptions(raw: unknown, diagnostics: CodecDiagnostic[]): Options;
  extractKeyOf(options: Options): unknown;
  extract(context: SetAnalyzerExtractContext<Options>): Extracted;
  readonly optionsDiscipline: OptionsDisciplineFixture<Options, Extracted>;
  readonly optionsItems: OptionsRegistry;
}

export type AnalyzerDefinition<Options = unknown, Extracted = unknown> =
  | SingleAnalyzerDefinition<Options, Extracted>
  | SetAnalyzerDefinition<Options, Extracted>;

// ---------------------------------------------------------------------------
// 宣言（options.ts）からAnalyzerDefinitionを組み立てる
// ---------------------------------------------------------------------------

/**
 * `defaultOptions` / `decodeOptions` / `extractKeyOf`を`OptionsDefinition`（`options.ts`。
 * 項目ごとの宣言）から導いて`SingleAnalyzerDefinition`を組み立てる。#544指示書
 * 「Analyzerが手書きで上書きできる口は作らない」: この3つを個別に上書きする引数は
 * 存在しない。Analyzer実装が書くのは`id`・`options`（宣言）・`extract`・
 * `optionsDiscipline`（入れ忘れ防止テストの材料。#544レビュー対応B）だけ。
 * `optionsDiscipline`は省略できない必須のconfigフィールドなので、宣言（items）は
 * 書いたがテストの材料を用意し忘れる、という状態を型検査で防ぐ。
 */
export function defineSingleAnalyzer<R extends OptionsRegistry, Extracted>(config: {
  readonly id: string;
  readonly options: OptionsDefinition<R>;
  readonly extract: (context: SingleAnalyzerExtractContext<OptionsValueMap<R>>) => Extracted;
  readonly optionsDiscipline: OptionsDisciplineFixture<OptionsValueMap<R>, Extracted>;
}): SingleAnalyzerDefinition<OptionsValueMap<R>, Extracted> {
  return {
    [ANALYZER_DEFINITION_BRAND]: 'single',
    id: config.id,
    cardinality: 'single',
    defaultOptions: config.options.defaultOptions,
    decodeOptions: config.options.decodeOptions,
    extractKeyOf: config.options.extractKeyOf,
    extract: config.extract,
    optionsDiscipline: config.optionsDiscipline,
    optionsItems: config.options.items,
  };
}

/** `defineSingleAnalyzer`の集合対象版。 */
export function defineSetAnalyzer<R extends OptionsRegistry, Extracted>(config: {
  readonly id: string;
  readonly options: OptionsDefinition<R>;
  readonly extract: (context: SetAnalyzerExtractContext<OptionsValueMap<R>>) => Extracted;
  readonly optionsDiscipline: OptionsDisciplineFixture<OptionsValueMap<R>, Extracted>;
}): SetAnalyzerDefinition<OptionsValueMap<R>, Extracted> {
  return {
    [ANALYZER_DEFINITION_BRAND]: 'set',
    id: config.id,
    cardinality: 'set',
    defaultOptions: config.options.defaultOptions,
    decodeOptions: config.options.decodeOptions,
    extractKeyOf: config.options.extractKeyOf,
    extract: config.extract,
    optionsDiscipline: config.optionsDiscipline,
    optionsItems: config.options.items,
  };
}

// ---------------------------------------------------------------------------
// AnalyzerInstance
// ---------------------------------------------------------------------------

/**
 * ペインに置かれた1個のAnalyzerが見る対象（#544 用語集）。
 *
 * 今回は最小形: Setup idを1つ持つか、Setup idの集合を直接持つかだけを表す。
 * Workspace（#544 §6）の「Workspaceに従う / 固定」はまだここに無い
 * （host/Workspace未着手のため、この作業単位の対象外）。
 * 将来足す時は `kind` を増やす形を想定する（例: `{ kind: 'follows-workspace' }`）。
 * PR本文に決めきれなかった点として残す。
 */
export type AnalyzerTarget =
  | { readonly kind: 'setup'; readonly setupId: string }
  | { readonly kind: 'setups'; readonly setupIds: readonly string[] };

/** ペインに置かれた1個のAnalyzer（#544 用語集の「Analyzerインスタンス」）。 */
export interface AnalyzerInstance<Options = unknown> {
  readonly id: string;
  readonly definitionId: string;
  readonly options: Options;
  readonly target: AnalyzerTarget;
}
