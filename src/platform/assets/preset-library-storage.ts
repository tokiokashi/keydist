/**
 * プリセットの手持ち（`PresetLibrary<SettingsValueMap>`）の保存先キー。
 *
 * `setupLibrary`に同居させず独立したキーにする: プリセットの保存・削除・書き出しは
 * Setupの手持ちと整合を取る必要が無く、別キーなら他タブがプリセットを書いても
 * このタブのカスケード上書きのUndo履歴が消えない（`applyExternalChange`は資産キー単位で
 * 履歴を絞るため）。codecは`engine/preset-codec.ts`（`platform`は`engine`をimportできない
 * ので、束ねるのは`app`。`setup-library-storage.ts`と同じ分担）。
 */
export const PRESET_LIBRARY_STORAGE_KEY = 'keydist:presets';
