import {
  bindOption,
  CheckboxOptionField,
  OptionGroup,
  RangeOptionField,
  SelectOptionField,
} from '#ui/primitives/option-fields.tsx';
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

/**
 * 表示の設定。どれも表示だけが変わり、再生位置も計算も作り直さない。
 * 再生の速さなど時間を決める条件は、ここに置かない。
 */
export function PlaybackSettings({ options, onOptionsChange }: AnalyzerSettingsProps<PlaybackOptions>) {
  const bind = <K extends keyof PlaybackOptions>(key: K) =>
    bindOption(options, DEFAULT_PLAYBACK_OPTIONS, onOptionsChange, key);
  return (
    <div className="option-groups">
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
} satisfies SingleAnalyzerPaneParts<PlaybackOptions, PlaybackExtracted>;
