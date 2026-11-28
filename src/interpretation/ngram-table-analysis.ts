import type { Geometry } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import { hasConvertibleKatakana, prepareEvaluationText } from '#input/text/evaluation-text.ts';
import type { SegmenterInfo } from '#input/text/segmentation.ts';
import { generateTrace, uncoveredTextPositions, type CenterShiftThumb, type SpaceThumb, type TracePolicy } from '#trace/generate.ts';
import { BUNSETSU_KEY_SEPARATOR, sufficientOrder, type OrderSufficiency } from './corpus-ngram.ts';

/**
 * 文節のn-gramの表の項目を打鍵して集計する解析（定義は`spec/distance-model.md` §13）。
 * 項目ごとに、すべての指をホームに置いた状態から文脈の文節を打ち、続けて最後の文節を打って、最後の文節の距離を出現回数の重みで足す。
 * 先読みは文節の数で数える（§13.3）。
 */

/** 文節で数える先読みの、選べる範囲と既定値（仕様 §13.3）。表の次数によらない。 */
export const BUNSETSU_LOOKAHEAD = { min: 1, max: 8, default: 2 } as const;

/** 分布で出す分位点。重みの累積が`⌈q · W⌉`に達する最初の値（補間しない）。 */
export const DISTRIBUTION_LEVELS = [0.1, 0.25, 0.5, 0.75, 0.9] as const;

/** 表の元のテキストの出どころ。結果に併記する条件（仕様 §13.6）で、計算には使わない。 */
export interface TableSource {
  /** 標準のコーパスか利用者のテキストか */
  readonly kind: 'corpus' | 'user-text';
  /** 表の元のテキストの名前。標準のコーパスなら作品名と版が分かる文字列 */
  readonly name: string;
  /** 標準のコーパスの版を決める取得元のファイル名とsha256。利用者のテキストでは持たない */
  readonly archive?: { readonly fileName: string; readonly sha256: string };
  /** 文節の区切りの出どころ。分割器を使ったなら分割器の名前と版、利用者が指定したなら`user` */
  readonly segmentation: { readonly origin: 'splitter'; readonly splitter: SegmenterInfo } | { readonly origin: 'user' };
  /** 読みへの変換器と辞書。読みに変換しないテキストはnull */
  readonly reading: { readonly library: SegmenterInfo; readonly dictionary: SegmenterInfo } | null;
}

/** 解析に使う配列と物理配列。`layout`はローマ字入力ならローマ字の表を持つ最終形（`ResolvedInput.layout`）を渡す。 */
export interface TableAnalysisSetup {
  readonly layout: Layout;
  readonly geometry: Geometry;
  /** `windowSize`は読まない。先読みは`lookahead`で渡す */
  readonly tracePolicy: TracePolicy;
  /** ローマ字入力に使った綴り規則の識別子。かな直接入力はnull */
  readonly romajiRuleId: string | null;
}

/** 結果に併記する、測定の条件（仕様 §13.6）。 */
export interface TableAnalysisConditions {
  /** 表の次数 */
  readonly order: number;
  /** 先読みの数と、その単位 */
  readonly lookahead: { readonly unit: 'bunsetsu'; readonly value: number };
  readonly source: TableSource;
  readonly layoutId: string;
  readonly romajiRuleId: string | null;
  readonly shapeId: string;
  readonly fingerAssignmentId: string;
  readonly sfbHomeCost: boolean;
  readonly centerShiftThumb: CenterShiftThumb;
  readonly spaceThumb: SpaceThumb;
}

/** 重みを付けた値の分布。 */
export interface WeightedDistribution {
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  /** `DISTRIBUTION_LEVELS`の順 */
  readonly quantiles: readonly { readonly level: number; readonly value: number }[];
}

export interface TableAnalysis {
  readonly conditions: TableAnalysisConditions;
  /** 項目の数`E` */
  readonly entries: number;
  /** 出現数`W`（項目の出現回数の合計） */
  readonly occurrences: number;
  /** 総移動距離`D` [u]。最後の文節の距離を出現回数の重みで足した値 */
  readonly totalDistance: number;
  /** 入力かな数`C`。最後の文節のかな数を出現回数の重みで足した値 */
  readonly chars: number;
  /** 打てなかった文字`S`。最後の文節の範囲にあるものを出現回数の重みで足した値 */
  readonly skipped: number;
  /** 入力1かなあたりの移動距離 [u]。`C`が0ならundefined */
  readonly perChar: number | undefined;
  /** 文節の移動距離の分布。項目が無ければundefined */
  readonly distanceDistribution: WeightedDistribution | undefined;
  /** 文節の移動距離を、文節の長さ（かな数）で割った値の分布。項目が無ければundefined */
  readonly perCharDistribution: WeightedDistribution | undefined;
}

/**
 * 選べる表の次数（仕様 §13.5）。0次から、足りている最大の次数まで。足りている次数が無ければ0次だけ。
 * 0次は判定の量が決まらないので、判定の対象にせず、常に選べる。
 */
export function selectableOrders(sufficiency: readonly OrderSufficiency[]): number[] {
  const highest = sufficientOrder(sufficiency) ?? 0;
  return Array.from({ length: highest + 1 }, (_, order) => order);
}

/** 表の次数の既定。選べる次数の最大（仕様 §13.5）。 */
export function defaultTableOrder(sufficiency: readonly OrderSufficiency[]): number {
  return sufficientOrder(sufficiency) ?? 0;
}

/**
 * 重みを付けた値の分布。分位点は、値を小さい順に並べ、重みの累積が`⌈q · W⌉`に達する最初の値。
 * 値と重みは同じ長さで、重みは正の整数。空ならundefined。
 */
export function weightedDistribution(values: readonly number[], weights: readonly number[]): WeightedDistribution | undefined {
  if (values.length !== weights.length) throw new Error('値と重みの長さが違う');
  if (values.length === 0) return undefined;
  const order = values.map((_, index) => index).sort((a, b) => values[a]! - values[b]! || a - b);
  let total = 0;
  let weightedSum = 0;
  for (const index of order) {
    total += weights[index]!;
    weightedSum += values[index]! * weights[index]!;
  }
  const quantiles: { level: number; value: number }[] = [];
  for (const level of DISTRIBUTION_LEVELS) {
    const target = Math.ceil(level * total - 1e-9);
    let cumulative = 0;
    for (const index of order) {
      cumulative += weights[index]!;
      if (cumulative >= target) {
        quantiles.push({ level, value: values[index]! });
        break;
      }
    }
  }
  return { min: values[order[0]!]!, max: values[order.at(-1)!]!, mean: weightedSum / total, quantiles };
}

/** 項目の1つ分。`distance`は最後の文節の距離、`length`は最後の文節のかな数。 */
interface EntryResult {
  readonly distance: number;
  readonly length: number;
  readonly skipped: number;
}

/**
 * 表の項目`units`（文節の読みの並び）を、すべての指をホームに置いた状態から打ち、最後の文節の距離を返す（仕様 §13.1）。
 * `lookahead`は文節で数える先読み`N`（仕様 §13.3）。
 */
export function analyzeTableEntry(units: readonly string[], setup: TableAnalysisSetup, lookahead: number): EntryResult {
  const { layout, geometry, tracePolicy } = setup;
  const lengths = units.map((unit) => [...unit].length);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const lastStart = total - lengths.at(-1)!;
  const boundaries: number[] = [];
  let offset = 0;
  for (const length of lengths.slice(0, -1)) {
    offset += length;
    boundaries.push(offset);
  }
  let text = units.join('');
  // 片仮名の書き換えは配列の見出しで決まる。1文字を1文字に直すので、文節の範囲は変わらない
  if (hasConvertibleKatakana(text)) {
    text = prepareEvaluationText(text, {
      language: 'ja',
      keepSymbols: true,
      keepAlphanumerics: true,
      layoutHasChar: (char) => layout.canonicalInputs.has(char),
      uncoveredPositions: (prepared) => uncoveredTextPositions(prepared, layout),
    });
    if ([...text].length !== total) throw new Error('片仮名の書き換えで文字数が変わった');
  }
  const trace = generateTrace(text, layout, geometry, { ...tracePolicy, windowSize: lookahead - 1 }, undefined, [], [], boundaries);
  let distance = 0;
  for (const stroke of trace.strokes) if (stroke.kanaEnd >= lastStart) distance += stroke.distance;
  let skipped = 0;
  for (const position of trace.skippedPositions) if (position >= lastStart) skipped++;
  return { distance, length: lengths.at(-1)!, skipped };
}

/**
 * 次数`order`の、文節の読みの系列の表（鍵は文節の読みを`BUNSETSU_KEY_SEPARATOR`でつないだ文字列）の全項目を解析する（仕様 §13）。
 * 選べる次数の上限（§13.5）は検査しない。呼び出し側が`selectableOrders`で決める。
 */
export function analyzeNgramTable(
  table: ReadonlyMap<string, number>,
  order: number,
  setup: TableAnalysisSetup,
  lookahead: number,
  source: TableSource,
): TableAnalysis {
  if (!Number.isInteger(lookahead) || lookahead < BUNSETSU_LOOKAHEAD.min || lookahead > BUNSETSU_LOOKAHEAD.max) {
    throw new Error(`文節の先読みは${BUNSETSU_LOOKAHEAD.min}以上${BUNSETSU_LOOKAHEAD.max}以下の整数: ${lookahead}`);
  }
  // `N`を`k+1`より大きくしても、結果は`k+1`と同じ（仕様 §13.3）。同じ計算を2度しないために丸める
  const effective = Math.min(lookahead, order + 1);
  const distances: number[] = [];
  const perChars: number[] = [];
  const weights: number[] = [];
  let occurrences = 0;
  let totalDistance = 0;
  let chars = 0;
  let skipped = 0;
  for (const [key, count] of table) {
    const units = key.split(BUNSETSU_KEY_SEPARATOR);
    if (units.length !== order + 1) throw new Error(`次数${order}の表の鍵が${units.length}文節: ${JSON.stringify(key)}`);
    const result = analyzeTableEntry(units, setup, effective);
    occurrences += count;
    totalDistance += count * result.distance;
    chars += count * result.length;
    skipped += count * result.skipped;
    distances.push(result.distance);
    perChars.push(result.distance / result.length);
    weights.push(count);
  }
  const { tracePolicy } = setup;
  return {
    conditions: {
      order,
      lookahead: { unit: 'bunsetsu', value: lookahead },
      source,
      layoutId: setup.layout.id,
      romajiRuleId: setup.romajiRuleId,
      shapeId: setup.geometry.id,
      fingerAssignmentId: setup.geometry.assignment.id,
      sfbHomeCost: tracePolicy.sfbHomeCost,
      centerShiftThumb: tracePolicy.centerShiftThumb ?? 'right',
      spaceThumb: tracePolicy.spaceThumb ?? 'right',
    },
    entries: table.size,
    occurrences,
    totalDistance,
    chars,
    skipped,
    perChar: chars === 0 ? undefined : totalDistance / chars,
    distanceDistribution: weightedDistribution(distances, weights),
    perCharDistribution: weightedDistribution(perChars, weights),
  };
}
