import { setupLibraryCodec, type SetupLibrary } from '#input/setup/index.ts';
import type { AssetCodec } from '#input/codec/index.ts';
import { SETTINGS_ITEM_SCHEMAS } from './settings-codec.ts';
import type { SettingsValueMap } from './settings-items.ts';

/**
 * Setupの手持ち（`SetupLibrary<SettingsValueMap>`）のcodec本体（#544 §8-3・§4）。
 * カスケード項目のschemaは`SETTINGS_ITEM_SCHEMAS`（settings-codec.ts）をそのまま渡す。
 * カスケード上書き単体のcodecと版番号を共有する理由: Setupの手持ちに含まれる上書きは
 * カスケードの`setup`レベルの値そのもの（overrides.ts）で、値の形が変わるのは
 * カスケード項目のレジストリが変わった時だけだから。版が分かれていても実害は無いが、
 * 同じ理由で同時に変わるものを別の数として管理する意味が無いので揃えておく。
 */
export const SETUP_LIBRARY_CODEC: AssetCodec<SetupLibrary<SettingsValueMap>> =
  setupLibraryCodec(SETTINGS_ITEM_SCHEMAS, 1);
