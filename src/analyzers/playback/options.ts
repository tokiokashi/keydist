import * as v from 'valibot';
import {
  booleanUrlCodec,
  defineOption,
  defineOptions,
  numberUrlCodec,
  picklistUrlCodec,
} from '#analyzers/options.ts';

/**
 * 打鍵再生Analyzerの解析設定。どれも表示だけが変わる項目で、Traceも抽出も作り直さない
 * （`affects: 'view'`）。再生の時間を決める条件（基準速度・再生倍率など）は含めない。
 *
 * - `showChain` / `showArpeggio` / `showSameFingerMotion`: 構造の動的表示。Chain・Arpeggioの区間の中で、
 *   今のステップの押下へ向かうキーの動きと順番を配列図に重ねる
 * - `keyFeedbackStyle`: キーを押した瞬間の見せ方
 * - `fingerPreparationSeconds`: 指の位置を、次の押下より前に動かして見せる時間 [秒]。0なら押下の瞬間に切り替える
 * - `scale`: 配列図の倍率
 */
export const KEY_FEEDBACK_STYLES = ['off', 'fade', 'pulse', 'bounce'] as const;
export type PlaybackKeyFeedbackStyle = (typeof KEY_FEEDBACK_STYLES)[number];

export const PLAYBACK_PREPARATION_SECONDS_MIN = 0;
export const PLAYBACK_PREPARATION_SECONDS_MAX = 5;
export const PLAYBACK_SCALE_MIN = 0.5;
export const PLAYBACK_SCALE_MAX = 3;

export const playbackOptions = defineOptions({
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
  showChain: true,
  showArpeggio: true,
  showSameFingerMotion: true,
  keyFeedbackStyle: 'bounce',
  fingerPreparationSeconds: 0.5,
  scale: 2,
};
