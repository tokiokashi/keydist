import * as v from 'valibot';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import {
  defineOption,
  defineOptions,
  booleanUrlCodec,
  numberUrlCodec,
  picklistUrlCodec,
  stringSetUrlCodec,
  type OptionsValueMap,
} from '#analyzers/options.ts';
import type { BigramSource, FingerClass } from './bigram-vectors.ts';
import {
  MAX_POLAR_DISPLAY_GAIN,
  MIN_POLAR_BANDWIDTH_DEGREES,
} from './movement-profile-scale.ts';

export type KeyboardFlowWeightScale = 'linear' | 'sqrt' | 'log';
export type KeyboardFlowLayerOrder = 'weight' | 'same-hand-top' | 'cross-hand-top';
export type KeyboardFlowHoverScale = 'key' | 'global';

const BIGRAM_SOURCES: readonly BigramSource[] = ['actual', 'within-hand'];
const FINGER_CLASSES: readonly FingerClass[] = ['pinky', 'ring', 'middle', 'index'];
const WEIGHT_SCALES: readonly KeyboardFlowWeightScale[] = ['linear', 'sqrt', 'log'];
const LAYER_ORDERS: readonly KeyboardFlowLayerOrder[] = ['weight', 'same-hand-top', 'cross-hand-top'];
const HOVER_SCALES: readonly KeyboardFlowHoverScale[] = ['key', 'global'];

/** 指の組み合わせ選択（0〜2件）の集合上限。`filterBigramVectors`が0/1/2件だけを想定する。 */
const MAX_SELECTED_FINGERS = 2;

/**
 * 指の組み合わせ選択をdecodeする。壊れた要素だけを落として残りは読む集合系の項目なので
 * `schema`単体（valibotの標準decode）では表現できず、`defineOption`の`decode`を自分で書く
 * （`options.ts`の`OptionDef`コメント参照）。外部キーで引くrecordではなく配列なので
 * `UNSAFE_OBJECT_KEYS`（`#input/codec`）は対象外（`__proto__`等はarray要素として
 * 渡ってきても文字列比較で弾かれるだけで、プロトタイプ汚染の経路にならない）。
 */
function decodeSelectedFingers(
  raw: unknown,
  path: string,
  diagnostics: CodecDiagnostic[],
): readonly FingerClass[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    diagnostics.push({ path, message: '配列でないため既定値へ戻しました' });
    return [];
  }
  const seen = new Set<FingerClass>();
  const result: FingerClass[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && (FINGER_CLASSES as readonly string[]).includes(item) && !seen.has(item as FingerClass)) {
      seen.add(item as FingerClass);
      result.push(item as FingerClass);
    } else {
      diagnostics.push({ path: `${path}[]`, message: `未知の指クラス「${String(item)}」を捨てました` });
    }
  }
  if (result.length > MAX_SELECTED_FINGERS) {
    diagnostics.push({ path, message: `指の組み合わせは${MAX_SELECTED_FINGERS}件までのため、3件目以降を捨てました` });
  }
  return result.slice(0, MAX_SELECTED_FINGERS);
}

/**
 * Bigram Flowの解析設定の宣言。
 *
 * `affects`が抽出キー（`bigramFlowExtractKeyOf`）に乗るかどうかを決める。ここに書き忘れると
 * キャッシュが古い抽出結果を返し続けるので、
 * 「抽出に効くか」は各項目の隣にコメントで理由を書く。
 *
 * - `source`（抽出）: `buildBigramVectors`が実vector/手内vectorのどちらを作るかを決める
 * - `selectedFingers`（抽出）: `filterBigramVectors`がvector集合を絞る。選択順ではなく
 *   集合として効くので`normalizeForExtractKey`でソートし、順序違いの2状態を同じキーへ畳み込む
 * - `polarBandwidth`（抽出）: `directionDensity`のKDE bandwidthそのもの（集計値が変わる）
 * - 残り（`lineScale` `layerOrder` `hoverScale` `polarGain`）は
 *   抽出結果の数値を変えない表示専用の設定（`view`）
 */
export const bigramFlowOptions = defineOptions({
  source: defineOption<BigramSource>({
    schema: v.picklist(BIGRAM_SOURCES),
    default: 'actual',
    affects: 'extract',
    url: picklistUrlCodec('source', BIGRAM_SOURCES),
    label: 'Bigram source',
  }),
  selectedFingers: defineOption<readonly FingerClass[]>({
    decode: decodeSelectedFingers,
    default: [],
    affects: 'extract',
    normalizeForExtractKey: (value) => [...value].sort(),
    url: stringSetUrlCodec('fingers', FINGER_CLASSES, MAX_SELECTED_FINGERS),
    label: 'Fingers',
  }),
  lineScale: defineOption<KeyboardFlowWeightScale>({
    schema: v.picklist(WEIGHT_SCALES),
    default: 'linear',
    affects: 'view',
    url: picklistUrlCodec('lineScale', WEIGHT_SCALES),
    label: '紐の太さ',
  }),
  layerOrder: defineOption<KeyboardFlowLayerOrder>({
    schema: v.picklist(LAYER_ORDERS),
    default: 'weight',
    affects: 'view',
    url: picklistUrlCodec('layerOrder', LAYER_ORDERS),
    label: '重ね順',
  }),
  hoverScale: defineOption<KeyboardFlowHoverScale>({
    schema: v.picklist(HOVER_SCALES),
    default: 'key',
    affects: 'view',
    url: picklistUrlCodec('hoverScale', HOVER_SCALES),
    label: 'ホバー基準',
  }),
  repeatBadge: defineOption<boolean>({
    schema: v.boolean(),
    default: true,
    affects: 'view',
    url: booleanUrlCodec('repeatBadge'),
    label: '連打の回数',
  }),
  polarBandwidth: defineOption<number>({
    schema: v.pipe(v.number(), v.minValue(MIN_POLAR_BANDWIDTH_DEGREES), v.maxValue(45)),
    default: 5,
    affects: 'extract',
    url: numberUrlCodec('polarBandwidth', MIN_POLAR_BANDWIDTH_DEGREES, 45),
    label: '方向の広がり',
  }),
  polarGain: defineOption<number>({
    schema: v.pipe(v.number(), v.minValue(0.25), v.maxValue(MAX_POLAR_DISPLAY_GAIN)),
    default: 1,
    affects: 'view',
    url: numberUrlCodec('polarGain', 0.25, MAX_POLAR_DISPLAY_GAIN),
    label: '方向分布の表示倍率',
  }),
});

/** `Options`型は宣言から推論する（手で二重に書かない）。 */
export type BigramFlowOptions = OptionsValueMap<typeof bigramFlowOptions.items>;

export const DEFAULT_BIGRAM_FLOW_OPTIONS: BigramFlowOptions = bigramFlowOptions.defaultOptions;

/**
 * 既定値と全項目が異なる組（入れ忘れ防止テストの`alternates`）。
 * `defineSingleAnalyzer`の`optionsDiscipline`（`extract.ts`）と、8項目全部を機械的に回す
 * `extract.test.ts`の両方がこれを使う。値そのものはこのファイルにしか無い知識
 * （「妥当な値」の判断）なので、決め方を二重に持たないようここに1箇所だけ置く。
 */
export const ALTERNATE_BIGRAM_FLOW_OPTIONS: BigramFlowOptions = {
  source: 'within-hand',
  selectedFingers: ['index'],
  lineScale: 'sqrt',
  layerOrder: 'same-hand-top',
  hoverScale: 'global',
  repeatBadge: false,
  polarBandwidth: 20,
  polarGain: 2,
};

/**
 * 旧名。`src/legacy/`・`src/features/analyzer-next/`（どちらも切り替え時に消える）が
 * 参照しているので、動き続けるのに必要な別名だけ残す。新コードでは使わない。
 */
export type BigramFlowDisplayConfig = BigramFlowOptions;
export const DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG = DEFAULT_BIGRAM_FLOW_OPTIONS;

/**
 * `AnalyzerDefinition.decodeOptions`（`analyzers/contract.ts`）の実装。宣言（`bigramFlowOptions`）
 * から導く（`defineSingleAnalyzer`が使う本体そのもの）。未知の形式・壊れた値は既定値へ戻し、
 * 診断を積む（例外を投げない）。`extract.test.ts`等が直接importして使えるよう関数としても公開する。
 */
export const decodeBigramFlowOptions = bigramFlowOptions.decodeOptions;

/**
 * `AnalyzerDefinition.extractKeyOf`（`analyzers/contract.ts`）の実装。宣言から導く
 * （`items`ごとの`affects`/`normalizeForExtractKey`を舐めるだけで、ここで個別に
 * 列挙する経路は無い）。
 */
export const bigramFlowExtractKeyOf = bigramFlowOptions.extractKeyOf;

export interface KeyboardFlowVectorLike {
  readonly id: string;
  readonly weight: number;
  readonly distance: number;
  readonly hand: 'left' | 'right' | 'cross';
}

export interface KeyboardFlowOutgoingVectorLike {
  readonly weight: number;
  readonly fromKeyIds: readonly string[];
}

/**
 * hoveredKeyId始点のedgeに限定した最大weightを求める。
 * ホバー中の太さ基準を「そのキーだけ」にする時の分母になる。
 */
export function computeOutgoingMaxWeight(
  vectors: readonly KeyboardFlowOutgoingVectorLike[],
  hoveredKeyId: string | null,
): number {
  if (hoveredKeyId === null) return 0;
  let max = 0;
  for (const vector of vectors) {
    if (!vector.fromKeyIds.includes(hoveredKeyId)) continue;
    if (vector.weight > max) max = vector.weight;
  }
  return max;
}

/**
 * strokeWidthの計算に使う最大weightを、ホバー状態と設定から決める。
 * 「そのキーだけ」設定でも、hoveredKeyIdが始点でないedge（=非表示側で減光中）は
 * 全体基準のまま揺れないようにする。
 */
export function resolveKeyboardFlowMaxWeight(
  vector: KeyboardFlowOutgoingVectorLike,
  globalMaxWeight: number,
  keyMaxWeight: number,
  hoverScale: KeyboardFlowHoverScale,
  hoveredKeyId: string | null,
): number {
  if (hoverScale !== 'key' || hoveredKeyId === null) return globalMaxWeight;
  if (!vector.fromKeyIds.includes(hoveredKeyId)) return globalMaxWeight;
  return keyMaxWeight;
}

export function scaleKeyboardFlowWeight(
  weight: number,
  maxWeight: number,
  scale: KeyboardFlowWeightScale,
): number {
  if (maxWeight <= 0 || weight <= 0) return 0;
  const ratio = Math.min(1, weight / maxWeight);
  if (scale === 'sqrt') return Math.sqrt(ratio);
  if (scale === 'log') return Math.log1p(weight) / Math.log1p(maxWeight);
  return ratio;
}

function layerRank(
  hand: KeyboardFlowVectorLike['hand'],
  order: KeyboardFlowLayerOrder,
): number {
  if (order === 'same-hand-top') return hand === 'cross' ? 0 : 1;
  if (order === 'cross-hand-top') return hand === 'cross' ? 1 : 0;
  return 0;
}

/** 同一キーへ戻るrepeat（物理移動が無い）vectorを除く。KeyboardFlowの線・最大weightはこの集合だけを見る。 */
export function nonStationaryVectors<T extends KeyboardFlowVectorLike>(
  vectors: readonly T[],
): readonly T[] {
  return vectors.filter((vector) => vector.distance >= 1e-6);
}

/**
 * SVGは後から描いたpathが前面になる。
 * group priority -> weight降順 -> stable id の順で並べ、各group内は太い線を先に描き、
 * 細い線を最後（最前面）に描く。太いedgeが細いedgeを覆い隠さないようにするため。
 */
export function orderKeyboardFlowVectors<T extends KeyboardFlowVectorLike>(
  vectors: readonly T[],
  order: KeyboardFlowLayerOrder,
): readonly T[] {
  return [...nonStationaryVectors(vectors)]
    .sort((a, b) =>
      layerRank(a.hand, order) - layerRank(b.hand, order)
      || b.weight - a.weight
      || a.id.localeCompare(b.id));
}
