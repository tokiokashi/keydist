/**
 * 打鍵再生の解析設定の既定値と入力範囲。
 * 時間の計算（`playback.ts`）を読み込まずに解析設定の宣言から読めるよう、計算本体とは別に持つ。
 */

/** 再生速度の入力範囲。実際の打鍵時間や距離モデルとは無関係。 */
export const PLAYBACK_STEPS_PER_SECOND_MIN = 0.1;
export const PLAYBACK_STEPS_PER_SECOND_MAX = 20;
export type PlaybackStepsPerSecond = number;
export const DEFAULT_PLAYBACK_STEPS_PER_SECOND: PlaybackStepsPerSecond = 1.25;
export const PLAYBACK_SPEED_MULTIPLIER_MIN = 0.1;
export const PLAYBACK_SPEED_MULTIPLIER_MAX = 10;
export const DEFAULT_PLAYBACK_SPEED_MULTIPLIER = 1;
export const PLAYBACK_RATE_WINDOW_MIN = 1;
export const PLAYBACK_RATE_WINDOW_MAX = 50;
export const DEFAULT_PLAYBACK_RATE_WINDOW = 10;
export type PlaybackRateAverage = 'sma' | 'ewma';
export const DEFAULT_PLAYBACK_RATE_AVERAGE: PlaybackRateAverage = 'sma';
export const PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN = 0.1;
export const PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX = 10;
export const DEFAULT_PLAYBACK_RATE_HALF_LIFE_SECONDS = 1;

export const DEFAULT_PLAYBACK_SAME_FINGER_DELAY = true;
export const DEFAULT_PLAYBACK_ALL_FINGER_MOVEMENT_DELAY = true;
export const DEFAULT_PLAYBACK_APPLY_PERSONAL_SPEED = true;
