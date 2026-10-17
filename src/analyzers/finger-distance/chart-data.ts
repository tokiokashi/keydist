import { FINGER_LABEL, SHORT_FINGER } from '#input/shapes/finger-names.ts';
import type { FingerDistanceExtracted, FingerDistanceHand } from './extract.ts';
import type { FingerDistanceChartMetric } from './options.ts';

/**
 * 縦棒グラフに渡す棒の並びを、抽出結果と見る量から作る。値は抽出結果をそのまま写すだけで、
 * 再計算しない。並びは物理的な並び（左手の小指から右手の小指）で、抽出結果の並びのまま。
 */

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

/**
 * 棒の上の値。棒の幅は1本ぶんの約33px（幅390px時）しか無いので、桁が増えると隣の値と重なる。
 * 1000以上は小数を落とし、10万以上はkで、100万以上はMで縮める。縮めた値は4〜5文字に収まり、
 * 桁数によらず上限が一定になる。正確な値はツールチップに出る。
 */
const compact = (value: number, plain: string): string => {
  // 境目は表示する桁で判定する（99999.7は「100000」と出るのでkに寄せる）
  const abs = Math.round(Math.abs(value));
  if (abs >= 10_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 100_000) return `${Math.round(value / 1_000)}k`;
  return plain;
};

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
          valueText: isDistance
            ? compact(value, value >= 1000 ? value.toFixed(0) : formatDistance(value))
            : compact(value, String(value)),
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

export interface DistributionBar {
  /** 状態の値 [u] */
  readonly state: number;
  /** 全打鍵に対する割合 [%] */
  readonly share: number;
  readonly tip: string;
}

export interface DistributionSpec {
  readonly key: string;
  readonly hand: FingerDistanceHand;
  /** 組の名前（例: 「中–人」） */
  readonly label: string;
  readonly bars: readonly DistributionBar[];
}

/** 分布の割合の表示。分布の割合は[%]の値で持つので、0〜1を受ける `formatShare` とは別に書式を持つ。 */
export const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

/** 状態の値の表示 [u]。丸めの桁（小数第6位）のうち、読み取りに足りる3桁まで出す。 */
export const formatState = (value: number): string => value.toFixed(3);

/**
 * 隣り合う指6組の、指間距離（ホーム間隔からの超過）の分布。値は抽出結果をそのまま写すだけ。
 * 割合は全打鍵に対するもので、平均・標準偏差と同じ母集団。
 */
export function distributionSpecsOf(extracted: FingerDistanceExtracted): readonly DistributionSpec[] {
  return extracted.adjacent.map((item) => {
    const [a, b] = item.pair;
    const label = `${SHORT_FINGER[a]}–${SHORT_FINGER[b]}`;
    return {
      key: `${a}-${b}`,
      hand: item.hand,
      label,
      bars: item.distribution.map((entry) => ({
        state: entry.state,
        share: entry.share,
        tip: `${HAND_LABEL[item.hand]} ${label}: 超過 ${formatState(entry.state)} u が${formatPercent(entry.share)}（${entry.count}打鍵）`,
      })),
    };
  });
}
