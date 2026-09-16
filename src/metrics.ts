import { ADJACENT_PAIRS, ALL_FINGERS, dist, type Finger, type Geometry } from './geometry.ts';
import type { Trace } from './evaluate.ts';
import { COMBO_LAYER_ID } from './layouts/types.ts';

/**
 * 隣接ペアのホーム間隔 [u]（仕様 §11.6 で引く基準）。
 * 定数 1u ではなく形状・指割り当てから実際に測る。列ずれのある形状では
 * 隣接ホームの 2 次元距離が 1u をわずかに超えるが、それは指の長さを補正した
 * 姿勢であって「開き」ではないため、超過の 0 点はそちらに置く。
 */
export const homeSpacing = (geometry: Geometry, pair: [Finger, Finger]) =>
  dist(geometry.homes[pair[0]], geometry.homes[pair[1]]);

export interface PairStat {
  pair: [Finger, Finger];
  /** ホーム間隔からの超過の平均 [u]。ホームに並んだ状態が 0。負になりうる */
  meanExcess: number;
  /** 超過の標準偏差 [u]。定数を引いても分布の広がりは変わらないので生の距離と同じ値 */
  stdDev: number;
  /** 超過の実測最大値 [u] */
  maxExcess: number;
}

export interface ComboStats {
  /** 配列に定義されたコンボ見出しの数 */
  definitions: number;
  /** 評価中に一度でも命中したコンボ見出しの数 */
  matched: number;
  /** コンボ見出しが命中した延べ回数 */
  hits: number;
}

export interface LayerStat {
  /** 層の宣言から引いた ID */
  id: string;
  /** 表示用の層名 */
  label: string;
  /** この層に帰属するキー押下数 */
  presses: number;
  /** 層に帰属するキー id → 打鍵回数 */
  keyCounts: Map<string, number>;
  /** 層に帰属するキー id → そのキーへの移動距離の合計 [u] */
  keyDistance: Map<string, number>;
}

export interface Metrics {
  /**
   * 使用した物理形状の id と名前。形状が変わると距離の絶対値が変わるため、
   * 配列間の比較はここが揃っている場合のみ成立する（仕様 §3）。
   */
  geometryId: string;
  geometryName: string;
  /**
   * 使用した指割り当ての id と名前。割り当てが変わると同指連続の数も距離も変わるため、
   * 配列間の比較はここが揃っている場合のみ成立する（仕様 §4.2）。
   */
  fingerAssignmentId: string;
  fingerAssignmentName: string;
  /** 打鍵ステップ数。同時押しは 1 と数える */
  strokes: number;
  /** キー押下数。同時押しは押したキーの数だけ数える */
  presses: number;
  /** 配列に無く打鍵できなかった文字数 */
  skipped: number;
  /** 入力文字数（展開前。仕様 §11.4 の分母） */
  inputChars: number;
  /** 指ごとの総移動距離 [u] */
  perFinger: Record<Finger, number>;
  /** 指ごとの押下数 */
  perFingerPresses: Record<Finger, number>;
  /** 総移動距離 [u] */
  totalUnits: number;
  /** 総移動距離 [mm] */
  totalMm: number;
  /** 1 打鍵あたりの平均移動距離 [u] */
  meanPerStroke: number;
  /**
   * 入力 1 文字あたりの平均移動距離 [u]。
   * 打鍵数はコンボ・かな直接入力で配列ごとに変わるため、`meanPerStroke` では
   * 打鍵数削減の効果が相殺されて消える。分母を展開前の文字数に固定するとここに出る。
   */
  perCharUnits: number;
  /**
   * 入力 1 文字あたりのアクション（ステップ）数（仕様 §11.5）。
   * コンボ・かな直接入力による打鍵数削減の効果はここに直接出る。
   */
  perCharSteps: number;
  /**
   * 入力 1 文字あたりの押下キー数（仕様 §11.5）。
   * コンボは複数キーを 1 ステップにまとめても押すキー自体は減らさないため、
   * `perCharSteps` が下がっても `perCharPresses` は下がらない場合がある。
   */
  perCharPresses: number;
  /** 隣接指間距離の統計。ホーム間隔からの超過で持つ（仕様 §11.6） */
  adjacent: PairStat[];
  /** 同指連続回数。同じ指で異なる位置を続けて打った数 */
  sameFinger: number;
  /** コンボの定義数・命中した定義数・延べ命中回数（仕様 §11.8） */
  combos: ComboStats;
  /** 宣言順の層別集計。コンボ枠は含めない */
  layers: LayerStat[];
  /** コンボ枠に帰属するキー押下数。層の保存則の左辺に加える */
  comboPresses: number;
  /** コンボ枠に帰属するキー id → 打鍵回数 */
  comboKeyCounts: Map<string, number>;
  /** コンボ枠に帰属するキー id → そのキーへの移動距離の合計 [u] */
  comboKeyDistance: Map<string, number>;
  /** キー id → 打鍵回数 */
  keyCounts: Map<string, number>;
  /** キー id → そのキーへの移動距離の合計 [u] */
  keyDistance: Map<string, number>;
}

export function computeMetrics(trace: Trace, geometry: Geometry): Metrics {
  const perFinger = {} as Record<Finger, number>;
  const perFingerPresses = {} as Record<Finger, number>;
  for (const finger of ALL_FINGERS) {
    perFinger[finger] = 0;
    perFingerPresses[finger] = 0;
  }

  let totalUnits = 0;
  let sameFinger = 0;
  const keyCounts = new Map<string, number>();
  const keyDistance = new Map<string, number>();
  const layerStats = trace.layerDefinitions
    .filter((definition) => definition.kind === 'layer')
    .map((definition): LayerStat => ({
      id: definition.id,
      label: definition.label,
      presses: 0,
      keyCounts: new Map(),
      keyDistance: new Map(),
    }));
  const layerById = new Map(layerStats.map((stat) => [stat.id, stat]));
  const ensureLayer = (id: string): LayerStat => {
    const existing = layerById.get(id);
    if (existing) return existing;
    const created: LayerStat = {
      id,
      label: id,
      presses: 0,
      keyCounts: new Map(),
      keyDistance: new Map(),
    };
    layerStats.push(created);
    layerById.set(id, created);
    return created;
  };
  const comboKeyCounts = new Map<string, number>();
  const comboKeyDistance = new Map<string, number>();
  let comboPresses = 0;
  const pairSamples: number[][] = ADJACENT_PAIRS.map(() => []);
  const homeSpacings = ADJACENT_PAIRS.map((pair) => homeSpacing(geometry, pair));

  let presses = 0;
  for (const stroke of trace.strokes) {
    totalUnits += stroke.distance;
    for (const press of stroke.presses) {
      presses += press.keys.length;
      perFinger[press.finger] += press.distance;
      perFingerPresses[press.finger] += press.keys.length;
      if (press.sfb) sameFinger++;
      // 1 本の指で複数キーを押した場合、距離はキーへ均等に按分する
      const share = press.distance / press.keys.length;
      for (const key of press.keys) {
        keyCounts.set(key.id, (keyCounts.get(key.id) ?? 0) + 1);
        keyDistance.set(key.id, (keyDistance.get(key.id) ?? 0) + share);
        if (stroke.layerId === COMBO_LAYER_ID) {
          comboPresses++;
          comboKeyCounts.set(key.id, (comboKeyCounts.get(key.id) ?? 0) + 1);
          comboKeyDistance.set(key.id, (comboKeyDistance.get(key.id) ?? 0) + share);
        } else {
          const layer = ensureLayer(stroke.layerId);
          layer.presses++;
          layer.keyCounts.set(key.id, (layer.keyCounts.get(key.id) ?? 0) + 1);
          layer.keyDistance.set(key.id, (layer.keyDistance.get(key.id) ?? 0) + share);
        }
      }
    }

    ADJACENT_PAIRS.forEach((pair, i) => {
      // そのペアのホーム間隔を引いた超過で溜める（仕様 §11.6）。0 でクランプはしない
      pairSamples[i].push(
        dist(stroke.positions[pair[0]], stroke.positions[pair[1]]) - homeSpacings[i],
      );
    });
  }

  const adjacent = ADJACENT_PAIRS.map((pair, i) => {
    const { mean, stdDev, max } = meanStdDevMax(pairSamples[i]);
    return { pair, meanExcess: mean, stdDev, maxExcess: max };
  });

  const combos = {
    definitions: trace.comboDefinitions,
    matched: new Set(trace.comboHits).size,
    hits: trace.comboHits.length,
  };

  const n = trace.strokes.length;
  const { inputChars } = trace;
  return {
    geometryId: geometry.id,
    geometryName: geometry.name,
    fingerAssignmentId: geometry.assignment.id,
    fingerAssignmentName: geometry.assignment.name,
    strokes: n,
    presses,
    skipped: trace.skipped,
    inputChars,
    perFinger,
    perFingerPresses,
    totalUnits,
    totalMm: totalUnits * geometry.pitchMm,
    meanPerStroke: n ? totalUnits / n : 0,
    perCharUnits: inputChars ? totalUnits / inputChars : 0,
    perCharSteps: inputChars ? n / inputChars : 0,
    perCharPresses: inputChars ? presses / inputChars : 0,
    adjacent,
    sameFinger,
    combos,
    layers: layerStats,
    comboPresses,
    comboKeyCounts,
    comboKeyDistance,
    keyCounts,
    keyDistance,
  };
}

function meanStdDevMax(values: number[]): { mean: number; stdDev: number; max: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0, max: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance), max: Math.max(...values) };
}
