import type { AssetCodec } from '#input/codec/index.ts';
import { presetLibraryCodec, type PresetLibrary } from '#input/presets/index.ts';
import { SETTINGS_ITEM_SCHEMAS } from './settings-codec.ts';
import type { SettingsValueMap } from './settings-items.ts';

/**
 * プリセットの手持ち（`PresetLibrary<SettingsValueMap>`）のcodec本体。
 * 項目のschemaは`SETTINGS_ITEM_SCHEMAS`をそのまま渡す（カスケードの上書きと同じ読み方）。
 * 版番号はカスケードと独立に1から始める（`values`の形がカスケード項目のレジストリに従うのは
 * 同じだが、資産のキーが別なので版も別に数える）。
 */
export const PRESET_LIBRARY_CODEC: AssetCodec<PresetLibrary<SettingsValueMap>> =
  presetLibraryCodec(SETTINGS_ITEM_SCHEMAS, 1);
