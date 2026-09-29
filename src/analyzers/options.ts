import type { BaseIssue, BaseSchema } from 'valibot';
import { decodeField, isRecord, type CodecDiagnostic } from '#input/codec/index.ts';

/**
 * Analyzerの解析設定（Options）を項目ごとの宣言として持つ仕組み（#544 Phase 3
 * 「Analyzerの解析設定を項目ごとの宣言にし、そこから型・既定値・decode・抽出キー・
 * URLの読み書きを導く」）。
 *
 * 手本は`src/input/settings/`（`defineItem`）と`src/engine/settings-items.ts`。カスケードの
 * 項目とは別の軸（Analyzerの解析設定はカスケードに乗らない。#544 §2「解析設定は
 * Analyzerインスタンスの持ち物」）なので型は共有しないが、考え方（宣言から導く・
 * 手で列挙する経路を作らない）は揃える。
 *
 * ここは`analyzers/`直下（契約側）の純粋ファイル。`analyzers`層は`input`をimportしてよい
 * （docs/architecture.md）ので、`#input/codec`のdecodeユーティリティと`valibot`のschema型を
 * そのまま使う。Reactは一切importしない（`.ts`なので`test/architecture-layers.test.ts`の
 * 「純粋な層はReact・DOM・storage・ブラウザAPIを使わない」の対象。URLSearchParamsは
 * ブラウザ専用ではなくNodeにも実装があるプレーンなデータ構造として使うだけで、実際の
 * `window.location`・`history.replaceState`への読み書きはhosts/app側が担う）。
 */

// ---------------------------------------------------------------------------
// 項目の宣言
// ---------------------------------------------------------------------------

export type OptionAffect = 'extract' | 'view';

/**
 * 1項目ぶんのURLとの対応（#544指示書「URLの読み書き」）。
 *
 * `encode`は「既定値と違う時だけ」呼ばれる（`defineOptions`側で既定値比較を行う。
 * #544指示書「既定値と同じ項目はURLに出さない」）ので、実装側は既定値かどうかを
 * 気にしなくてよい。`decode`は診断を自分で積める（`selectedFingers`のように、
 * 一部の要素だけを落として残りを読む集合系の項目があるため。`decodeField`の
 * 「フィールド全体を既定値へ戻す」だけでは表現できない）。
 */
export interface OptionUrlCodec<T> {
  /** URLクエリパラメータ名。 */
  readonly name: string;
  /** `undefined`を返すとそのパラメータ自体を出力しない。 */
  readonly encode: (value: T) => string | undefined;
  /** 壊れていれば診断を積んで`undefined`を返す（呼び出し側はその項目を既定値のまま扱う）。 */
  readonly decode: (raw: string, path: string, diagnostics: CodecDiagnostic[]) => T | undefined;
}

/**
 * カスケードの`SettingItem<T>`（`input/settings/items.ts`）に相当する、Analyzer解析設定の
 * 1項目の宣言。
 *
 * - `schema`か`decode`のどちらかが必須。ほとんどの項目は`schema`（valibot）だけで
 *   十分だが（`decodeField`が「不正なら診断を積んで既定値へ」を担う）、
 *   `selectedFingers`のような「壊れた要素だけ落として残りは読む」集合系の項目は
 *   `schema`単体では表現できないので`decode`を自分で書く
 * - `affects`が`'extract'`の項目だけが`extractKeyOf`に乗る（#544 §7）。ここに書き忘れると
 *   キャッシュが古い抽出結果を返し続ける事故（ユーザーが最も警戒していたもの）に
 *   直結するため、`defineOptions`側の`extractKeyOf`は項目の宣言を必ず全部舐める形にして、
 *   Analyzer側が個別に列挙する経路を作らない
 * - `normalizeForExtractKey`は「集合として効く」項目（選択順ではなく中身の集合が結果を
 *   決める）の正規化（ソート等）を宣言側に持たせるためのフック。無ければ値をそのまま使う
 */
export interface OptionDef<T> {
  readonly schema?: BaseSchema<unknown, T, BaseIssue<unknown>>;
  readonly decode?: (raw: unknown, path: string, diagnostics: CodecDiagnostic[]) => T;
  readonly default: T;
  readonly affects: OptionAffect;
  readonly normalizeForExtractKey?: (value: T) => unknown;
  readonly url?: OptionUrlCodec<T>;
  /** 将来のUI部品生成用の余地（#544指示書「先回りして作らない」ので今回は使わない）。 */
  readonly label?: string;
}

/** 型推論を保つためのヘルパー（`input/settings/items.ts`の`defineItem`と同じ役割）。 */
export function defineOption<T>(def: OptionDef<T>): OptionDef<T> {
  if (def.schema === undefined && def.decode === undefined) {
    throw new Error('defineOption: schema か decode のどちらかが必須');
  }
  return def;
}

export type OptionsRegistry = Readonly<Record<string, OptionDef<any>>>;

/** レジストリから「項目id → 値の型」の写像を作る。`Options`型はこれで決まる（手で二重に書かない）。 */
export type OptionsValueMap<R extends OptionsRegistry> = {
  readonly [K in keyof R]: R[K] extends OptionDef<infer T> ? T : never;
};

// ---------------------------------------------------------------------------
// 宣言から導くもの
// ---------------------------------------------------------------------------

export interface OptionsUrlDecodeResult<V> {
  readonly values: Partial<V>;
  /** URLから読み取った（≒消費した）パラメータ名。呼び出し側がURLから取り除く時に使う。 */
  readonly consumedParamNames: readonly string[];
}

export interface OptionsDefinition<R extends OptionsRegistry> {
  readonly items: R;
  readonly defaultOptions: OptionsValueMap<R>;
  /** 保存された解析設定をdecodeする（`AnalyzerDefinition.decodeOptions`の実体）。 */
  decodeOptions(raw: unknown, diagnostics: CodecDiagnostic[]): OptionsValueMap<R>;
  /** 抽出に効く項目だけを取り出す（`AnalyzerDefinition.extractKeyOf`の実体）。手で列挙する経路は無い。 */
  extractKeyOf(options: OptionsValueMap<R>): unknown;
  /** 既定値と違う項目だけをURLクエリへ書き出す。 */
  encodeOptionsToUrl(options: OptionsValueMap<R>): URLSearchParams;
  /** URLクエリから読める項目だけをdecodeする。無かった項目は`values`に含まれない（既定/現在値のまま）。 */
  decodeOptionsFromUrl(params: URLSearchParams, diagnostics: CodecDiagnostic[]): OptionsUrlDecodeResult<OptionsValueMap<R>>;
}

/** decodeOptionsが積む診断のpathの根（既存のAnalyzer個別実装（bigram-flowの旧`options.ts`等）と揃える）。 */
const OPTIONS_PATH_ROOT = 'options';

/**
 * 項目の宣言（`OptionsRegistry`）から、Options型を推論しつつ`decodeOptions`・
 * `extractKeyOf`・URLの読み書きを1回で作る。
 *
 * ここが「入れ忘れ防止」の核: `extractKeyOf`・`decodeOptions`・URLの読み書きは
 * すべてこの関数が`items`を舐めて機械的に組み立てる。Analyzerごとに書くのは
 * `items`（宣言）だけで、抽出キーへ足す・足さないを個別のAnalyzer実装が手で
 * 判断する経路が無い（AGENTS.md的な「手で二重管理しない」を解析設定にも適用したもの）。
 */
export function defineOptions<R extends OptionsRegistry>(items: R): OptionsDefinition<R> {
  const keys = Object.keys(items) as (keyof R & string)[];
  const defaultOptions = Object.fromEntries(
    keys.map((key) => [key, items[key]!.default] as const),
  ) as OptionsValueMap<R>;

  function decodeOptions(raw: unknown, diagnostics: CodecDiagnostic[]): OptionsValueMap<R> {
    if (!isRecord(raw)) {
      if (raw !== undefined) {
        diagnostics.push({ path: OPTIONS_PATH_ROOT, message: '未知の形式のため既定値へ戻した' });
      }
      return defaultOptions;
    }
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const item = items[key]!;
      const path = `${OPTIONS_PATH_ROOT}.${key}`;
      // `Object.hasOwn`で「そもそもキーがあるか」を先に見る。rawはこのアプリ自身の
      // 解析設定レジストリのキー（"__proto__"等ではあり得ない）でbracketアクセスするだけなので、
      // ここでの参照は安全（`input/settings/codec.ts`の同種コメント参照）。
      const rawValue = Object.hasOwn(raw, key) ? (raw as Record<string, unknown>)[key] : undefined;
      if (item.decode !== undefined) {
        result[key] = item.decode(rawValue, path, diagnostics);
      } else if (rawValue === undefined) {
        // キーが無いこと自体は「上書きが無い」と同じ意味で異常ではないので診断を積まない
        // （`decodeField`をそのまま使うとundefinedでも常に診断を積んでしまうため、ここで分岐する）。
        result[key] = item.default;
      } else {
        result[key] = decodeField(item.schema!, rawValue, item.default, path, diagnostics);
      }
    }
    // 未知の項目id（将来バージョンが足した・削除済みの項目）は診断付きで丸ごと捨てる
    // （`input/settings/codec.ts`の`decodeLevelOverrides`と同じ判断）。
    for (const key of Object.keys(raw)) {
      if (!Object.hasOwn(items, key)) {
        diagnostics.push({
          path: `${OPTIONS_PATH_ROOT}.${key}`,
          message: `未知の項目「${key}」の解析設定を捨てた`,
        });
      }
    }
    return result as OptionsValueMap<R>;
  }

  function extractKeyOf(options: OptionsValueMap<R>): unknown {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const item = items[key]!;
      if (item.affects !== 'extract') continue;
      const value = (options as Record<string, unknown>)[key];
      result[key] = item.normalizeForExtractKey ? item.normalizeForExtractKey(value) : value;
    }
    return result;
  }

  function encodeOptionsToUrl(options: OptionsValueMap<R>): URLSearchParams {
    const params = new URLSearchParams();
    for (const key of keys) {
      const item = items[key]!;
      if (item.url === undefined) continue;
      const value = (options as Record<string, unknown>)[key];
      // 既定値と同じ項目はURLに出さない（#544指示書）。値は`decodeOptions`同様プレーンな
      // JSON値だけを持つ契約なので、構造比較は`JSON.stringify`で足りる
      // （キー順は宣言順で毎回同じなので、`stableStringify`のようなキー順正規化は不要）。
      if (JSON.stringify(value) === JSON.stringify(item.default)) continue;
      const encoded = item.url.encode(value);
      if (encoded === undefined) continue;
      params.set(item.url.name, encoded);
    }
    return params;
  }

  function decodeOptionsFromUrl(
    params: URLSearchParams,
    diagnostics: CodecDiagnostic[],
  ): OptionsUrlDecodeResult<OptionsValueMap<R>> {
    const values: Record<string, unknown> = {};
    const consumedParamNames: string[] = [];
    for (const key of keys) {
      const item = items[key]!;
      if (item.url === undefined) continue;
      const raw = params.get(item.url.name);
      if (raw === null) continue;
      consumedParamNames.push(item.url.name);
      const path = `url.${item.url.name}`;
      const decoded = item.url.decode(raw, path, diagnostics);
      if (decoded === undefined) continue;
      values[key] = decoded;
    }
    return { values: values as Partial<OptionsValueMap<R>>, consumedParamNames };
  }

  return { items, defaultOptions, decodeOptions, extractKeyOf, encodeOptionsToUrl, decodeOptionsFromUrl };
}

// ---------------------------------------------------------------------------
// URL codecの共通部品（picklist・数値範囲・文字列の集合）
// ---------------------------------------------------------------------------

/** 選択肢（picklist）のURL codec。値をそのまま文字列として読み書きする。 */
export function picklistUrlCodec<T extends string>(name: string, allowed: readonly T[]): OptionUrlCodec<T> {
  return {
    name,
    encode: (value) => value,
    decode: (raw, path, diagnostics) => {
      if ((allowed as readonly string[]).includes(raw)) return raw as T;
      diagnostics.push({ path, message: `URLパラメータの値「${raw}」は未知のため捨てた` });
      return undefined;
    },
  };
}

/** 真偽値のURL codec。`true` / `false` で読み書きする。 */
export function booleanUrlCodec(name: string): OptionUrlCodec<boolean> {
  return {
    name,
    encode: (value) => String(value),
    decode: (raw, path, diagnostics) => {
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      diagnostics.push({ path, message: `URLパラメータの値「${raw}」は未知のため捨てた` });
      return undefined;
    },
  };
}

/** 数値範囲のURL codec。 */
export function numberUrlCodec(name: string, min: number, max: number): OptionUrlCodec<number> {
  return {
    name,
    encode: (value) => String(value),
    decode: (raw, path, diagnostics) => {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < min || value > max) {
        diagnostics.push({ path, message: `URLパラメータの値「${raw}」は範囲外・不正のため捨てた` });
        return undefined;
      }
      return value;
    },
  };
}

/**
 * 文字列の集合（順序を持たない・最大件数あり）のURL codec。カンマ区切り。
 * 壊れた要素だけを落として残りは読む（`schema`単体では表現できない集合系項目向け）。
 */
export function stringSetUrlCodec<T extends string>(
  name: string,
  allowed: readonly T[],
  maxCount: number,
): OptionUrlCodec<readonly T[]> {
  return {
    name,
    encode: (value) => (value.length === 0 ? undefined : [...value].join(',')),
    decode: (raw, path, diagnostics) => {
      if (raw === '') return [];
      const seen = new Set<T>();
      const result: T[] = [];
      for (const element of raw.split(',')) {
        if ((allowed as readonly string[]).includes(element) && !seen.has(element as T)) {
          seen.add(element as T);
          result.push(element as T);
        } else {
          diagnostics.push({ path, message: `URLパラメータの要素「${element}」を捨てた` });
        }
      }
      if (result.length > maxCount) {
        diagnostics.push({ path, message: `要素は${maxCount}件までのため超過分を捨てた` });
      }
      return result.slice(0, maxCount);
    },
  };
}

// ---------------------------------------------------------------------------
// 入れ忘れ防止のテストキット（#544指示書「入れ忘れ防止のテスト」）
// ---------------------------------------------------------------------------

/**
 * `findOptionsKeyDisciplineViolations`/`findViewOptionsExtractionViolations`が実際に使う
 * 部分だけを抜き出した形（`OptionsDefinition<R>`はこれを満たす）。横断テスト
 * （`test/analyzer-options-discipline.test.ts`）はAnalyzerの宣言（`R`の具体型）を
 * importできない場所から動的に読み込んだ`AnalyzerDefinition`を検査するため、
 * `items`をジェネリックを消した`OptionsRegistry`のまま持ち回れるよう、この最小形を
 * 別の型として公開する（`contract.ts`の`optionsItems`はこの形で持つ）。
 */
export interface ExtractKeyOfSource<R extends OptionsRegistry> {
  readonly items: R;
  extractKeyOf(options: OptionsValueMap<R>): unknown;
}

/**
 * `affects`の宣言が`extractKeyOf`（抽出キー）の実際の挙動と食い違っている項目のid。
 * 空配列なら「`extract`の項目を変えるとキーが変わり、`view`の項目を変えても変わらない」が
 * 全項目で成り立っている。
 *
 * `sample`と`alternates`は同じキー集合を持つ2組のOptions値で、`alternates[key]`は
 * `sample[key]`と異なる妥当な値であること（呼び出し側が用意する。任意の妥当な値から
 * 機械的に「違う値」を作る汎用の方法は無いため、値そのものはAnalyzerごとのfixtureに委ねる）。
 */
export function findOptionsKeyDisciplineViolations<R extends OptionsRegistry>(
  optionsDef: ExtractKeyOfSource<R>,
  sample: OptionsValueMap<R>,
  alternates: OptionsValueMap<R>,
): readonly string[] {
  const baseKey = JSON.stringify(optionsDef.extractKeyOf(sample));
  const violations: string[] = [];
  for (const key of Object.keys(optionsDef.items)) {
    const variant = { ...sample, [key]: (alternates as Record<string, unknown>)[key] };
    const variantKey = JSON.stringify(optionsDef.extractKeyOf(variant as OptionsValueMap<R>));
    const changed = variantKey !== baseKey;
    const declaredExtract = optionsDef.items[key]!.affects === 'extract';
    if (changed !== declaredExtract) violations.push(key);
  }
  return violations;
}

/**
 * `Map`を含む値でも安定した文字列比較ができるようにするシリアライズ（`Map`はキー順が
 * 挿入順のままで良いのでソートしない。`JSON.stringify`はMapを素通しすると`{}`になり
 * 中身の違いを見落とすため、明示的にentriesへ変換する）。
 */
function serializeForComparison(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (v instanceof Map ? { __map__: [...v.entries()] } : v));
}

/**
 * `affects: 'view'`と宣言した項目を変えても、実際の抽出結果（`extract`の戻り値）が
 * 変わらないことを確認する（#544指示書「誤分類の検出」: `extractKeyOf`のキーは一致するのに
 * 実際の抽出結果は違う、というキャッシュが壊れる誤分類を拾う）。
 *
 * `extract`はAnalyzerのcardinality（single/set）で引数の形が違うため、ここでは
 * 「optionsを渡すと抽出結果を返す関数」まで部分適用した状態で受け取る
 * （呼び出し側が`context`の他のフィールド（trace・analysis・metrics等）を固定する）。
 */
export function findViewOptionsExtractionViolations<R extends OptionsRegistry, Extracted>(
  optionsDef: Pick<ExtractKeyOfSource<R>, 'items'>,
  sample: OptionsValueMap<R>,
  alternates: OptionsValueMap<R>,
  extract: (options: OptionsValueMap<R>) => Extracted,
): readonly string[] {
  const baseSerialized = serializeForComparison(extract(sample));
  const violations: string[] = [];
  for (const key of Object.keys(optionsDef.items)) {
    const item = optionsDef.items[key]!;
    if (item.affects !== 'view') continue;
    const variant = { ...sample, [key]: (alternates as Record<string, unknown>)[key] };
    const variantSerialized = serializeForComparison(extract(variant as OptionsValueMap<R>));
    if (variantSerialized !== baseSerialized) violations.push(key);
  }
  return violations;
}

/**
 * 入れ忘れ防止テストに要る、Analyzer 1つぶんのfixture（#544レビュー対応B）。
 *
 * `defineSingleAnalyzer`/`defineSetAnalyzer`（`contract.ts`）がこれを**必須**の設定として
 * 要求するので、Analyzerを新しく作る側は「宣言（items）は書いたが入れ忘れ防止テストの
 * 材料は用意し忘れた」という状態を型検査の時点で作れない。`sample`/`alternates`は
 * `OptionsValueMap`の全キーが必須（`findOptionsKeyDisciplineViolations`と同じ理由）。
 */
export interface OptionsDisciplineFixture<Options, Extracted> {
  /** 判別の基準点になるOptions値（通常は既定値）。 */
  readonly sample: Options;
  /** `sample`の各項目と異なる妥当な値の組（全キー必須）。 */
  readonly alternates: Options;
  /**
   * optionsだけを受け取り抽出結果を返す関数。Trace等の他の文脈はAnalyzer側で
   * 固定した上で部分適用して渡す（`extract`の引数の形はcardinalityで違うため、
   * ここでは「optionsを渡すと抽出結果が返る」という形まで揃えてもらう）。
   */
  readonly extractForTest: (options: Options) => Extracted;
}

/**
 * `OptionsDisciplineFixture`を使って`findOptionsKeyDisciplineViolations`と
 * `findViewOptionsExtractionViolations`の両方を回す（横断テストが全Analyzerに対して
 * 呼ぶ入口を1つにする）。
 */
export function checkOptionsDiscipline<R extends OptionsRegistry, Extracted>(
  optionsDef: ExtractKeyOfSource<R>,
  fixture: OptionsDisciplineFixture<OptionsValueMap<R>, Extracted>,
): {
  readonly keyViolations: readonly string[];
  readonly viewExtractionViolations: readonly string[];
} {
  return {
    keyViolations: findOptionsKeyDisciplineViolations(optionsDef, fixture.sample, fixture.alternates),
    viewExtractionViolations: findViewOptionsExtractionViolations(
      optionsDef,
      fixture.sample,
      fixture.alternates,
      fixture.extractForTest,
    ),
  };
}
