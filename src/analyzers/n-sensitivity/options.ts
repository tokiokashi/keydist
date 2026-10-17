import * as v from 'valibot';
import { defineOption, defineOptions, picklistUrlCodec } from '#analyzers/options.ts';
import { DEFAULT_N_SENSITIVITY_METRIC, N_SENSITIVITY_METRIC_IDS, type NSensitivityMetricId } from './metric-catalog.ts';

/**
 * N感度Analyzerの解析設定。
 *
 * `metric`は縦軸に描く指標（`metric-catalog.ts`の一覧から1つ）。1枚の図に描く指標は1つにする
 * （単位の違う指標を同じ縦軸に重ねないため）。抽出は一覧の指標をすべてNごとに持つので、
 * 選ぶのは可視化の側であり`affects: 'view'`。
 *
 * `scale`は縦軸の見せ方だけを切り替える（`relative`: N=0との比較、`absolute`: 実測値）。
 * 単位が%の指標の相対は、N=0との差をパーセントポイントで描く。どちらも抽出結果
 * （`extract.ts`の`points`の生の値）はそのまま計算し、縦軸への変換は可視化
 * （`definition.tsx`）側で行う（AGENTS.md「表示だけが変わるなら`ui`、出力される
 * 数値が動くなら`conditions`」の帰結。抽出は変えない）ため`affects: 'view'`。
 *
 * Nの範囲（0〜10）は固定にし、設定にはしない
 * （AGENTS.md「割れる人を想像できるが実例が無いものは今は設定にしない」・
 * 「先回りして足さない」）。
 */
const SCALES = ['relative', 'absolute'] as const;
export type NSensitivityScale = (typeof SCALES)[number];

/**
 * `yRange`は縦軸の範囲の決め方（決め方の中身は`y-range.ts`）。表示だけが変わり数値は動かない
 * ので`affects: 'view'`。範囲を詰めると配列間の差が大きく見えるため、既定は0から始める。
 */
const Y_RANGES = ['full', 'fit', 'coarse'] as const;
export type NSensitivityYRange = (typeof Y_RANGES)[number];

export const nSensitivityOptions = defineOptions({
  metric: defineOption<NSensitivityMetricId>({
    schema: v.picklist(N_SENSITIVITY_METRIC_IDS),
    default: DEFAULT_N_SENSITIVITY_METRIC,
    affects: 'view',
    url: picklistUrlCodec('metric', N_SENSITIVITY_METRIC_IDS),
    label: '指標',
  }),
  scale: defineOption<NSensitivityScale>({
    schema: v.picklist(SCALES),
    default: 'relative',
    affects: 'view',
    url: picklistUrlCodec('scale', SCALES),
    label: '縦軸',
  }),
  yRange: defineOption<NSensitivityYRange>({
    schema: v.picklist(Y_RANGES),
    default: 'full',
    affects: 'view',
    url: picklistUrlCodec('yrange', Y_RANGES),
    label: '縦軸の範囲',
  }),
});

export type NSensitivityOptions = typeof nSensitivityOptions.defaultOptions;

export const DEFAULT_N_SENSITIVITY_OPTIONS: NSensitivityOptions = nSensitivityOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_N_SENSITIVITY_OPTIONS: NSensitivityOptions = {
  metric: 'sameFingerRate',
  scale: 'absolute',
  yRange: 'fit',
};
