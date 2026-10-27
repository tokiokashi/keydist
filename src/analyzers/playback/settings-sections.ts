import type { PlaybackOptions } from './options.ts';

/**
 * 打鍵再生の設定項目の置き場。グループの下に項目を置く。
 *
 * - 解析設定の小窓: 再生の時間と速度グラフの数値を変える項目（`affects: 'extract'`）
 * - 配列図の表示の小窓: 表示だけを変える項目（`affects: 'view'`）。ChainとArpeggioの2項目は速度グラフの帯も切り替えるが、
 *   どちらの図でも同じ構造の表示を切り替える項目なので、配列図の表示の小窓に置く
 *
 * 二つの小窓はこの表の順に項目を描く。どの項目をどちらに置くかは`settings-sections.test.ts`が`affects`と照らす。
 */
export type PlaybackSettingsGroupId =
  | 'timing'
  | 'personalSpeed'
  | 'punctuationWait'
  | 'bunsetsuWait'
  | 'rateAverage'
  | 'inputRow'
  | 'structure'
  | 'keysAndFingers'
  | 'layoutFigure';

export interface PlaybackSettingsGroup {
  readonly id: PlaybackSettingsGroupId;
  readonly title: string;
  readonly keys: readonly (keyof PlaybackOptions)[];
  /** 個別に変えたい人向けに、畳んだ節（既定は閉じた状態）の中へ置く項目 */
  readonly detail?: { readonly title: string; readonly keys: readonly (keyof PlaybackOptions)[] };
}

export const PLAYBACK_WINDOW_GROUPS: readonly PlaybackSettingsGroup[] = [
  {
    id: 'timing',
    title: '再生の時間',
    keys: ['stepsPerSecond', 'speedMultiplier', 'sameFingerDelay', 'allFingerMovementDelay'],
  },
  {
    id: 'personalSpeed',
    title: '個人速度',
    keys: ['applyPersonalSpeed'],
    detail: {
      title: '項目ごとの設定',
      keys: ['sameHandSpeed', 'useCrossHandDirection', 'useFingerValues', 'useSimultaneousOverhead', 'useKeystrokeOverhead'],
    },
  },
  {
    id: 'punctuationWait',
    title: '読点・句点の待機',
    keys: ['commaBeforeMs', 'commaAfterMs', 'periodBeforeMs', 'periodAfterMs'],
  },
  { id: 'bunsetsuWait', title: '文節の区切り', keys: ['bunsetsuWaitMs'] },
  { id: 'rateAverage', title: '速度グラフの平均', keys: ['rateAverage', 'rateWindow', 'rateHalfLifeSeconds'] },
];

export const PLAYBACK_FIGURE_GROUPS: readonly PlaybackSettingsGroup[] = [
  { id: 'inputRow', title: '入力の行と状態の行', keys: ['showRomajiInput'] },
  { id: 'structure', title: '構造の動的表示', keys: ['showChain', 'showArpeggio', 'showSameFingerMotion'] },
  {
    id: 'keysAndFingers',
    title: 'キーと指',
    keys: [
      'showFingerPositions',
      'showPlannedKeys',
      'showRomajiPlan',
      'showTrail',
      'trailSteps',
      'showOrderLabels',
      'keyFeedbackStyle',
      'fingerPreparationSeconds',
    ],
  },
  { id: 'layoutFigure', title: '配列図', keys: ['scale'] },
];
