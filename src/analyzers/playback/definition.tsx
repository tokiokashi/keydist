import { Fragment, useContext, type ReactNode } from 'react';
import { OptionDisclosure, OptionGroup } from '#ui/primitives/option-fields.tsx';
import { PersonalSpeedLink, PersonalSpeedSavedContext } from '#ui/primitives/personal-speed-link.tsx';
import type { AnalyzerSettingsProps, SingleAnalyzerPaneParts } from '../pane-parts.tsx';
import { playbackDefinition, type PlaybackExtracted } from './extract.ts';
import { DEFAULT_PLAYBACK_OPTIONS, playbackOptions, type PlaybackOptions } from './options.ts';
import { usePlaybackFields } from './option-fields.tsx';
import { PLAYBACK_PANE_META } from './pane-meta.ts';
import { PlaybackBody } from './playback-view.tsx';
import { PLAYBACK_WINDOW_GROUPS, type PlaybackSettingsGroupId } from './settings-sections.ts';

/**
 * 再生の設定の小窓。変えると時間表と速度グラフを計算し直す項目（再生位置は保つ）だけを置く。
 * 表示だけが変わる項目は、配列図の見出しのボタンから開く小窓（`PlaybackFigureSettings`）に置く。
 * 項目の並びは`settings-sections.ts`の表に従う。
 */
export function PlaybackSettings({ options, onOptionsChange }: AnalyzerSettingsProps<PlaybackOptions>) {
  const fields = usePlaybackFields(options, onOptionsChange);
  const personalSpeedSaved = useContext(PersonalSpeedSavedContext);
  // グループの項目の後ろに付く、項目ではない案内とリンク
  const groupFooters: Partial<Record<PlaybackSettingsGroupId, ReactNode>> = {
    personalSpeed: (
      <>
        {!personalSpeedSaved && options.applyPersonalSpeed ? (
          <p className="option-field-hint" data-playback-personal-speed-missing>
            測定した個人速度がありません。測るまでは、個人速度を使わない時間で再生します。
          </p>
        ) : null}
        <PersonalSpeedLink className="option-field-link">個人速度の画面を開く</PersonalSpeedLink>
      </>
    ),
  };
  return (
    <div className="option-groups">
      {PLAYBACK_WINDOW_GROUPS.map((group) => (
        <OptionGroup key={group.id} title={group.title}>
          {group.keys.map((key) => (
            <Fragment key={key}>{fields[key]}</Fragment>
          ))}
          {group.detail === undefined ? null : (
            <OptionDisclosure
              title={group.detail.title}
              changedCount={group.detail.keys.filter((key) => options[key] !== DEFAULT_PLAYBACK_OPTIONS[key]).length}
            >
              {group.detail.keys.map((key) => (
                <Fragment key={key}>{fields[key]}</Fragment>
              ))}
            </OptionDisclosure>
          )}
          {groupFooters[group.id]}
        </OptionGroup>
      ))}
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
  // Run Chartの図で押された文字位置へ移る
  acceptsPlaybackSeek: true,
  // 文節の区切りの待機が0でない間だけ、区切りを分割器から受け取る
  usesSegmentation: (options) => options.bunsetsuWaitMs > 0,
} satisfies SingleAnalyzerPaneParts<PlaybackOptions, PlaybackExtracted>;
