import { ADJACENT_PAIRS, ALL_FINGERS, dist, type Finger, type Geometry } from './geometry.ts';
import type { Stroke, Trace } from './evaluate.ts';
import { DEFAULT_CHAIN_POLICY, type ChainPolicy } from './analysis-chain.ts';
import { DEFAULT_ARPEGGIO_POLICY, type ArpeggioPolicy } from './analysis-arpeggio.ts';
import { COMBO_LAYER_ID, SINGLE_LAYER_ID } from './layouts/types.ts';
import {
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  type ActionRealizationPolicy,
  type TriggerRealizationPolicy,
} from './core/semantic-input/index.ts';

/**
 * 隣接ペアのホーム間隔 [u]（仕様 §11.6で引く基準）。
 * 定数1uではなく形状・指割り当てから実際に測る。列ずれのある形状では
 * 隣接ホームの2次元距離が1uをわずかに超えるが、それは指の長さを補正した
 * 姿勢であって「開き」ではないため、超過の0点はそちらに置く。
 */
export const homeSpacing = (geometry: Geometry, pair: [Finger, Finger]) =>
  dist(geometry.homes[pair[0]], geometry.homes[pair[1]]);

export interface PairStat {
  pair: [Finger, Finger];
  /** ホーム間隔からの超過の平均 [u]。ホームに並んだ状態が0。負になりうる */
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
  /** 層の宣言から引いたID */
  id: string;
  /** 表示用の層名 */
  label: string;
  /** この層に帰属するキー押下数 */
  presses: number;
  /** 層に帰属するキーid → 打鍵回数 */
  keyCounts: Map<string, number>;
  /** 層に帰属するキーid → そのキーへの移動距離の合計 [u] */
  keyDistance: Map<string, number>;
  /** 層操作として押したキーid → 打鍵回数。出力としての押下とは分けて持つ */
  triggerKeyCounts: Map<string, number>;
  /** 同じ層の文字トリガーを複数同時押下したキーid → 打鍵回数 */
  pairedTriggerKeyCounts: Map<string, number>;
}

export interface Metrics {
  /**
   * 使用した物理形状のidと名前。形状が変わると距離の絶対値が変わるため、
   * どの形状で測ったかを数値と一緒に運ぶ（仕様 §3・§12.3）。
   */
  geometryId: string;
  geometryName: string;
  /**
   * 使用した指割り当てのidと名前。割り当てが変わると同指連続の数も距離も変わるため、
   * どの割り当てで測ったかを数値と一緒に運ぶ（仕様 §4.2・§12.3）。
   */
  fingerAssignmentId: string;
  fingerAssignmentName: string;
  /**
   * この数値を算出した測定条件のスナップショット。条件を変えても後から出典を辿れるよう、
   * 表示用の状態ではなく数値と同じ入れ物へ保存する（仕様 §12.3）。
   */
  conditions: MetricConditions;
  /** ActionRealizationPolicy適用後のrealized Stroke数。 */
  strokes: number;
  /** 現行pipelineでは1 realized Stroke = 1 analytic action。 */
  actions: number;
  /** キー押下数。同時押しは押したキーの数だけ数える */
  presses: number;
  /** 配列に無く打鍵できなかった文字数 */
  skipped: number;
  /** 入力文字数（展開前。仕様 §11.4の分母） */
  inputChars: number;
  /** 指ごとの総移動距離 [u] */
  perFinger: Record<Finger, number>;
  /** 指ごとの押下数 */
  perFingerPresses: Record<Finger, number>;
  /** 総移動距離 [u] */
  totalUnits: number;
  /** 総移動距離 [mm] */
  totalMm: number;
  /** 1打鍵あたりの平均移動距離 [u] */
  meanPerStroke: number;
  /**
   * 入力1文字あたりの平均移動距離 [u]。
   * 打鍵数はコンボ・かな直接入力で配列ごとに変わるため、`meanPerStroke` では
   * 打鍵数削減の効果が相殺されて消える。分母を展開前の文字数に固定するとここに出る。
   */
  perCharUnits: number;
  /**
   * 入力1文字あたりのアクション（ステップ）数（仕様 §11.5）。
   * コンボ・かな直接入力による打鍵数削減の効果はここに直接出る。
   */
  perCharSteps: number;
  /**
   * 入力1文字あたりの押下キー数（仕様 §11.5）。
   * コンボは複数キーを1ステップにまとめても押すキー自体は減らさないため、
   * `perCharSteps` が下がっても `perCharPresses` は下がらない場合がある。
   */
  perCharPresses: number;
  /**
   * 打鍵可能な入力文字のうち、単打面の1キーだけで直接出力された文字の割合 [%]。
   * シフト面・複数キーコンボ・複数Stroke入力は含めない（仕様 §11.5.1）。
   */
  singleTapLayerRate: number;
  /**
   * 総アクションのうち、単打面（base layer）の1 physical Stroke・1物理キーだけで
   * 入力単位を直接出力し、trigger / held-triggerに依存しない「単打」アクションの割合 [%]
   * （仕様 §11.5.2）。
   */
  singleTapRate: number;
  /**
   * 総アクションのうち、1物理キーだけを入力するアクションの割合 [%]（仕様 §11.5.3）。
   * 入力意味は問わず、ローマ字・シフト操作・hold継続中の出力も打鍵形態だけで判定する。
   */
  singleKeyRate: number;
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
  /** コンボ枠に帰属するキーid → 打鍵回数 */
  comboKeyCounts: Map<string, number>;
  /** コンボ枠に帰属するキーid → そのキーへの移動距離の合計 [u] */
  comboKeyDistance: Map<string, number>;
  /** キーid → 打鍵回数 */
  keyCounts: Map<string, number>;
  /** キーid → そのキーへの移動距離の合計 [u] */
  keyDistance: Map<string, number>;
}

export interface MetricConditions {
  /** 窓幅N（打鍵単位） */
  windowSize: number;
  /** 同指連続でホームキーの移動を計上するか */
  sfbHomeCost: boolean;
  /** 親指シフトを出力キーと反対側の親指へ振り替えたか */
  preferOppositeThumb: boolean;
  /** Analysis Chainを作ったChainPolicy。 */
  chainPolicy: ChainPolicy;
  /** ArpeggioSpanを派生したArpeggioPolicy。 */
  arpeggioPolicy: ArpeggioPolicy;
  /** hold-capable triggerをrealizeしたPolicy。 */
  triggerRealizationPolicy: TriggerRealizationPolicy;
  /** Trigger realization後のaction groupingへ適用したPolicy。 */
  actionRealizationPolicy: ActionRealizationPolicy;
  /** ローマ字入力に使った綴り規則の識別子。かな直接入力はnull */
  romajiRuleId: string | null;
}

export const DEFAULT_METRIC_CONDITIONS: MetricConditions = {
  windowSize: 3,
  sfbHomeCost: true,
  preferOppositeThumb: false,
  chainPolicy: { ...DEFAULT_CHAIN_POLICY },
  arpeggioPolicy: { ...DEFAULT_ARPEGGIO_POLICY },
  triggerRealizationPolicy: { ...DEFAULT_TRIGGER_REALIZATION_POLICY },
  actionRealizationPolicy: { ...DEFAULT_ACTION_REALIZATION_POLICY },
  romajiRuleId: null,
};

export function computeMetrics(
  trace: Trace,
  geometry: Geometry,
  conditions: MetricConditions = DEFAULT_METRIC_CONDITIONS,
): Metrics {
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
      triggerKeyCounts: new Map(),
      pairedTriggerKeyCounts: new Map(),
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
      triggerKeyCounts: new Map(),
      pairedTriggerKeyCounts: new Map(),
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
    const triggerKeys = new Set(stroke.triggerKeys);
    const pairedTriggerKeys = new Set(stroke.pairedTriggerKeys);
    totalUnits += stroke.distance;
    for (const press of stroke.presses) {
      presses += press.keys.length;
      perFinger[press.finger] += press.distance;
      perFingerPresses[press.finger] += press.keys.length;
      if (press.sfb) sameFinger++;
      // 1本の指で複数キーを押した場合、距離はキーへ均等に按分する
      const share = press.distance / press.keys.length;
      for (const key of press.keys) {
        keyCounts.set(key.id, (keyCounts.get(key.id) ?? 0) + 1);
        keyDistance.set(key.id, (keyDistance.get(key.id) ?? 0) + share);
        if (stroke.aggregationGroupId === COMBO_LAYER_ID) {
          comboPresses++;
          comboKeyCounts.set(key.id, (comboKeyCounts.get(key.id) ?? 0) + 1);
          comboKeyDistance.set(key.id, (comboKeyDistance.get(key.id) ?? 0) + share);
        } else {
          const layer = ensureLayer(stroke.aggregationGroupId);
          layer.presses++;
          layer.keyCounts.set(key.id, (layer.keyCounts.get(key.id) ?? 0) + 1);
          layer.keyDistance.set(key.id, (layer.keyDistance.get(key.id) ?? 0) + share);
          if (triggerKeys.has(key.id)) {
            layer.triggerKeyCounts.set(key.id, (layer.triggerKeyCounts.get(key.id) ?? 0) + 1);
          }
          if (pairedTriggerKeys.has(key.id)) {
            layer.pairedTriggerKeyCounts.set(key.id, (layer.pairedTriggerKeyCounts.get(key.id) ?? 0) + 1);
          }
        }
      }
    }

    ADJACENT_PAIRS.forEach((pair, i) => {
      // そのペアのホーム間隔を引いた超過で溜める（仕様 §11.6）。0でクランプはしない
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

  const strokes = trace.strokes.length;
  // ActionRealizationPolicyはevaluateでStroke生成前に適用済み。
  // Metrics側ではvirtual actionを足さず、共通realized streamをそのまま数える。
  const actions = strokes;
  const { inputChars } = trace;
  return {
    geometryId: geometry.id,
    geometryName: geometry.name,
    fingerAssignmentId: geometry.assignment.id,
    fingerAssignmentName: geometry.assignment.name,
    conditions: {
      ...conditions,
      chainPolicy: { ...conditions.chainPolicy },
      arpeggioPolicy: { ...conditions.arpeggioPolicy },
      triggerRealizationPolicy: { ...conditions.triggerRealizationPolicy },
      actionRealizationPolicy: { ...conditions.actionRealizationPolicy },
    },
    strokes,
    actions,
    presses,
    skipped: trace.skipped,
    inputChars,
    perFinger,
    perFingerPresses,
    totalUnits,
    totalMm: totalUnits * geometry.pitchMm,
    meanPerStroke: strokes ? totalUnits / strokes : 0,
    perCharUnits: inputChars ? totalUnits / inputChars : 0,
    perCharSteps: inputChars ? actions / inputChars : 0,
    perCharPresses: inputChars ? presses / inputChars : 0,
    singleTapLayerRate: singleTapLayerRate(trace),
    singleTapRate: singleTapRate(trace, actions),
    singleKeyRate: singleKeyRate(trace, actions),
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

/**
 * 打鍵可能だった入力単位を inputIndex ごとにまとめ、元の文字数で重み付けする。
 * 「単打面」は、1 Stroke・1キーで、combo aggregation / composition classification /
 * trigger / held-triggerを一切伴わない直接入力とする。
 * hold利用ON/OFFで値が変わらないよう、held-triggerも除外する。
 */
function singleTapLayerRate(trace: Trace): number {
  const byInput = new Map<number, Stroke[]>();
  for (const stroke of trace.strokes) {
    const group = byInput.get(stroke.inputIndex);
    if (group) group.push(stroke);
    else byInput.set(stroke.inputIndex, [stroke]);
  }

  let typableChars = 0;
  let baseChars = 0;
  for (const strokes of byInput.values()) {
    const charCount = [...strokes[0].inputChar].length;
    typableChars += charCount;
    if (strokes.length !== 1) continue;

    const stroke = strokes[0];
    const keyCount = stroke.presses.reduce((sum, press) => sum + press.keys.length, 0);
    const hasTriggerParticipation = stroke.participations.some((participation) =>
      participation.roles.includes('trigger') || participation.roles.includes('held-trigger'));

    if (stroke.aggregationGroupId !== COMBO_LAYER_ID
      && !stroke.classifications.includes('composition')
      && stroke.triggerKeys.length === 0
      && !hasTriggerParticipation
      && keyCount === 1) {
      baseChars += charCount;
    }
  }

  return typableChars ? (baseChars / typableChars) * 100 : 0;
}

/**
 * 総アクションのうち、かな配列でいう「単打」に相当するアクションの割合。
 *
 * 単打は、単打面（base layer）の1 physical Stroke・1物理キーだけで入力単位を直接出力し、
 * trigger / held-triggerに依存せず、その入力単位が1 Strokeで完結するものとする。
 * 文字種のwhite listは持たない。ローマ字展開後の各英字Strokeや、
 * prefix / suffixの一部だけを単打とは数えない。
 *
 * 分母はActionRealizationPolicy適用後のrealized action数。
 * hold-startをseparateにした場合は先行trigger Strokeも通常の分母へ入る。
 */
function singleTapRate(trace: Trace, actions: number): number {
  if (actions === 0) return 0;

  const byInput = new Map<number, Stroke[]>();
  for (const stroke of trace.strokes) {
    const group = byInput.get(stroke.inputIndex);
    if (group) group.push(stroke);
    else byInput.set(stroke.inputIndex, [stroke]);
  }

  let singleTapActions = 0;
  for (const strokes of byInput.values()) {
    if (strokes.length !== 1) continue;

    const stroke = strokes[0];
    if (stroke.aggregationGroupId !== SINGLE_LAYER_ID) continue;
    if (stroke.char !== stroke.inputChar) continue;

    const keyCount = stroke.presses.reduce((sum, press) => sum + press.keys.length, 0);
    const hasOutput = stroke.participations.some((participation) =>
      participation.roles.includes('output'));
    const hasShiftParticipation = stroke.participations.some((participation) =>
      participation.roles.includes('trigger') || participation.roles.includes('held-trigger'));

    if (keyCount === 1 && hasOutput && !hasShiftParticipation) singleTapActions++;
  }

  return (singleTapActions / actions) * 100;
}

/**
 * 総アクションのうち、1物理キーだけを入力するアクションの割合。
 * 「単打」のかな入力上の意味は持たず、入力する物理キー数だけを見る。
 *
 * ActionRealizationPolicyによる分割はStroke生成前に完了しているため、
 * Metrics側でvirtual splitを再構成しない。
 */
function singleKeyRate(
  trace: Trace,
  actions: number,
): number {
  if (actions === 0) return 0;

  let singleKeyActions = 0;
  for (const stroke of trace.strokes) {
    const keyIds = new Set(stroke.presses.flatMap((press) => press.keys.map((key) => key.id)));
    if (keyIds.size === 1) singleKeyActions++;
  }

  return (singleKeyActions / actions) * 100;
}

function meanStdDevMax(values: number[]): { mean: number; stdDev: number; max: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0, max: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance), max: Math.max(...values) };
}
