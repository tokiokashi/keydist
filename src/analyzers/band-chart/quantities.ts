import { ALL_FINGERS } from '#input/shapes/geometry.ts';
import { FINGER_LABEL } from '#input/shapes/finger-names.ts';
import type { TextLanguage } from '#input/text/language.ts';
import { BAND_QUANTITY_IDS, DISTANCE_BAND_EDGES, type BandQuantityId } from '#interpretation/band-quantities.ts';
import { kanaUnitOf } from '../unit-words.ts';

/**
 * 帯グラフの7つの量の、画面に出す名前・区分の名前・区分の色（画面に依存しない純粋な定義）。
 * 数え方は `interpretation/band-quantities.ts`、定義は `docs/segment-metrics.md`「帯グラフの量」。
 */

/**
 * 区分の色の名前。`band-chart-view.css` が色に対応づける。
 * 順序のある区分（`blue`）は1色の濃淡、手と指は左手（`green`）と右手（`violet`）で色相を分けて手の中を濃淡にし、
 * 両手の2区分（順に・同時）と段の親指は左右・段の順序と別の色相（`amber`）にする。両手の2区分は同じ色相の濃淡で分ける。
 */
export type BandColor =
  | 'blue-0'
  | 'blue-1'
  | 'blue-2'
  | 'blue-3'
  | 'green-0'
  | 'green-1'
  | 'green-2'
  | 'green-3'
  | 'green-4'
  | 'violet-0'
  | 'violet-1'
  | 'violet-2'
  | 'violet-3'
  | 'violet-4'
  | 'amber'
  | 'amber-0'
  | 'amber-1';

/** 標本の種類。かな（打鍵のまとまりが覆うかな）、押下、移動距離。 */
export type BandSample = 'kana' | 'press' | 'distance';

export interface BandQuantity {
  readonly id: BandQuantityId;
  /** 量の選択肢（ペインの見出しと解析設定）と、行を押した時の表に出す量の名前 */
  readonly name: string;
  readonly sample: BandSample;
  /** 区分の名前。区分の順に左から並べる */
  readonly labels: readonly string[];
  readonly colors: readonly BandColor[];
}

const LEFT_FINGER_COLORS: readonly BandColor[] = ['green-0', 'green-1', 'green-2', 'green-3', 'green-4'];
const RIGHT_FINGER_COLORS: readonly BandColor[] = ['violet-4', 'violet-3', 'violet-2', 'violet-1', 'violet-0'];
const FINGER_COLORS: readonly BandColor[] = [...LEFT_FINGER_COLORS, ...RIGHT_FINGER_COLORS];
const FINGER_LABELS: readonly string[] = ALL_FINGERS.map((finger) => FINGER_LABEL[finger]);

/** 距離の区分の名前（境目の距離で書く）。 */
function distanceLabels(): readonly string[] {
  const edges = DISTANCE_BAND_EDGES;
  return [`${edges[0]}u未満`, ...edges.slice(1).map((edge, index) => `${edges[index]}〜${edge}u`), `${edges[edges.length - 1]}u以上`];
}

export const BAND_QUANTITIES: Readonly<Record<BandQuantityId, BandQuantity>> = {
  distance: { id: 'distance', name: '移動距離', sample: 'kana', labels: distanceLabels(), colors: ['blue-0', 'blue-1', 'blue-2', 'blue-3'] },
  action: {
    id: 'action',
    name: '打ち方',
    sample: 'kana',
    labels: ['単打', '同時押し', '2アクション', '3アクション以上'],
    colors: ['blue-0', 'blue-1', 'blue-2', 'blue-3'],
  },
  presses: { id: 'presses', name: '押下数', sample: 'kana', labels: ['1キー', '2キー', '3キー以上'], colors: ['blue-0', 'blue-2', 'blue-3'] },
  hand: {
    id: 'hand',
    name: '手',
    sample: 'kana',
    labels: ['左手', '両手順次', '両手同時', '右手'],
    colors: ['green-2', 'amber-0', 'amber-1', 'violet-2'],
  },
  row: {
    id: 'row',
    name: '段',
    sample: 'press',
    labels: ['数字段', '上段', '中段', '下段', '親指'],
    colors: ['blue-0', 'blue-1', 'blue-2', 'blue-3', 'amber'],
  },
  fingerPresses: { id: 'fingerPresses', name: '指ごとの押下', sample: 'press', labels: FINGER_LABELS, colors: FINGER_COLORS },
  fingerDistance: { id: 'fingerDistance', name: '指ごとの移動距離', sample: 'distance', labels: FINGER_LABELS, colors: FINGER_COLORS },
};

export const BAND_QUANTITY_LIST: readonly BandQuantity[] = BAND_QUANTITY_IDS.map((id) => BAND_QUANTITIES[id]);

/** 図の下に出す、量の名前。単位の語はテキストの言語で変わる。 */
export function bandCaption(id: BandQuantityId, language: TextLanguage): string {
  const unit = kanaUnitOf(language);
  switch (id) {
    case 'distance':
      return `1${unit}ごとの移動距離の割合`;
    case 'action':
      return `${unit}を打つ打ち方の割合`;
    case 'presses':
      return `${unit}を打つ押下数の割合`;
    case 'hand':
      return `${unit}を打つ手の割合`;
    case 'row':
      return '押したキーの段の割合';
    case 'fingerPresses':
      return '指ごとの押下の割合';
    case 'fingerDistance':
      return '指ごとの移動距離の割合';
  }
}

export interface BandSampleText {
  /** 行を押した時の表の見出しに出す、標本の合計の名前（例: 打てたかな数） */
  readonly totalLabel: string;
  /** 表の3列目の見出し */
  readonly countHeader: string;
  /** 分母（標本の合計）の表記 */
  readonly total: (value: number) => string;
  /** 区分ごとの標本の量の表記 */
  readonly count: (value: number) => string;
}

const DISTANCE_DIGITS = 1;

export function bandSampleText(id: BandQuantityId, language: TextLanguage): BandSampleText {
  const sample = BAND_QUANTITIES[id].sample;
  if (sample === 'kana') {
    const unit = kanaUnitOf(language);
    return { totalLabel: `数えた${unit}数`, countHeader: `${unit}数`, total: String, count: String };
  }
  if (sample === 'press') return { totalLabel: '押下数', countHeader: '押下数', total: String, count: String };
  return {
    totalLabel: '移動距離の合計',
    countHeader: '移動距離 [u]',
    total: (value) => `${value.toFixed(DISTANCE_DIGITS)}u`,
    count: (value) => value.toFixed(DISTANCE_DIGITS),
  };
}

/** 割合が決まらない（分母が0の）行に出す文。 */
export function bandNoValueMessage(id: BandQuantityId): string {
  return BAND_QUANTITIES[id].sample === 'distance' ? '数えた移動距離が0です' : '打てた文字がありません';
}

/** 並べ替えに使える境目の数。区分の数より1つ少ない（右端の境目は割合が常に1で、並びが決まらない）。 */
export function sortBoundaryCount(id: BandQuantityId): number {
  return BAND_QUANTITIES[id].labels.length - 1;
}

/**
 * 量に対して有効な境目。範囲外（量を替えた後に残った値、URLの値）は並べ替えない（0）として扱う。
 * 境目の意味は量ごとに違うので、同じ数のままで別の量に持ち越さない。
 */
export function effectiveSortBoundary(id: BandQuantityId, boundary: number): number {
  return boundary >= 1 && boundary <= sortBoundaryCount(id) ? boundary : 0;
}

/** 並びの選択肢の名前。`boundary` は左端から数えた区分の数（1以上）で、その区分までの割合で並べる。 */
export function sortBoundaryName(id: BandQuantityId, boundary: number): string {
  return `${BAND_QUANTITIES[id].labels[boundary - 1]}までの割合`;
}
