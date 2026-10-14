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
} from '#interpretation/timing/playback.ts';
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

/**
 * 打鍵再生の設定項目の入力欄。解析設定の小窓（計算の項目）と配列図の表示の小窓（見た目の項目）が、
 * どちらもここから同じ入力欄を取る。どの項目をどちらに置くかは`settings-sections.ts`の表が決める。
 */
export function usePlaybackFields(
  options: PlaybackOptions,
  onOptionsChange: (next: PlaybackOptions) => void,
): Record<keyof PlaybackOptions, ReactNode> {
  const bind = <K extends keyof PlaybackOptions>(key: K) =>
    bindOption(options, DEFAULT_PLAYBACK_OPTIONS, onOptionsChange, key);
  const bindOnOff = (key: 'sameFingerDelay' | 'allFingerMovementDelay' | 'applyPersonalSpeed'): OptionBinding<'on' | 'off'> => {
    const inner = bind(key);
    return {
      value: inner.value ? 'on' : 'off',
      defaultValue: inner.defaultValue ? 'on' : 'off',
      onChange: (next) => inner.onChange(next === 'on'),
    };
  };
  const personalSpeedSaved = useContext(PersonalSpeedSavedContext);
  const personalSpeedInUse = personalSpeedSaved && options.applyPersonalSpeed;
  const fields: Record<keyof PlaybackOptions, ReactNode> = {
    stepsPerSecond: (
      <NumberOptionField
        label="基準速度"
        binding={bind('stepsPerSecond')}
        min={PLAYBACK_STEPS_PER_SECOND_MIN}
        max={PLAYBACK_STEPS_PER_SECOND_MAX}
        step={0.05}
        unit="ステップ/秒"
        hint={personalSpeedInUse
          ? '1秒に進むステップ数。個人速度で計算しているため、基準速度は使われません。'
          : '1秒に進むステップ数。個人速度で計算している間は使われません。'}
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
        hint="個人速度で計算している時も、最後に掛ける倍率です。"
      />
    ),
    sameFingerDelay: (
      <SegmentedOptionField
        label="指の移動速度を考慮"
        binding={bindOnOff('sameFingerDelay')}
        choices={ON_OFF}
        hint="同じ指が離れたキーへ移る時間を、ステップの長さに入れます。"
      />
    ),
    allFingerMovementDelay: (
      <SegmentedOptionField
        label="全指の移動時間で律速"
        binding={bindOnOff('allFingerMovementDelay')}
        choices={ON_OFF}
        hint="すべての指が次のキーへ移るのに要する時間より、ステップが短くならないようにします。"
      />
    ),
    applyPersonalSpeed: (
      <SegmentedOptionField
        label="個人速度"
        binding={bindOnOff('applyPersonalSpeed')}
        choices={[{ value: 'on', label: '適用する' }, { value: 'off', label: '適用しない' }]}
        hint="個人速度の画面で測った速さで、再生の時間を求めます。"
      />
    ),
    rateAverage: (
      <SegmentedOptionField
        label="平均の方式"
        binding={bind('rateAverage')}
        choices={[{ value: 'sma', label: 'SMA' }, { value: 'ewma', label: 'EWMA' }]}
        hint="SMAは直近の打鍵の単純な平均、EWMAは古い打鍵ほど寄与を時間で減らす平均です。"
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
        unit="打鍵"
        hint={options.rateAverage === 'ewma'
          ? 'SMAで平均する直近の打鍵数。平均の方式がEWMAのため、窓幅は使われません。'
          : 'SMAで平均する直近の打鍵数。'}
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
        hint={options.rateAverage === 'sma'
          ? 'EWMAで、打鍵の寄与が半分になるまでの時間。平均の方式がSMAのため、半減時間は使われません。'
          : 'EWMAで、打鍵の寄与が半分になるまでの時間。'}
      />
    ),
    showChain: (
      <CheckboxOptionField
        label="Chainの動的表示"
        binding={bind('showChain')}
        hint="Chainの区間で、前のキーから今押すキーへの動きと、区間の中での順番を配列図に重ねます。速度グラフにも、区間を帯で示します。"
      />
    ),
    showArpeggio: (
      <CheckboxOptionField
        label="Arpeggioの動的表示"
        binding={bind('showArpeggio')}
        hint="Arpeggioの区間で、前のキーから今押すキーへの動きと、区間の中での順番を配列図に重ねます。速度グラフにも、区間を帯で示します。"
      />
    ),
    showSameFingerMotion: (
      <CheckboxOptionField
        label="同指移動の動的表示"
        binding={bind('showSameFingerMotion')}
        hint="同じ指が離れたキーへ移る動きを配列図に重ねます。"
      />
    ),
    showFingerPositions: (
      <CheckboxOptionField
        label="指の位置を表示"
        binding={bind('showFingerPositions')}
        hint="各指が今いるキーを、指ごとの色で配列図に出します。"
      />
    ),
    showPlannedKeys: (
      <CheckboxOptionField
        label="押下予定キーを表示"
        binding={bind('showPlannedKeys')}
        hint="これから押すキーを、先読みNで決まる入力先まで配列図に出します。先読みNは条件で変えます。距離の計算にも使う値なので、変えると距離の数値も変わります。"
      />
    ),
    showRomajiInput: (
      <CheckboxOptionField
        label="入力の行にローマ字を表示"
        binding={bind('showRomajiInput')}
        hint="ローマ字の規則を持つ配列で、入力の行の打っている途中の単位とこの先の単位をローマ字で出し、打ち終えた単位はかなで出します。オンの間は、状態の行の「打鍵」と「予定」は出ません。ローマ字の規則を持たない配列では変わりません。"
      />
    ),
    showRomajiPlan: (
      <CheckboxOptionField
        label="今のかなの残りキーを配列図に表示"
        binding={bind('showRomajiPlan')}
        hint="ローマ字の規則を持つ配列で、今の入力単位のまだ押していないキーを、押下予定キーと同じ緑の塗りで配列図に出します。ローマ字の規則を持たない配列では出ません。"
      />
    ),
    showTrail: (
      <CheckboxOptionField
        label="押下履歴を表示"
        binding={bind('showTrail')}
        hint="押したキーを、残すステップ数の分だけ配列図に残します。"
      />
    ),
    trailSteps: (
      <NumberOptionField
        label="押下履歴を残すステップ数"
        binding={bind('trailSteps')}
        min={PLAYBACK_TRAIL_STEPS_MIN}
        max={PLAYBACK_TRAIL_STEPS_MAX}
        step={1}
        integer
        unit="ステップ"
        hint={options.showTrail
          ? '押したキーを何ステップ前まで残すかです。'
          : '押したキーを何ステップ前まで残すかです。押下履歴を表示しない間は使われません。'}
      />
    ),
    showOrderLabels: (
      <CheckboxOptionField
        label="順番ラベルを表示"
        binding={bind('showOrderLabels')}
        hint="出ている押下予定キー・予定ローマ字のキー・押下履歴に、押す順番を付けます。ChainとArpeggioの順番には関わりません。"
      />
    ),
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
        hint="指の位置を、次に押す時刻よりこの時間だけ早く動かして見せます。0秒なら押した瞬間に切り替えます。"
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
