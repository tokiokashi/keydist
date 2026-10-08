import type { Finger } from '#input/shapes/geometry.ts';
import type { FingerDistanceExtracted, FingerDistanceHand } from './extract.ts';
import type { FingerDistanceChartMetric } from './options.ts';

/**
 * 縦棒グラフに渡す棒の並びを、抽出結果と見る量から作る。値は抽出結果をそのまま写すだけで、
 * 再計算しない。並びは物理的な並び（左手の小指から右手の小指）で、抽出結果の並びのまま。
 */

export const FINGER_LABEL: Readonly<Record<Finger, string>> = {
  LP: '左小指', LR: '左薬指', LM: '左中指', LI: '左人差し指', LT: '左親指',
  RT: '右親指', RI: '右人差し指', RM: '右中指', RR: '右薬指', RP: '右小指',
};

export const SHORT_FINGER: Readonly<Record<Finger, string>> = {
  LP: '小', LR: '薬', LM: '中', LI: '人', LT: '親',
  RT: '親', RI: '人', RM: '中', RR: '薬', RP: '小',
};

export const HAND_LABEL: Readonly<Record<FingerDistanceHand, string>> = { left: '左手', right: '右手' };

export const formatDistance = (value: number): string => value.toFixed(1);
export const formatShare = (value: number): string => `${(value * 100).toFixed(1)}%`;
export const formatDeviation = (value: number): string => value.toFixed(3);

export interface ChartBar {
  readonly key: string;
  /** 棒の下に出す短い名前 */
  readonly label: string;
  readonly hand: FingerDistanceHand;
  readonly value: number;
  /** 棒の上に出す値 */
  readonly valueText: string;
  /** ツールチップ（割合などの補足を含む） */
  readonly tip: string;
}

export interface ChartSpec {
  readonly bars: readonly ChartBar[];
  /** 見る量の名前（グラフの見出しと読み上げに使う） */
  readonly title: string;
}

/** 棒の上の値。桁が多い時は小数を落として棒の幅に収める。 */
const compact = (value: number, text: string): string => (Math.abs(value) >= 1000 ? value.toFixed(0) : text);

export function chartSpecOf(extracted: FingerDistanceExtracted, metric: FingerDistanceChartMetric): ChartSpec {
  if (metric === 'distance' || metric === 'presses') {
    const isDistance = metric === 'distance';
    return {
      title: isDistance ? '指ごとの移動距離 [u]' : '指ごとの押下数',
      bars: extracted.fingers.map((item) => {
        const value = isDistance ? item.distance : item.presses;
        const share = isDistance ? item.distanceShare : item.pressShare;
        const text = isDistance ? `${formatDistance(value)} u` : String(value);
        return {
          key: item.finger,
          label: SHORT_FINGER[item.finger],
          hand: item.hand,
          value,
          valueText: isDistance ? compact(value, formatDistance(value)) : String(value),
          tip: `${FINGER_LABEL[item.finger]}: ${text}（全体の${formatShare(share)}）`,
        };
      }),
    };
  }
  const names = { stdDev: '標準偏差', mean: '平均', max: '最大' } as const;
  return {
    title: `隣り合う指の間隔の${names[metric]} [u]`,
    bars: extracted.adjacent.map((item) => {
      const [a, b] = item.pair;
      const value = metric === 'stdDev' ? item.stdDev : metric === 'mean' ? item.meanExcess : item.maxExcess;
      return {
        key: `${a}-${b}`,
        label: `${SHORT_FINGER[a]}–${SHORT_FINGER[b]}`,
        hand: item.hand,
        value,
        valueText: formatDeviation(value),
        tip: `${HAND_LABEL[item.hand]} ${SHORT_FINGER[a]}–${SHORT_FINGER[b]}の${names[metric]}: ${formatDeviation(value)} u`,
      };
    }),
  };
}
