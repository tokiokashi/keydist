import { isRecord, type CodecDiagnostic } from '#input/codec/index.ts';
import type { BigramSource, FingerClass } from './bigram-vectors.ts';
import {
  MAX_POLAR_DISPLAY_GAIN,
  MIN_POLAR_BANDWIDTH_DEGREES,
  type MovementScaleMode,
} from './movement-profile-scale.ts';

export type KeyboardFlowWeightScale = 'linear' | 'sqrt' | 'log';
export type KeyboardFlowLayerOrder = 'weight' | 'same-hand-top' | 'cross-hand-top';
export type KeyboardFlowHoverScale = 'key' | 'global';

export interface BigramFlowDisplayConfig {
  source: BigramSource;
  selectedFingers: readonly FingerClass[];
  lineScale: KeyboardFlowWeightScale;
  layerOrder: KeyboardFlowLayerOrder;
  hoverScale: KeyboardFlowHoverScale;
  movementScaleMode: MovementScaleMode;
  polarBandwidth: number;
  polarGain: number;
}

export const DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG: BigramFlowDisplayConfig = {
  source: 'actual',
  selectedFingers: [],
  lineScale: 'linear',
  layerOrder: 'weight',
  hoverScale: 'key',
  movementScaleMode: 'fit',
  polarBandwidth: 5,
  polarGain: 1,
};

/**
 * Analyzer契約（#544 §7、`analyzers/contract.ts`）向けの名前。中身は
 * `BigramFlowDisplayConfig`と同一の型で、`BigramFlowDisplayConfig`は
 * `src/legacy/`・`src/features/analyzer-next/`（旧実装・移行中実装、どちらも
 * 新コードからimport禁止）がすでに参照している名前なので、両方が読める型として残す
 * （AGENTS.md「消える側のコードは動き続けるのに必要な分だけ追従させる」）。
 */
export type BigramFlowOptions = BigramFlowDisplayConfig;

const BIGRAM_SOURCES: readonly BigramSource[] = ['actual', 'within-hand'];
const FINGER_CLASSES: readonly FingerClass[] = ['pinky', 'ring', 'middle', 'index'];
const WEIGHT_SCALES: readonly KeyboardFlowWeightScale[] = ['linear', 'sqrt', 'log'];
const LAYER_ORDERS: readonly KeyboardFlowLayerOrder[] = ['weight', 'same-hand-top', 'cross-hand-top'];
const HOVER_SCALES: readonly KeyboardFlowHoverScale[] = ['key', 'global'];
const MOVEMENT_SCALE_MODES: readonly MovementScaleMode[] = ['fit', 'fixed'];

function decodeChoice<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
  path: string,
  diagnostics: CodecDiagnostic[],
): T {
  if (typeof raw === 'string' && (allowed as readonly string[]).includes(raw)) return raw as T;
  if (raw !== undefined) {
    diagnostics.push({ path, message: `未知の値「${String(raw)}」のため既定値へ戻した` });
  }
  return fallback;
}

function decodeNumberInRange(
  raw: unknown,
  min: number,
  max: number,
  fallback: number,
  path: string,
  diagnostics: CodecDiagnostic[],
): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= min && raw <= max) return raw;
  if (raw !== undefined) {
    diagnostics.push({ path, message: `範囲外・不正な数値「${String(raw)}」のため既定値へ戻した` });
  }
  return fallback;
}

/**
 * 指の組み合わせ選択（0〜2件）をdecodeする。外部キーで引くrecordではなく配列なので
 * `UNSAFE_OBJECT_KEYS`（`#input/codec`）は対象外（`__proto__`等はarray要素として
 * 渡ってきても文字列比較で弾かれるだけで、プロトタイプ汚染の経路にならない）。
 */
function decodeSelectedFingers(
  raw: unknown,
  fallback: readonly FingerClass[],
  path: string,
  diagnostics: CodecDiagnostic[],
): readonly FingerClass[] {
  if (raw === undefined) return fallback;
  if (!Array.isArray(raw)) {
    diagnostics.push({ path, message: '配列でないため既定値へ戻した' });
    return fallback;
  }
  const seen = new Set<FingerClass>();
  const result: FingerClass[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && (FINGER_CLASSES as readonly string[]).includes(item) && !seen.has(item as FingerClass)) {
      seen.add(item as FingerClass);
      result.push(item as FingerClass);
    } else {
      diagnostics.push({ path: `${path}[]`, message: `未知の指クラス「${String(item)}」を捨てた` });
    }
  }
  // filterBigramVectors（bigram-vectors.ts）は0/1/2件だけを想定するので、3件目以降は
  // 「選びすぎ」として静かに切り捨てるのではなく診断を残す。
  if (result.length > 2) {
    diagnostics.push({ path, message: `指の組み合わせは2件までのため、3件目以降を捨てた` });
  }
  return result.slice(0, 2);
}

/**
 * `AnalyzerDefinition.decodeOptions`（`analyzers/contract.ts`）の実装。
 * 未知の形式・壊れた値は既定値へ戻し、診断を積む（例外を投げない）。
 */
export function decodeBigramFlowOptions(
  raw: unknown,
  diagnostics: CodecDiagnostic[],
): BigramFlowOptions {
  if (!isRecord(raw)) {
    if (raw !== undefined) diagnostics.push({ path: 'options', message: '未知の形式のため既定値へ戻した' });
    return DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG;
  }
  return {
    source: decodeChoice(raw.source, BIGRAM_SOURCES, DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.source, 'options.source', diagnostics),
    selectedFingers: decodeSelectedFingers(
      raw.selectedFingers,
      DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.selectedFingers,
      'options.selectedFingers',
      diagnostics,
    ),
    lineScale: decodeChoice(raw.lineScale, WEIGHT_SCALES, DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.lineScale, 'options.lineScale', diagnostics),
    layerOrder: decodeChoice(raw.layerOrder, LAYER_ORDERS, DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.layerOrder, 'options.layerOrder', diagnostics),
    hoverScale: decodeChoice(raw.hoverScale, HOVER_SCALES, DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.hoverScale, 'options.hoverScale', diagnostics),
    movementScaleMode: decodeChoice(
      raw.movementScaleMode,
      MOVEMENT_SCALE_MODES,
      DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.movementScaleMode,
      'options.movementScaleMode',
      diagnostics,
    ),
    polarBandwidth: decodeNumberInRange(
      raw.polarBandwidth,
      MIN_POLAR_BANDWIDTH_DEGREES,
      45,
      DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.polarBandwidth,
      'options.polarBandwidth',
      diagnostics,
    ),
    polarGain: decodeNumberInRange(
      raw.polarGain,
      0.25,
      MAX_POLAR_DISPLAY_GAIN,
      DEFAULT_BIGRAM_FLOW_DISPLAY_CONFIG.polarGain,
      'options.polarGain',
      diagnostics,
    ),
  };
}

/**
 * `AnalyzerDefinition.extractKeyOf`（`analyzers/contract.ts`）の実装。
 *
 * 抽出に効くのは3項目だけ（`extract.ts`の分類表参照）:
 * - `source`: `buildBigramVectors`が実vector/手内vectorのどちらを作るかを決める
 * - `selectedFingers`: `filterBigramVectors`がvector集合を絞る
 * - `polarBandwidth`: `directionDensity`のKDE bandwidthそのもの（集計値が変わる）
 *
 * 残り（`lineScale` `layerOrder` `hoverScale` `movementScaleMode` `polarGain`）は
 * 抽出結果の数値を変えない表示専用の設定なので、ここでは含めない
 * （見た目だけの変更ではextractが走らない）。
 * `selectedFingers`は選択順ではなく集合として効く（`filterBigramVectors`参照）ので、
 * 並び替えて正規化し、順序違いの2状態を同じ抽出キーへ畳み込む。
 */
export function bigramFlowExtractKeyOf(options: BigramFlowOptions): unknown {
  return {
    source: options.source,
    selectedFingers: [...options.selectedFingers].sort(),
    polarBandwidth: options.polarBandwidth,
  };
}

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
