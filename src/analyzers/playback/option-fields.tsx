import { useContext, type ReactNode } from 'react';
import {
  PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX,
  PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN,
  PLAYBACK_RATE_WINDOW_MAX,
  PLAYBACK_RATE_WINDOW_MIN,
  PLAYBACK_SPEED_MULTIPLIER_MAX,
  PLAYBACK_SPEED_MULTIPLIER_MIN,
  PLAYBACK_STEPS_PER_SECOND_MAX,
  PLAYBACK_STEPS_PER_SECOND_MIN,
} from '#interpretation/timing/playback-options.ts';
import { BUNSETSU_WAIT_MS_MAX, BUNSETSU_WAIT_MS_MIN } from '#interpretation/timing/bunsetsu-wait.ts';
import { PUNCTUATION_WAIT_MS_MAX, PUNCTUATION_WAIT_MS_MIN } from '#interpretation/timing/punctuation-wait.ts';
import {
  bindOption,
  CheckboxOptionField,
  NumberOptionField,
  RangeOptionField,
  SegmentedOptionField,
  SelectOptionField,
  type OptionBinding,
} from '#ui/primitives/option-fields.tsx';
import { PersonalSpeedSavedContext } from '#ui/primitives/personal-speed-link.tsx';
import {
  DEFAULT_PLAYBACK_OPTIONS,
  PLAYBACK_PREPARATION_SECONDS_MAX,
  PLAYBACK_PREPARATION_SECONDS_MIN,
  PLAYBACK_SCALE_MAX,
  PLAYBACK_SCALE_MIN,
  PLAYBACK_TRAIL_STEPS_MAX,
  PLAYBACK_TRAIL_STEPS_MIN,
  type PlaybackOptions,
} from './options.ts';

const ON_OFF = [
  { value: 'on', label: 'ON' },
  { value: 'off', label: 'OFF' },
] as const;

const USE_NOT_USE = [
  { value: 'on', label: '使う' },
  { value: 'off', label: '使わない' },
] as const;

/**
 * 打鍵再生の設定項目の入力欄。解析設定の小窓（計算の項目）と配列図の表示の小窓（見た目の項目）が、
 * どちらもここから同じ入力欄を取る。どの項目をどちらに置くかは`settings-sections.ts`の表が決める。
 */
export function usePlaybackFields(options: PlaybackOptions, onOptionsChange: (next: PlaybackOptions) => void): Record<keyof PlaybackOptions, ReactNode> {
  const bind = <K extends keyof PlaybackOptions>(key: K) => bindOption(options, DEFAULT_PLAYBACK_OPTIONS, onOptionsChange, key);
  const bindOnOff = (
    key:
      | 'sameFingerDelay'
      | 'allFingerMovementDelay'
      | 'applyPersonalSpeed'
      | 'useCrossHandDirection'
      | 'useFingerValues'
      | 'useSimultaneousOverhead'
      | 'useKeystrokeOverhead',
  ): OptionBinding<'on' | 'off'> => {
    const inner = bind(key);
    return {
      value: inner.value ? 'on' : 'off',
      defaultValue: inner.defaultValue ? 'on' : 'off',
      onChange: (next) => inner.onChange(next === 'on'),
    };
  };
  const personalSpeedSaved = useContext(PersonalSpeedSavedContext);
  const personalSpeedInUse = personalSpeedSaved && options.applyPersonalSpeed;
  // 保存値の部分の設定は、個人速度を適用しない間は読まれない
  const unusedWithoutPersonalSpeed = options.applyPersonalSpeed ? undefined : '個人速度を適用しないため、この設定は使われません。';
  const fields: Record<keyof PlaybackOptions, ReactNode> = {
    stepsPerSecond: (
      <NumberOptionField
        label="基準速度"
        binding={bind('stepsPerSecond')}
        min={PLAYBACK_STEPS_PER_SECOND_MIN}
        max={PLAYBACK_STEPS_PER_SECOND_MAX}
        step={0.05}
        unit="ステップ/秒"
        hint={personalSpeedInUse ? '個人速度で計算しているため、基準速度は使われません。' : undefined}
      />
    ),
    speedMultiplier: (
      <NumberOptionField
        label="再生倍率"
        binding={bind('speedMultiplier')}
        min={PLAYBACK_SPEED_MULTIPLIER_MIN}
        max={PLAYBACK_SPEED_MULTIPLIER_MAX}
        step={0.1}
        unit="倍"
      />
    ),
    sameFingerDelay: <SegmentedOptionField label="同じ指の移動時間を考慮" binding={bindOnOff('sameFingerDelay')} choices={ON_OFF} />,
    allFingerMovementDelay: <SegmentedOptionField label="全指の移動時間で律速" binding={bindOnOff('allFingerMovementDelay')} choices={ON_OFF} />,
    applyPersonalSpeed: (
      <SegmentedOptionField
        label="個人速度"
        binding={bindOnOff('applyPersonalSpeed')}
        choices={[
          { value: 'on', label: '適用する' },
          { value: 'off', label: '適用しない' },
        ]}
      />
    ),
    sameHandSpeed: (
      <SegmentedOptionField
        label="同手・別指の速度"
        binding={bind('sameHandSpeed')}
        choices={[
          { value: 'directed', label: '組と向きごと' },
          { value: 'pair', label: '組ごと' },
          { value: 'representative', label: '代表値だけ' },
        ]}
        hint={unusedWithoutPersonalSpeed}
      />
    ),
    useCrossHandDirection: (
      <SegmentedOptionField
        label="異手の方向別の速度"
        binding={bindOnOff('useCrossHandDirection')}
        choices={USE_NOT_USE}
        hint={unusedWithoutPersonalSpeed}
      />
    ),
    useFingerValues: (
      <SegmentedOptionField label="指ごとの値" binding={bindOnOff('useFingerValues')} choices={USE_NOT_USE} hint={unusedWithoutPersonalSpeed} />
    ),
    useSimultaneousOverhead: (
      <SegmentedOptionField
        label="同時押しの上乗せ"
        binding={bindOnOff('useSimultaneousOverhead')}
        choices={USE_NOT_USE}
        hint={unusedWithoutPersonalSpeed}
      />
    ),
    useKeystrokeOverhead: (
      <SegmentedOptionField label="打鍵の上乗せ" binding={bindOnOff('useKeystrokeOverhead')} choices={USE_NOT_USE} hint={unusedWithoutPersonalSpeed} />
    ),
    commaBeforeMs: (
      <NumberOptionField
        label="読点の前の待機"
        binding={bind('commaBeforeMs')}
        min={PUNCTUATION_WAIT_MS_MIN}
        max={PUNCTUATION_WAIT_MS_MAX}
        step={50}
        integer
        unit="ミリ秒"
      />
    ),
    commaAfterMs: (
      <NumberOptionField
        label="読点の後の待機"
        binding={bind('commaAfterMs')}
        min={PUNCTUATION_WAIT_MS_MIN}
        max={PUNCTUATION_WAIT_MS_MAX}
        step={50}
        integer
        unit="ミリ秒"
      />
    ),
    periodBeforeMs: (
      <NumberOptionField
        label="句点の前の待機"
        binding={bind('periodBeforeMs')}
        min={PUNCTUATION_WAIT_MS_MIN}
        max={PUNCTUATION_WAIT_MS_MAX}
        step={50}
        integer
        unit="ミリ秒"
      />
    ),
    periodAfterMs: (
      <NumberOptionField
        label="句点の後の待機"
        binding={bind('periodAfterMs')}
        min={PUNCTUATION_WAIT_MS_MIN}
        max={PUNCTUATION_WAIT_MS_MAX}
        step={50}
        integer
        unit="ミリ秒"
      />
    ),
    bunsetsuWaitMs: (
      <NumberOptionField
        label="文節の区切りの待機"
        binding={bind('bunsetsuWaitMs')}
        min={BUNSETSU_WAIT_MS_MIN}
        max={BUNSETSU_WAIT_MS_MAX}
        step={50}
        integer
        unit="ミリ秒"
      />
    ),
    rateAverage: (
      <SegmentedOptionField
        label="平均の方式"
        binding={bind('rateAverage')}
        choices={[
          { value: 'sma', label: 'SMA' },
          { value: 'ewma', label: 'EWMA' },
        ]}
      />
    ),
    rateWindow: (
      <NumberOptionField
        label="平均の窓幅"
        binding={bind('rateWindow')}
        min={PLAYBACK_RATE_WINDOW_MIN}
        max={PLAYBACK_RATE_WINDOW_MAX}
        step={1}
        integer
        unit="アクション"
        hint={options.rateAverage === 'ewma' ? '平均の方式がEWMAのため、窓幅は使われません。' : undefined}
      />
    ),
    rateHalfLifeSeconds: (
      <NumberOptionField
        label="平均の半減時間"
        binding={bind('rateHalfLifeSeconds')}
        min={PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN}
        max={PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX}
        step={0.1}
        unit="秒"
        hint={options.rateAverage === 'sma' ? '平均の方式がSMAのため、半減時間は使われません。' : undefined}
      />
    ),
    showChain: <CheckboxOptionField label="Chainの動的表示" binding={bind('showChain')} />,
    showArpeggio: <CheckboxOptionField label="Arpeggioの動的表示" binding={bind('showArpeggio')} />,
    showSameFingerMotion: <CheckboxOptionField label="同指移動の動的表示" binding={bind('showSameFingerMotion')} />,
    showFingerPositions: <CheckboxOptionField label="指の位置を表示" binding={bind('showFingerPositions')} />,
    showPlannedKeys: <CheckboxOptionField label="押下予定キーを表示" binding={bind('showPlannedKeys')} />,
    showRomajiInput: <CheckboxOptionField label="入力の行にローマ字を表示" binding={bind('showRomajiInput')} />,
    showRomajiPlan: <CheckboxOptionField label="今のかなの残りキーを配列図に表示" binding={bind('showRomajiPlan')} />,
    showTrail: <CheckboxOptionField label="押下履歴を表示" binding={bind('showTrail')} />,
    trailSteps: (
      <NumberOptionField
        label="押下履歴を残すステップ数"
        binding={bind('trailSteps')}
        min={PLAYBACK_TRAIL_STEPS_MIN}
        max={PLAYBACK_TRAIL_STEPS_MAX}
        step={1}
        integer
        unit="ステップ"
        hint={options.showTrail ? undefined : '押下履歴を表示しない間は使われません。'}
      />
    ),
    showOrderLabels: <CheckboxOptionField label="順番ラベルを表示" binding={bind('showOrderLabels')} />,
    keyFeedbackStyle: (
      <SelectOptionField
        label="押下フィードバック"
        binding={bind('keyFeedbackStyle')}
        choices={[
          { value: 'off', label: 'なし' },
          { value: 'fade', label: 'フェード' },
          { value: 'pulse', label: 'パルス' },
          { value: 'bounce', label: 'バウンス' },
        ]}
      />
    ),
    fingerPreparationSeconds: (
      <RangeOptionField
        label="指位置の準備時間"
        binding={bind('fingerPreparationSeconds')}
        min={PLAYBACK_PREPARATION_SECONDS_MIN}
        max={PLAYBACK_PREPARATION_SECONDS_MAX}
        step={0.05}
        format={(value) => `${value.toFixed(2)}秒`}
      />
    ),
    scale: (
      <RangeOptionField
        label="倍率"
        binding={bind('scale')}
        min={PLAYBACK_SCALE_MIN}
        max={PLAYBACK_SCALE_MAX}
        step={0.25}
        format={(value) => `${value}倍`}
      />
    ),
  };
  return fields;
}
