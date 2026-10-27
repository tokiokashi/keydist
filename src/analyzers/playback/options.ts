import * as v from 'valibot';
import {
  DEFAULT_PLAYBACK_ALL_FINGER_MOVEMENT_DELAY,
  DEFAULT_PLAYBACK_APPLY_PERSONAL_SPEED,
  DEFAULT_PLAYBACK_RATE_AVERAGE,
  DEFAULT_PLAYBACK_RATE_HALF_LIFE_SECONDS,
  DEFAULT_PLAYBACK_RATE_WINDOW,
  DEFAULT_PLAYBACK_SAME_FINGER_DELAY,
  DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
  DEFAULT_PLAYBACK_STEPS_PER_SECOND,
  PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX,
  PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN,
  PLAYBACK_RATE_WINDOW_MAX,
  PLAYBACK_RATE_WINDOW_MIN,
  PLAYBACK_SPEED_MULTIPLIER_MAX,
  PLAYBACK_SPEED_MULTIPLIER_MIN,
  PLAYBACK_STEPS_PER_SECOND_MAX,
  PLAYBACK_STEPS_PER_SECOND_MIN,
  type PlaybackRateAverage,
} from '#interpretation/timing/playback-options.ts';
import { BUNSETSU_WAIT_MS_MAX, BUNSETSU_WAIT_MS_MIN } from '#interpretation/timing/bunsetsu-wait.ts';
import { PUNCTUATION_WAIT_MS_MAX, PUNCTUATION_WAIT_MS_MIN } from '#interpretation/timing/punctuation-wait.ts';
import { booleanUrlCodec, defineOption, defineOptions, integerUrlCodec, numberUrlCodec, picklistUrlCodec } from '#analyzers/options.ts';

/**
 * 打鍵再生Analyzerの解析設定。
 *
 * - 再生の時間と速度グラフの数値を変える18項目（`stepsPerSecond`ほか。`spec/playback-timing.md` §2・§5）は
 *   抽出の結果を変える（`affects: 'extract'`）。変えると抽出だけを作り直し、Traceと構造解析は作り直さない。
 *   個人速度の保存値は解析設定に入らず、`applyPersonalSpeed`が真の時だけ抽出の入力になる（`playbackAssetsKeyOf`）
 * - それ以外は表示だけが変わる項目で、Traceも抽出も作り直さない（`affects: 'view'`）
 *
 * - `stepsPerSecond`: 基準速度 [ステップ/秒]。個人速度で計算している間は使われない
 * - `speedMultiplier`: 再生倍率。測定値・基準速度のどちらにも最後に掛かる
 * - `sameFingerDelay`: 同じ指が続く時の移動時間を再生の時間に反映するか
 * - `allFingerMovementDelay`: 全指の移動時間で律速するか
 * - `applyPersonalSpeed`: 個人速度の保存値を適用するか
 * - `sameHandSpeed` / `useCrossHandDirection` / `useFingerValues` / `useSimultaneousOverhead` / `useKeystrokeOverhead`:
 *   個人速度で計算している間に、保存値の部分ごとに時間へ使うか。使わない部分は、時間の計算へ渡す保存値から外す
 *   （`timing-conditions.ts`）。個人速度を適用しない時は読まれない
 * - `commaBeforeMs` / `commaAfterMs` / `periodBeforeMs` / `periodAfterMs`: 日本語のテキストの読点・句点の前後に足す待機 [ミリ秒]。
 *   打鍵の時間とは別に持つ。速度グラフの値には、待機を含む表示時間として入る（`spec/playback-timing.md` §3.9）
 * - `bunsetsuWaitMs`: 日本語のテキストの文節の区切りに足す待機 [ミリ秒]。0でない時だけ文節の分割器から区切りを受け取る
 * - `rateAverage` / `rateWindow` / `rateHalfLifeSeconds`: 速度グラフの平均の方式・SMAの直近Stroke数・EWMAの半減時間 [秒]
 * - `showChain` / `showArpeggio` / `showSameFingerMotion`: 構造の動的表示。Chain・Arpeggioの区間の中で、
 *   今のステップの押下へ向かうキーの動きと順番を配列図に重ねる
 * - `showFingerPositions` / `showPlannedKeys` / `showTrail` / `showOrderLabels`: 配列図に、指の位置・これから押すキー・
 *   押したキーの履歴・順番ラベルを出すか。それぞれ自分の表示だけを出し入れする。順番ラベルは、その時に出ている
 *   これから押すキーと履歴にだけ付き、Chain・Arpeggioの順番表示は切り替えの対象にしない
 * - `showRomajiInput`: ローマ字の規則を持つ配列で、入力の行を、打ち終えた単位はかな・打っている途中の単位とこの先の単位は
 *   ローマ字で出すか。真の時は、状態の行の「打鍵」と「予定」を出さない。偽の時は、入力の行はかなだけで、状態の行に両方を出す
 * - `showRomajiPlan`: ローマ字の規則を持つ配列で、今の入力単位のまだ押していないキーを配列図に出すか。
 *   これから押すキーの表示とは独立に出し入れし、順番ラベルが表示の時は、出ているこのキーにも順番を付ける
 * - `trailSteps`: 押下履歴に残すステップ数。履歴を出さない時は表示に影響しない
 * - `keyFeedbackStyle`: キーを押した瞬間の見せ方
 * - `fingerPreparationSeconds`: 指の位置を、次の押下より前に動かして見せる時間 [秒]。0なら押下の瞬間に切り替える
 * - `scale`: 配列図の倍率
 */
/** 同手・別指の速度に、保存値のどの段まで使うか。向きと組ごと・順序なしの組ごと・代表値だけ。 */
export const SAME_HAND_SPEED_PARTS = ['directed', 'pair', 'representative'] as const;
export type PlaybackSameHandSpeed = (typeof SAME_HAND_SPEED_PARTS)[number];

export const KEY_FEEDBACK_STYLES = ['off', 'fade', 'pulse', 'bounce'] as const;
export type PlaybackKeyFeedbackStyle = (typeof KEY_FEEDBACK_STYLES)[number];

export const PLAYBACK_PREPARATION_SECONDS_MIN = 0;
export const PLAYBACK_PREPARATION_SECONDS_MAX = 5;
export const PLAYBACK_TRAIL_STEPS_MIN = 1;
export const PLAYBACK_TRAIL_STEPS_MAX = 20;
export const DEFAULT_PLAYBACK_TRAIL_STEPS = 5;
export const PLAYBACK_SCALE_MIN = 0.5;
export const PLAYBACK_SCALE_MAX = 3;

export const playbackOptions = defineOptions({
  stepsPerSecond: defineOption<number>({
    schema: v.pipe(v.number(), v.minValue(PLAYBACK_STEPS_PER_SECOND_MIN), v.maxValue(PLAYBACK_STEPS_PER_SECOND_MAX)),
    default: DEFAULT_PLAYBACK_STEPS_PER_SECOND,
    affects: 'extract',
    url: numberUrlCodec('speed', PLAYBACK_STEPS_PER_SECOND_MIN, PLAYBACK_STEPS_PER_SECOND_MAX),
    label: '基準速度',
  }),
  speedMultiplier: defineOption<number>({
    schema: v.pipe(v.number(), v.minValue(PLAYBACK_SPEED_MULTIPLIER_MIN), v.maxValue(PLAYBACK_SPEED_MULTIPLIER_MAX)),
    default: DEFAULT_PLAYBACK_SPEED_MULTIPLIER,
    affects: 'extract',
    url: numberUrlCodec('multiplier', PLAYBACK_SPEED_MULTIPLIER_MIN, PLAYBACK_SPEED_MULTIPLIER_MAX),
    label: '再生倍率',
  }),
  sameFingerDelay: defineOption<boolean>({
    schema: v.boolean(),
    default: DEFAULT_PLAYBACK_SAME_FINGER_DELAY,
    affects: 'extract',
    url: booleanUrlCodec('fingerDelay'),
    label: '同じ指の移動時間を考慮',
  }),
  allFingerMovementDelay: defineOption<boolean>({
    schema: v.boolean(),
    default: DEFAULT_PLAYBACK_ALL_FINGER_MOVEMENT_DELAY,
    affects: 'extract',
    url: booleanUrlCodec('allFingerDelay'),
    label: '全指の移動時間で律速',
  }),
  applyPersonalSpeed: defineOption<boolean>({
    schema: v.boolean(),
    default: DEFAULT_PLAYBACK_APPLY_PERSONAL_SPEED,
    affects: 'extract',
    url: booleanUrlCodec('personalSpeed'),
    label: '個人速度',
  }),
  sameHandSpeed: defineOption<PlaybackSameHandSpeed>({
    schema: v.picklist(SAME_HAND_SPEED_PARTS),
    default: 'directed',
    affects: 'extract',
    url: picklistUrlCodec('sameHandSpeed', SAME_HAND_SPEED_PARTS),
    label: '同手・別指の速度',
  }),
  useCrossHandDirection: defineOption<boolean>({
    schema: v.boolean(),
    default: true,
    affects: 'extract',
    url: booleanUrlCodec('crossHandDirection'),
    label: '異手の方向別の速度',
  }),
  useFingerValues: defineOption<boolean>({
    schema: v.boolean(),
    default: true,
    affects: 'extract',
    url: booleanUrlCodec('fingerValues'),
    label: '指ごとの値',
  }),
  useSimultaneousOverhead: defineOption<boolean>({
    schema: v.boolean(),
    default: true,
    affects: 'extract',
    url: booleanUrlCodec('simultaneousOverhead'),
    label: '同時押しの上乗せ',
  }),
  useKeystrokeOverhead: defineOption<boolean>({
    schema: v.boolean(),
    default: true,
    affects: 'extract',
    url: booleanUrlCodec('keystrokeOverhead'),
    label: '打鍵の上乗せ',
  }),
  commaBeforeMs: defineOption<number>({
    schema: v.pipe(v.number(), v.integer(), v.minValue(PUNCTUATION_WAIT_MS_MIN), v.maxValue(PUNCTUATION_WAIT_MS_MAX)),
    default: 0,
    affects: 'extract',
    url: integerUrlCodec('commaBefore', PUNCTUATION_WAIT_MS_MIN, PUNCTUATION_WAIT_MS_MAX),
    label: '読点の前の待機',
  }),
  commaAfterMs: defineOption<number>({
    schema: v.pipe(v.number(), v.integer(), v.minValue(PUNCTUATION_WAIT_MS_MIN), v.maxValue(PUNCTUATION_WAIT_MS_MAX)),
    default: 0,
    affects: 'extract',
    url: integerUrlCodec('commaAfter', PUNCTUATION_WAIT_MS_MIN, PUNCTUATION_WAIT_MS_MAX),
    label: '読点の後の待機',
  }),
  periodBeforeMs: defineOption<number>({
    schema: v.pipe(v.number(), v.integer(), v.minValue(PUNCTUATION_WAIT_MS_MIN), v.maxValue(PUNCTUATION_WAIT_MS_MAX)),
    default: 0,
    affects: 'extract',
    url: integerUrlCodec('periodBefore', PUNCTUATION_WAIT_MS_MIN, PUNCTUATION_WAIT_MS_MAX),
    label: '句点の前の待機',
  }),
  periodAfterMs: defineOption<number>({
    schema: v.pipe(v.number(), v.integer(), v.minValue(PUNCTUATION_WAIT_MS_MIN), v.maxValue(PUNCTUATION_WAIT_MS_MAX)),
    default: 0,
    affects: 'extract',
    url: integerUrlCodec('periodAfter', PUNCTUATION_WAIT_MS_MIN, PUNCTUATION_WAIT_MS_MAX),
    label: '句点の後の待機',
  }),
  bunsetsuWaitMs: defineOption<number>({
    schema: v.pipe(v.number(), v.integer(), v.minValue(BUNSETSU_WAIT_MS_MIN), v.maxValue(BUNSETSU_WAIT_MS_MAX)),
    default: 0,
    affects: 'extract',
    url: integerUrlCodec('bunsetsuWait', BUNSETSU_WAIT_MS_MIN, BUNSETSU_WAIT_MS_MAX),
    label: '文節の区切りの待機',
  }),
  rateAverage: defineOption<PlaybackRateAverage>({
    schema: v.picklist(['sma', 'ewma']),
    default: DEFAULT_PLAYBACK_RATE_AVERAGE,
    affects: 'extract',
    url: picklistUrlCodec('rateAverage', ['sma', 'ewma'] as const),
    label: '平均の方式',
  }),
  rateWindow: defineOption<number>({
    schema: v.pipe(v.number(), v.integer(), v.minValue(PLAYBACK_RATE_WINDOW_MIN), v.maxValue(PLAYBACK_RATE_WINDOW_MAX)),
    default: DEFAULT_PLAYBACK_RATE_WINDOW,
    affects: 'extract',
    url: integerUrlCodec('rateWindow', PLAYBACK_RATE_WINDOW_MIN, PLAYBACK_RATE_WINDOW_MAX),
    label: '平均の窓幅',
  }),
  rateHalfLifeSeconds: defineOption<number>({
    schema: v.pipe(v.number(), v.minValue(PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN), v.maxValue(PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX)),
    default: DEFAULT_PLAYBACK_RATE_HALF_LIFE_SECONDS,
    affects: 'extract',
    url: numberUrlCodec('rateHalfLife', PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN, PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX),
    label: '平均の半減時間',
  }),
  showChain: defineOption<boolean>({
    schema: v.boolean(),
    default: false,
    affects: 'view',
    url: booleanUrlCodec('chain'),
    label: 'Chainの動的表示',
  }),
  showArpeggio: defineOption<boolean>({
    schema: v.boolean(),
    default: false,
    affects: 'view',
    url: booleanUrlCodec('arpeggio'),
    label: 'Arpeggioの動的表示',
  }),
  showSameFingerMotion: defineOption<boolean>({
    schema: v.boolean(),
    default: false,
    affects: 'view',
    url: booleanUrlCodec('sameFinger'),
    label: '同指移動の動的表示',
  }),
  showFingerPositions: defineOption<boolean>({
    schema: v.boolean(),
    default: false,
    affects: 'view',
    url: booleanUrlCodec('fingerPos'),
    label: '指の位置を表示',
  }),
  showPlannedKeys: defineOption<boolean>({
    schema: v.boolean(),
    default: false,
    affects: 'view',
    url: booleanUrlCodec('plan'),
    label: '押下予定キーを表示',
  }),
  showRomajiInput: defineOption<boolean>({
    schema: v.boolean(),
    default: true,
    affects: 'view',
    url: booleanUrlCodec('romajiInput'),
    label: '入力の行にローマ字を表示',
  }),
  showRomajiPlan: defineOption<boolean>({
    schema: v.boolean(),
    default: true,
    affects: 'view',
    url: booleanUrlCodec('romajiPlan'),
    label: '今のかなの残りキーを配列図に表示',
  }),
  showTrail: defineOption<boolean>({
    schema: v.boolean(),
    default: false,
    affects: 'view',
    url: booleanUrlCodec('trail'),
    label: '押下履歴を表示',
  }),
  trailSteps: defineOption<number>({
    schema: v.pipe(v.number(), v.integer(), v.minValue(PLAYBACK_TRAIL_STEPS_MIN), v.maxValue(PLAYBACK_TRAIL_STEPS_MAX)),
    default: DEFAULT_PLAYBACK_TRAIL_STEPS,
    affects: 'view',
    url: integerUrlCodec('trailSteps', PLAYBACK_TRAIL_STEPS_MIN, PLAYBACK_TRAIL_STEPS_MAX),
    label: '押下履歴を残すステップ数',
  }),
  showOrderLabels: defineOption<boolean>({
    schema: v.boolean(),
    default: false,
    affects: 'view',
    url: booleanUrlCodec('order'),
    label: '順番ラベルを表示',
  }),
  keyFeedbackStyle: defineOption<PlaybackKeyFeedbackStyle>({
    schema: v.picklist(KEY_FEEDBACK_STYLES),
    default: 'fade',
    affects: 'view',
    url: picklistUrlCodec('feedback', KEY_FEEDBACK_STYLES),
    label: '押下フィードバック',
  }),
  fingerPreparationSeconds: defineOption<number>({
    schema: v.pipe(v.number(), v.minValue(PLAYBACK_PREPARATION_SECONDS_MIN), v.maxValue(PLAYBACK_PREPARATION_SECONDS_MAX)),
    default: 0,
    affects: 'view',
    url: numberUrlCodec('prepare', PLAYBACK_PREPARATION_SECONDS_MIN, PLAYBACK_PREPARATION_SECONDS_MAX),
    label: '指位置の準備時間',
  }),
  scale: defineOption<number>({
    schema: v.pipe(v.number(), v.minValue(PLAYBACK_SCALE_MIN), v.maxValue(PLAYBACK_SCALE_MAX)),
    default: 1,
    affects: 'view',
    url: numberUrlCodec('scale', PLAYBACK_SCALE_MIN, PLAYBACK_SCALE_MAX),
    label: '配列図の倍率',
  }),
});

export type PlaybackOptions = typeof playbackOptions.defaultOptions;

export const DEFAULT_PLAYBACK_OPTIONS: PlaybackOptions = playbackOptions.defaultOptions;

/** 入れ忘れ防止テスト（`optionsDiscipline`）用の、既定値と異なる妥当な値の組。 */
export const ALTERNATE_PLAYBACK_OPTIONS: PlaybackOptions = {
  stepsPerSecond: 2,
  speedMultiplier: 2,
  sameFingerDelay: false,
  allFingerMovementDelay: false,
  applyPersonalSpeed: false,
  sameHandSpeed: 'representative',
  useCrossHandDirection: false,
  useFingerValues: false,
  useSimultaneousOverhead: false,
  useKeystrokeOverhead: false,
  commaBeforeMs: 300,
  commaAfterMs: 200,
  periodBeforeMs: 100,
  periodAfterMs: 500,
  bunsetsuWaitMs: 400,
  rateAverage: 'ewma',
  rateWindow: 20,
  rateHalfLifeSeconds: 2,
  showChain: true,
  showArpeggio: true,
  showSameFingerMotion: true,
  showFingerPositions: true,
  showPlannedKeys: true,
  showRomajiInput: false,
  showRomajiPlan: false,
  showTrail: true,
  trailSteps: 12,
  showOrderLabels: true,
  keyFeedbackStyle: 'bounce',
  fingerPreparationSeconds: 0.5,
  scale: 2,
};
