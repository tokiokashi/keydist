import { useContext } from 'react';
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
  OptionGroup,
  RangeOptionField,
  SegmentedOptionField,
  SelectOptionField,
  type OptionBinding,
} from '#ui/primitives/option-fields.tsx';
import { PersonalSpeedLink, PersonalSpeedSavedContext } from '#ui/primitives/personal-speed-link.tsx';
import type { AnalyzerSettingsProps, SingleAnalyzerPaneParts } from '../pane-parts.tsx';
import { playbackDefinition, type PlaybackExtracted } from './extract.ts';
import {
  DEFAULT_PLAYBACK_OPTIONS,
  PLAYBACK_PREPARATION_SECONDS_MAX,
  PLAYBACK_PREPARATION_SECONDS_MIN,
  PLAYBACK_SCALE_MAX,
  PLAYBACK_SCALE_MIN,
  playbackOptions,
  type PlaybackOptions,
} from './options.ts';
import { PLAYBACK_PANE_META } from './pane-meta.ts';
import { PlaybackBody } from './playback-view.tsx';

const ON_OFF = [
  { value: 'on', label: 'ON' },
  { value: 'off', label: 'OFF' },
] as const;

/**
 * 再生の設定。表示の項目は表示だけが変わり、再生位置も計算も作り直さない。
 * 時間と速度グラフの平均の項目は、変えると時間表と速度グラフを計算し直す（再生位置は保つ）。
 */
export function PlaybackSettings({ options, onOptionsChange }: AnalyzerSettingsProps<PlaybackOptions>) {
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
  return (
    <div className="option-groups">
      <OptionGroup title="再生の時間">
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
        <NumberOptionField
          label="再生倍率"
          binding={bind('speedMultiplier')}
          min={PLAYBACK_SPEED_MULTIPLIER_MIN}
          max={PLAYBACK_SPEED_MULTIPLIER_MAX}
          step={0.1}
          unit="倍"
          hint="個人速度で計算している時も、最後に掛ける倍率です。"
        />
        <SegmentedOptionField
          label="指の移動速度を考慮"
          binding={bindOnOff('sameFingerDelay')}
          choices={ON_OFF}
          hint="同じ指が離れたキーへ移る時間を、ステップの長さに入れます。"
        />
        <SegmentedOptionField
          label="全指の移動時間で律速"
          binding={bindOnOff('allFingerMovementDelay')}
          choices={ON_OFF}
          hint="すべての指が次のキーへ移るのに要する時間より、ステップが短くならないようにします。"
        />
      </OptionGroup>
      <OptionGroup title="個人速度">
        <SegmentedOptionField
          label="個人速度"
          binding={bindOnOff('applyPersonalSpeed')}
          choices={[{ value: 'on', label: '適用する' }, { value: 'off', label: '適用しない' }]}
          hint="個人速度の画面で測った速さで、再生の時間を求めます。"
        />
        {!personalSpeedSaved && options.applyPersonalSpeed ? (
          <p className="option-field-hint" data-playback-personal-speed-missing>
            測定した個人速度がありません。測るまでは、個人速度を使わない時間で再生します。
          </p>
        ) : null}
        <PersonalSpeedLink className="option-field-link">個人速度の画面を開く</PersonalSpeedLink>
      </OptionGroup>
      <OptionGroup title="速度グラフの平均">
        <SegmentedOptionField
          label="平均の方式"
          binding={bind('rateAverage')}
          choices={[{ value: 'sma', label: 'SMA' }, { value: 'ewma', label: 'EWMA' }]}
          hint="SMAは直近の打鍵の単純な平均、EWMAは古い打鍵ほど寄与を時間で減らす平均です。"
        />
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
      </OptionGroup>
      <OptionGroup title="構造の動的表示">
        <CheckboxOptionField
          label="Chainの動的表示"
          binding={bind('showChain')}
          hint="Chainの区間で、前のキーから今押すキーへの動きと、区間の中での順番を配列図に重ねます。"
        />
        <CheckboxOptionField
          label="Arpeggioの動的表示"
          binding={bind('showArpeggio')}
          hint="Arpeggioの区間で、前のキーから今押すキーへの動きと、区間の中での順番を配列図に重ねます。"
        />
        <CheckboxOptionField
          label="同指移動の動的表示"
          binding={bind('showSameFingerMotion')}
          hint="同じ指が離れたキーへ移る動きを配列図に重ねます。"
        />
      </OptionGroup>
      <OptionGroup title="キーと指">
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
        <RangeOptionField
          label="指位置の準備時間"
          binding={bind('fingerPreparationSeconds')}
          min={PLAYBACK_PREPARATION_SECONDS_MIN}
          max={PLAYBACK_PREPARATION_SECONDS_MAX}
          step={0.05}
          format={(value) => `${value.toFixed(2)}秒`}
          hint="指の位置を、次に押す時刻よりこの時間だけ早く動かして見せます。0秒なら押した瞬間に切り替えます。"
        />
      </OptionGroup>
      <OptionGroup title="配列図">
        <RangeOptionField
          label="倍率"
          binding={bind('scale')}
          min={PLAYBACK_SCALE_MIN}
          max={PLAYBACK_SCALE_MAX}
          step={0.25}
          format={(value) => `${value}倍`}
        />
      </OptionGroup>
    </div>
  );
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const playbackAnalyzer = {
  definition: playbackDefinition,
  ...PLAYBACK_PANE_META,
  Body: PlaybackBody,
  Settings: PlaybackSettings,
  defaultOptions: DEFAULT_PLAYBACK_OPTIONS,
  urlOptions: playbackOptions,
  // 再生はChain・Arpeggioの数え方を読むので、要約に数える
  conditionExtraIds: ['chainInterpretation', 'arpeggioInterpretation'],
} satisfies SingleAnalyzerPaneParts<PlaybackOptions, PlaybackExtracted>;
