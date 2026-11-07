import { ADJACENT_PAIRS, ALL_FINGERS, dist, hasMultiFingerKeys, type Finger, type Geometry } from '#input/shapes/geometry.ts';
import type { Stroke, Trace } from '#trace/generate.ts';
import { countStates, type StateCounts } from './excess-distribution.ts';
import { DEFAULT_CHAIN_INTERPRETATION, type ChainInterpretation } from './structure/chain.ts';
import { DEFAULT_ARPEGGIO_INTERPRETATION, type ArpeggioInterpretation } from './structure/arpeggio.ts';
import { COMBO_LAYER_ID, SINGLE_LAYER_ID } from '#input/layouts/types.ts';
import type { ReadingConditions } from '#input/text/reading.ts';
import {
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  type ActionRealizationPolicy,
  type TriggerRealizationPolicy,
} from '#input/semantics/index.ts';

/**
 * 隣接ペアのホーム間隔 [u]（仕様 §11.6で引く基準）。
 * 定数1uではなく物理配列・指割り当てから実際に測る。列ずれのある物理配列では
 * 隣接ホームの2次元距離が1uをわずかに超えるが、それは指の長さを補正した
 * 姿勢であって「開き」ではないため、超過の0点はそちらに置く。
 */
export const homeSpacing = (geometry: Geometry, pair: [Finger, Finger]) => dist(geometry.homes[pair[0]], geometry.homes[pair[1]]);

export interface PairStat {
  pair: [Finger, Finger];
  /** ホーム間隔からの超過の平均 [u]。ホームに並んだ状態が0。負になりうる */
  meanExcess: number;
  /** 超過の標準偏差 [u]。定数を引いても分布の広がりは変わらないので生の距離と同じ値 */
  stdDev: number;
  /** 超過の実測最大値 [u] */
  maxExcess: number;
}

export interface PairDistribution {
  pair: [Finger, Finger];
  /**
   * ホーム間隔からの超過の状態別の頻度（状態の値 [u] → 打鍵数）。
   * 母集団は `PairStat` と同じ、スナップショットを取った全打鍵（仕様 §11.6）。
   */
  counts: StateCounts;
}

export interface ComboStats {
  /** コンボ枠の見出しの数（コンボ定義と、コンボ枠に計上する面の出力） */
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
  /** この層に帰属するキー数 */
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
   * 使用した物理配列のidと名前。物理配列が変わると距離の絶対値が変わるため、
   * どの物理配列で測ったかを数値と一緒に運ぶ（仕様 §3・§12.3）。
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
   * 使用した指割り当ての定義が、複数の指が担当するキーを持つかの印（仕様 §9.1・§12.1）。
   * 分割する物理配列では、キーと反対側の手の追加の担当は候補から外れる。そのため、どのキーも
   * 指の候補が1本になって、最小化で指を選ばない場合がある。
   */
  fingerAssignmentHasMultiFingerKeys: boolean;
  /**
   * この数値を算出した測定条件のスナップショット。条件を変えても後から出典を辿れるよう、
   * 表示用の状態ではなく数値と同じ入れ物へ保存する（仕様 §12.3）。
   */
  conditions: MetricConditions;
  /** ActionRealizationPolicy適用後のrealized Stroke数。 */
  strokes: number;
  /** 現行pipelineでは1 realized Stroke = 1 analytic action。 */
  actions: number;
  /** キー数。同時押しは押したキーの数だけ数える */
  presses: number;
  /** 配列に無く打鍵できなかった文字数 */
  skipped: number;
  /** 入力かな数（展開前。仕様 §11.4の分母） */
  inputChars: number;
  /** 指ごとの総移動距離 [u] */
  perFinger: Record<Finger, number>;
  /** 指ごとの押下数 */
  perFingerPresses: Record<Finger, number>;
  /**
   * 指ごとのPressの回数。同時押しで1本の指が複数キーを押しても1回と数える。
   * 押したキーの数を数える `perFingerPresses`（仕様 §11.2の `Q_f`）とは別の量で、
   * 同指連続の比率の分母に使う（仕様 §11.7）。
   */
  perFingerPressEvents: Record<Finger, number>;
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
   * 入力1かなあたりのキー数（仕様 §11.5）。
   * コンボは複数キーを1ステップにまとめても押すキー自体は減らさないため、
   * `perCharSteps` が下がっても `perCharPresses` は下がらない場合がある。
   */
  perCharPresses: number;
  /**
   * 1アクションで押すキーの数（仕様 §11.5）。キー数 / アクション数で、アクションが0なら0。
   * コンボや同時押しで複数のキーを1アクションにまとめるほど大きくなる。
   */
  perActionPresses: number;
  /**
   * 押したキー1つあたりの移動距離 [u/キー]（仕様 §11.5）。総移動距離 / キー数で、キー数が0なら0。
   * 分母には距離が0の押下（ホームキー・親指キー）も入る。
   */
  perPressUnits: number;
  /**
   * 移動ありキーの割合 [%]（仕様 §11.5）。移動距離が0より大きいキーの数 / キー数 × 100。
   * キー数が0なら0。
   */
  movedPressShare: number;
  /**
   * 移動ありキー1つで動く距離 [u/移動ありキー]（仕様 §11.5）。総移動距離 / 移動距離が0より大きいキーの数。
   * その数が0なら0。`perPressUnits` = `movedPressShare` / 100 × この値。
   */
  perMovedPressUnits: number;
  /**
   * 文字数 `W`（仕様 §11.5）。`inputChars`に、漢字を読みに直した語の「表記の字数 − 読みの字数」を足した数。
   * 読みに直した語がなければ`inputChars`と同じ。
   */
  textChars: number;
  /** 1アクションの文字数 [文字/アクション] = `textChars` / `actions`。アクションが0なら値を持たず`null`。 */
  textCharsPerAction: number | null;
  /** 1文字あたりのアクション数 [アクション/文字] = `actions` / `textChars`。アクションか文字数が0なら値を持たず`null`。 */
  actionsPerTextChar: number | null;
  /** 1uあたりのアクション数 [アクション/u] = `actions` / `totalUnits`。総移動距離が0なら値を持たず`null`。 */
  actionsPerUnit: number | null;
  /** 1uあたりの文字数 [文字/u] = `textChars` / `totalUnits`。総移動距離が0なら値を持たず`null`。 */
  textCharsPerUnit: number | null;
  /** 1文字あたりの移動距離 [u/文字] = `totalUnits` / `textChars`。文字数が0なら値を持たず`null`。 */
  unitsPerTextChar: number | null;
  /**
   * 打鍵可能な入力文字のうち、単打面の1キーだけで直接出力された文字の割合 [%]。
   * シフト面・複数キーコンボ・複数Stroke入力は含めない（仕様 §11.5.1）。
   */
  singleTapLayerRate: number;
  /**
   * 総アクションのうち、単打面の文字を直接出力するアクションの割合 [%]（仕様 §11.5.2）。
   * ローマ字展開後の途中Strokeは含めない。複数文字見出しでも1actionとして数える。
   */
  singleTapRate: number;
  /**
   * 総アクションのうち、そのactionでfreshに押す物理キーが1つだけの割合 [%]（仕様 §11.5.3）。
   * semanticは問わず、realized Strokeの新規キー数だけで判定する。
   */
  singleKeyRate: number;
  /** 隣接指間距離の統計。ホーム間隔からの超過で持つ（仕様 §11.6） */
  adjacent: PairStat[];
  /** `adjacent` と同じ並びの、各ペアのホーム間隔 [u]。Nを変えたTraceから同じ超過を求め直すために持つ */
  adjacentHomeSpacings: number[];
  /** 隣接指間距離の超過の分布。`adjacent` と同じ並び・同じ母集団（仕様 §11.6） */
  adjacentDistribution: PairDistribution[];
  /** 同指連続回数。同じ指で異なる位置を続けて打った数 */
  sameFinger: number;
  /** 指ごとの同指連続回数。Press単位で数え、合計は `sameFinger` に一致する（仕様 §11.7） */
  perFingerSameFinger: Record<Finger, number>;
  /** コンボの定義数・命中した定義数・延べ命中回数（仕様 §11.8） */
  combos: ComboStats;
  /** 宣言順の層別集計。コンボ枠は含めない */
  layers: LayerStat[];
  /** コンボ枠に帰属するキー数。層の保存則の左辺に加える */
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
  /** 先読みNかな。テキストのかなの位置で数える（仕様 §7 R3） */
  windowSize: number;
  /** 同指連続でホームキーの移動を計上するか */
  sfbHomeCost: boolean;
  /** 親指シフトを出力キーと反対側の親指へ振り替えたか */
  preferOppositeThumb: boolean;
  /** Analysis Chainを作ったChainInterpretation。 */
  chainInterpretation: ChainInterpretation;
  /** ArpeggioSpanを派生したArpeggioInterpretation。 */
  arpeggioInterpretation: ArpeggioInterpretation;
  /** hold-capable triggerをrealizeしたPolicy。 */
  triggerRealizationPolicy: TriggerRealizationPolicy;
  /** Trigger realization後のaction groupingへ適用したPolicy。 */
  actionRealizationPolicy: ActionRealizationPolicy;
  /** ローマ字入力に使った綴り規則の識別子。かな直接入力はnull */
  romajiRuleId: string | null;
  /** 日本語のテキストで、かなと `、` `。` 以外の記号も評価に渡したか（仕様 §4.6）。 */
  keepSymbols: boolean;
  /**
   * 漢字を含む日本語のテキストを、読みに直して評価したか（仕様 §4.6・§12.3）。
   * 読みに直す対象でないテキスト（漢字を含まない・英語）はnull。
   */
  reading: ReadingConditions | null;
}

export const DEFAULT_METRIC_CONDITIONS: MetricConditions = {
  windowSize: 3,
  sfbHomeCost: true,
  preferOppositeThumb: false,
  chainInterpretation: { ...DEFAULT_CHAIN_INTERPRETATION },
  arpeggioInterpretation: { ...DEFAULT_ARPEGGIO_INTERPRETATION },
  triggerRealizationPolicy: { ...DEFAULT_TRIGGER_REALIZATION_POLICY },
  actionRealizationPolicy: { ...DEFAULT_ACTION_REALIZATION_POLICY },
  romajiRuleId: null,
  keepSymbols: false,
  reading: null,
};

/** 各打鍵の押下直後のスナップショットから、ペアごとのホーム間隔からの超過の列を求める（仕様 §11.6）。0でクランプはしない */
export function adjacentExcessSamples(trace: Trace, homeSpacings: readonly number[]): number[][] {
  const samples: number[][] = ADJACENT_PAIRS.map(() => []);
  for (const stroke of trace.strokes) {
    ADJACENT_PAIRS.forEach((pair, i) => {
      samples[i].push(dist(stroke.positions[pair[0]], stroke.positions[pair[1]]) - homeSpacings[i]);
    });
  }
  return samples;
}

/** ペアごとの超過の列から、`Metrics.adjacent` の欄を作る。 */
export function adjacentPairStats(samples: readonly (readonly number[])[]): PairStat[] {
  return ADJACENT_PAIRS.map((pair, i) => {
    const { mean, stdDev, max } = meanStdDevMax([...samples[i]]);
    return { pair, meanExcess: mean, stdDev, maxExcess: max };
  });
}

/**
 * 隣接ペアの超過の平均と標準偏差を、ペア間で単純平均した値（比較表の「指間平均」「指間σ」）。
 * 比較表とN感度が同じ値を共有するため、計算をここに1つだけ持つ。
 */
export function adjacentMeanStdDev(adjacent: readonly Pick<PairStat, 'meanExcess' | 'stdDev'>[]): { mean: number; stdDev: number } {
  const count = adjacent.length || 1;
  return {
    mean: adjacent.reduce((sum, item) => sum + item.meanExcess, 0) / count,
    stdDev: adjacent.reduce((sum, item) => sum + item.stdDev, 0) / count,
  };
}

/**
 * @param notationExcess 漢字を読みに直した語の「表記の字数 − 読みの字数」の合計（仕様 §11.5の `W`。`inputChars`にこの値を足した数）。
 *   読みに直した語が無ければ0。評価に渡すテキスト（読みに直した後）だけからは求まらないので、読みに直す段から受け取る。
 */
export function computeMetrics(trace: Trace, geometry: Geometry, conditions: MetricConditions = DEFAULT_METRIC_CONDITIONS, notationExcess = 0): Metrics {
  const tally = tallyPresses(trace);
  const keyCounts = new Map<string, number>();
  const keyDistance = new Map<string, number>();
  const layerStats = trace.layerDefinitions
    .filter((definition) => definition.kind === 'layer')
    .map(
      (definition): LayerStat => ({
        id: definition.id,
        label: definition.label,
        presses: 0,
        keyCounts: new Map(),
        keyDistance: new Map(),
        triggerKeyCounts: new Map(),
        pairedTriggerKeyCounts: new Map(),
      }),
    );
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
  const homeSpacings = ADJACENT_PAIRS.map((pair) => homeSpacing(geometry, pair));

  for (const stroke of trace.strokes) {
    const triggerKeys = new Set(stroke.triggerKeys);
    const pairedTriggerKeys = new Set(stroke.pairedTriggerKeys);
    for (const press of stroke.presses) {
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
  }

  const pairSamples = adjacentExcessSamples(trace, homeSpacings);
  const adjacent = adjacentPairStats(pairSamples);

  const adjacentDistribution = ADJACENT_PAIRS.map(
    (pair, i): PairDistribution => ({
      pair,
      counts: countStates(pairSamples[i]),
    }),
  );

  const combos = {
    definitions: trace.comboDefinitions,
    matched: new Set(trace.comboHits).size,
    hits: trace.comboHits.length,
  };

  const { perFinger, perFingerPresses, perFingerPressEvents, perFingerSameFinger } = tally;
  const scalars = computeTraceScalars(trace, tally);
  return {
    geometryId: geometry.id,
    geometryName: geometry.name,
    fingerAssignmentId: geometry.assignment.id,
    fingerAssignmentName: geometry.assignment.name,
    fingerAssignmentHasMultiFingerKeys: hasMultiFingerKeys(geometry.assignment),
    conditions: {
      ...conditions,
      chainInterpretation: { ...conditions.chainInterpretation },
      arpeggioInterpretation: { ...conditions.arpeggioInterpretation },
      triggerRealizationPolicy: { ...conditions.triggerRealizationPolicy },
      actionRealizationPolicy: { ...conditions.actionRealizationPolicy },
      reading:
        conditions.reading === null
          ? null
          : {
              ...conditions.reading,
              dictionary: { ...conditions.reading.dictionary },
              library: { ...conditions.reading.library },
              corrections: conditions.reading.corrections.map((entry) => ({ ...entry })),
            },
    },
    strokes: scalars.actions,
    actions: scalars.actions,
    presses: scalars.presses,
    skipped: scalars.skipped,
    inputChars: scalars.inputChars,
    perFinger,
    perFingerPresses,
    perFingerPressEvents,
    totalUnits: scalars.totalUnits,
    totalMm: scalars.totalUnits * geometry.pitchMm,
    meanPerStroke: scalars.meanPerStroke,
    perCharUnits: scalars.perCharUnits,
    perCharSteps: scalars.perCharSteps,
    perCharPresses: scalars.perCharPresses,
    perActionPresses: scalars.perActionPresses,
    perPressUnits: scalars.perPressUnits,
    ...movedPressMetrics(trace, tally),
    ...textCharMetrics(scalars.inputChars + notationExcess, scalars.actions, scalars.totalUnits),
    singleTapLayerRate: scalars.singleTapLayerRate,
    singleTapRate: scalars.singleTapRate,
    singleKeyRate: scalars.singleKeyRate,
    adjacent,
    adjacentHomeSpacings: homeSpacings,
    adjacentDistribution,
    sameFinger: scalars.sameFinger,
    perFingerSameFinger,
    combos,
    layers: layerStats,
    comboPresses,
    comboKeyCounts,
    comboKeyDistance,
    keyCounts,
    keyDistance,
  };
}

/** 指ごとの押下の集計。Geometryを要らず、Traceだけから求まる。 */
interface PressTally {
  readonly totalUnits: number;
  readonly presses: number;
  /** 移動距離が0より大きいキーの数。 */
  readonly movedPresses: number;
  readonly sameFinger: number;
  readonly perFinger: Record<Finger, number>;
  readonly perFingerPresses: Record<Finger, number>;
  readonly perFingerPressEvents: Record<Finger, number>;
  readonly perFingerSameFinger: Record<Finger, number>;
}

function tallyPresses(trace: Trace): PressTally {
  const perFinger = {} as Record<Finger, number>;
  const perFingerPresses = {} as Record<Finger, number>;
  const perFingerPressEvents = {} as Record<Finger, number>;
  const perFingerSameFinger = {} as Record<Finger, number>;
  for (const finger of ALL_FINGERS) {
    perFinger[finger] = 0;
    perFingerPresses[finger] = 0;
    perFingerPressEvents[finger] = 0;
    perFingerSameFinger[finger] = 0;
  }
  let totalUnits = 0;
  let presses = 0;
  let movedPresses = 0;
  let sameFinger = 0;
  for (const stroke of trace.strokes) {
    totalUnits += stroke.distance;
    for (const press of stroke.presses) {
      presses += press.keys.length;
      if (press.distance > 0) movedPresses += press.keys.length;
      perFinger[press.finger] += press.distance;
      perFingerPresses[press.finger] += press.keys.length;
      perFingerPressEvents[press.finger]++;
      if (press.sfb) {
        sameFinger++;
        perFingerSameFinger[press.finger]++;
      }
    }
  }
  return { totalUnits, presses, movedPresses, sameFinger, perFinger, perFingerPresses, perFingerPressEvents, perFingerSameFinger };
}

/** 右手（親指を含む5本。指の頭文字がR）の割合 [%]。分母が0なら0（仕様 §11）。 */
export function rightHandShare(byFinger: Readonly<Record<Finger, number>>): number {
  const total = ALL_FINGERS.reduce((sum, finger) => sum + byFinger[finger], 0);
  if (total === 0) return 0;
  const right = ALL_FINGERS.filter((finger) => finger.startsWith('R')).reduce((sum, finger) => sum + byFinger[finger], 0);
  return (right / total) * 100;
}

/**
 * 移動ありキーの割合 [%] と、移動ありキー1つで動く距離 [u/移動ありキー]（仕様 §11.5）。
 * 移動ありキーは移動距離が0より大きいキーで、数えるのは押したキーの数。分母が0の時はどちらも0。
 */
export function movedPressMetrics(
  trace: Trace,
  tally: PressTally = tallyPresses(trace),
): {
  readonly movedPressShare: number;
  readonly perMovedPressUnits: number;
} {
  return {
    movedPressShare: tally.presses ? (tally.movedPresses / tally.presses) * 100 : 0,
    perMovedPressUnits: tally.movedPresses ? tally.totalUnits / tally.movedPresses : 0,
  };
}

/**
 * 文字数 `W` と、`W`・アクション数 `S`・総移動距離 `D` から作る5つの比（仕様 §11.5）。
 * 分母が0の比は値を持たず`null`（0を当てはめない）。アクション/文字は、`S = 0` の時も値を持たない
 * （1アクションも打たない時に0とすると、小さいほど手間が少ない向きのこの列で最も良い値に見えるため）。
 */
export function textCharMetrics(
  textChars: number,
  actions: number,
  totalUnits: number,
): Pick<Metrics, 'textChars' | 'textCharsPerAction' | 'actionsPerTextChar' | 'actionsPerUnit' | 'textCharsPerUnit' | 'unitsPerTextChar'> {
  const ratio = (numerator: number, denominator: number): number | null => (denominator === 0 ? null : numerator / denominator);
  return {
    textChars,
    textCharsPerAction: ratio(textChars, actions),
    actionsPerTextChar: actions === 0 ? null : ratio(actions, textChars),
    actionsPerUnit: ratio(actions, totalUnits),
    textCharsPerUnit: ratio(textChars, totalUnits),
    unitsPerTextChar: ratio(totalUnits, textChars),
  };
}

/** 同指連続回数を打鍵数で割った割合 [%]。打鍵数が0なら分母を1として扱う。 */
export function sameFingerRate(sameFinger: number, strokes: number): number {
  return (sameFinger / Math.max(1, strokes)) * 100;
}

/**
 * Traceだけから求まるスカラー指標の一覧。Geometryを要らないので、Nごとに生成したTraceからも
 * `computeMetrics`と同じ定義で求められる。
 */
export const TRACE_SCALAR_IDS = [
  'actions',
  'presses',
  'skipped',
  'inputChars',
  'totalUnits',
  'meanPerStroke',
  'perCharUnits',
  'perCharSteps',
  'perCharPresses',
  'perActionPresses',
  'perPressUnits',
  'singleTapLayerRate',
  'singleTapRate',
  'singleKeyRate',
  'sameFinger',
  'sameFingerRate',
  'rightHandDistanceShare',
  'rightHandPressShare',
] as const;

export type TraceScalarId = (typeof TRACE_SCALAR_IDS)[number];
export type TraceScalars = Readonly<Record<TraceScalarId, number>>;

/** `computeMetrics`のスカラー欄の定義そのもの。`computeMetrics`もここから値を取る。 */
export function computeTraceScalars(trace: Trace, tally: PressTally = tallyPresses(trace)): TraceScalars {
  const strokes = trace.strokes.length;
  // ActionRealizationPolicyはgenerateTraceでStroke生成前に適用済み。
  // Metrics側ではvirtual actionを足さず、共通realized streamをそのまま数える。
  const actions = strokes;
  const { inputChars } = trace;
  const { totalUnits, presses } = tally;
  return {
    actions,
    presses,
    skipped: trace.skipped,
    inputChars,
    totalUnits,
    meanPerStroke: strokes ? totalUnits / strokes : 0,
    perCharUnits: inputChars ? totalUnits / inputChars : 0,
    perCharSteps: inputChars ? actions / inputChars : 0,
    perCharPresses: inputChars ? presses / inputChars : 0,
    perActionPresses: actions ? presses / actions : 0,
    perPressUnits: presses ? totalUnits / presses : 0,
    singleTapLayerRate: singleTapLayerRate(trace),
    singleTapRate: singleTapRate(trace, actions),
    singleKeyRate: singleKeyRate(trace, actions),
    sameFinger: tally.sameFinger,
    sameFingerRate: sameFingerRate(tally.sameFinger, strokes),
    rightHandDistanceShare: rightHandShare(tally.perFinger),
    rightHandPressShare: rightHandShare(tally.perFingerPresses),
  };
}

const isDirectSingleTapInput = (strokes: readonly Stroke[]): boolean => {
  if (strokes.length !== 1) return false;
  const stroke = strokes[0];
  if (stroke.aggregationGroupId !== SINGLE_LAYER_ID) return false;
  if (stroke.classifications.includes('composition')) return false;
  if (stroke.char !== stroke.inputChar) return false;

  const keyCount = stroke.presses.reduce((sum, press) => sum + press.keys.length, 0);
  const hasOutput = stroke.participations.some((participation) => participation.roles.includes('output'));
  return keyCount === 1 && hasOutput;
};

/**
 * 単打面に配置された直接入力の出力文字数 / 全出力文字数。
 *
 * 1キーで複数文字を直接出力する見出しは、その出力文字数ぶん分子へ入れる。
 * 複数actionで成立する入力は単打面の直接入力として数えない。
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
    if (isDirectSingleTapInput(strokes)) baseChars += charCount;
  }

  return typableChars ? (baseChars / typableChars) * 100 : 0;
}

/**
 * カナ配列で、単打面の文字を出力するaction数 / 全action数。
 *
 * 単打面の直接入力1件は1 actionとして分子へ入る。複数文字見出しでも1 action。
 * ローマ字展開後の英字Strokeや複数action入力は分子へ入れない。
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
    if (isDirectSingleTapInput(strokes)) singleTapActions++;
  }

  return (singleTapActions / actions) * 100;
}

/**
 * freshに押す物理キーが1つだけのaction数 / 全action数。
 *
 * output / trigger / held-trigger / layer / modifierなどのsemantic条件は見ない。
 * ActionRealizationPolicy適用後のrealized Stroke列に対して、そのStrokeで新規押下した
 * physical key数だけを数える。
 */
function singleKeyRate(trace: Trace, actions: number): number {
  if (actions === 0) return 0;

  let singleKeyActions = 0;
  for (const stroke of trace.strokes) {
    const keyIds = new Set(stroke.presses.flatMap((press) => press.keys.map((key) => key.id)));
    if (keyIds.size === 1) singleKeyActions++;
  }

  return (singleKeyActions / actions) * 100;
}

/** 平均・標準偏差・最大値。最大値は引数展開を使わずに求める（要素数が引数の上限を超えても止まらない） */
export function meanStdDevMax(values: number[]): { mean: number; stdDev: number; max: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0, max: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance), max: values.reduce((a, b) => Math.max(a, b)) };
}
