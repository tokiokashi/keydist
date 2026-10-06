/**
 * 自作の指割り当て（`readonly FingerAssignment[]`）の保存先キー。
 *
 * codec（`USER_FINGER_ASSIGNMENTS_CODEC`）は`input/shapes/user-finger-assignments.ts`にあり、
 * `SetupLibrary`（`setup-library-storage.ts`）と違って`SettingsValueMap`等engine固有の型を
 * 一切参照しない（`FingerAssignment`だけで完結する）。そのため`platform`がcodecを直接
 * importしても依存規則（`docs/architecture.md`: `platform`は`input`をimportできる）に反しない。
 *
 * ただし実際に`createAssetTabSync`（`asset-tab-sync.ts`）へこのキーとcodecを渡して
 * 組み立てるのは`app`の仕事。ここはキーの定数だけを持つ（`setup-library-storage.ts`と同じ形）。
 *
 * 既存の資産キー（geometry-shapes / romaji-rules / layouts / setup-library）と衝突しない名前にする。
 */
export const USER_FINGER_ASSIGNMENTS_STORAGE_KEY = 'keydist:finger-assignments';
