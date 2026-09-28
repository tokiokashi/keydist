/**
 * Setupの手持ち（`SetupLibrary<SettingsValueMap>`）の保存先キー（#544 Phase 2）。
 *
 * このファイルがキーの定数だけを持つ理由: 実際のcodec（`SETUP_LIBRARY_CODEC`）は
 * `engine/setup-codec.ts` にあり、`SettingsValueMap`（engine層の型）を知っている。
 * `platform`は`input`しかimportできない層（`docs/architecture.md`の依存規則）なので、
 * `platform`側から具体のcodecを直接importして`load`/`save`をここに書くことはできない。
 * `createAssetTabSync`（`asset-tab-sync.ts`、資産の型を知らない汎用の仕組み）へ、
 * このキーと`engine`のcodecを両方渡して組み立てるのは、両方をimportできる`app`の仕事
 * （#544 Phase 2「app への配線はまだしない」。engine / hostsができた時に配線する）。
 *
 * 既存の資産キー（`keydist:geometry-shapes` `keydist:romaji-rules` `keydist:layouts`）と
 * 衝突しない名前にする。
 */
export const SETUP_LIBRARY_STORAGE_KEY = 'keydist:setup-library';
