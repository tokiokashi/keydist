import type { PlaybackOptions } from './options.ts';

/**
 * 打鍵再生の解析設定の小窓の並び。節の下にグループ、グループの下に項目を置く。
 *
 * - 計算: 再生の時間と速度グラフの数値を変える項目（`affects: 'extract'`）
 * - 見た目: 配列図の見た目だけを変える項目（`affects: 'view'`）
 *
 * 小窓はこの表の順に項目を描く。どの項目をどの節に置くかは`settings-sections.test.ts`が`affects`と照らす。
 */
export type PlaybackSettingsGroupId =
  | 'timing'
  | 'personalSpeed'
  | 'rateAverage'
  | 'structure'
  | 'keysAndFingers'
  | 'layoutFigure';

export interface PlaybackSettingsGroup {
  readonly id: PlaybackSettingsGroupId;
  readonly title: string;
  readonly keys: readonly (keyof PlaybackOptions)[];
}

export interface PlaybackSettingsSection {
  readonly id: 'calculation' | 'appearance';
  readonly title: string;
  readonly groups: readonly PlaybackSettingsGroup[];
}

export const PLAYBACK_SETTINGS_SECTIONS: readonly PlaybackSettingsSection[] = [
  {
    id: 'calculation',
    title: '計算',
    groups: [
      {
        id: 'timing',
        title: '再生の時間',
        keys: ['stepsPerSecond', 'speedMultiplier', 'sameFingerDelay', 'allFingerMovementDelay'],
      },
      { id: 'personalSpeed', title: '個人速度', keys: ['applyPersonalSpeed'] },
      { id: 'rateAverage', title: '速度グラフの平均', keys: ['rateAverage', 'rateWindow', 'rateHalfLifeSeconds'] },
    ],
  },
  {
    id: 'appearance',
    title: '見た目',
    groups: [
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
    ],
  },
];
