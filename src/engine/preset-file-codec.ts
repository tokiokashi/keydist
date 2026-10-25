import { defineAssetCodec, isRecord, type AssetCodec } from '#input/codec/index.ts';
import { decodePresets, encodePresets, type Preset } from '#input/presets/index.ts';
import { SETTINGS_ITEM_SCHEMAS } from './settings-codec.ts';
import type { SettingsValueMap } from './settings-items.ts';
import {
  decodeUserAssetsBundle,
  EMPTY_USER_ASSETS_BUNDLE,
  encodeUserAssetsBundle,
  isEmptyUserAssetsBundle,
  type UserAssetsBundle,
} from './user-assets-file.ts';
import { decodeWorkspaces, encodeWorkspaces } from './workspace-codec.ts';
import type { WorkspaceLibrary } from './workspace.ts';

/**
 * 書き出しファイルの本体（プリセットとWorkspaceを渡すための封筒）のcodec。
 * payloadは`{ presets?, workspaces? }`で、どちらか一方だけのファイルも読める（無い側は空）。
 * 書く時は空の側を出さないので、プリセットだけ・Workspaceだけのファイルになる。
 *
 * `userAssets`は、Workspaceが参照する自作の資産（配列・ローマ字規則・指の割り当て・Setup。形は資産のファイルと同じ）を
 * 同梱する場所。無ければ（資産を参照しないWorkspace、プリセットだけのファイル）空になる。
 * 項目を足しただけで、無いファイルは同じ形で読めるので版は上げない。
 *
 * 要素の読み方は、手元の保存と同じ`decodePresets`・`decodeWorkspaces`を使う（壊れた要素だけ捨てて診断を積む）。
 * 診断のpathは`presets[…]`・`workspaces[…]`で始まり、読み手がどちらの診断かを見分けられる。
 */
export interface PresetFileContents {
  readonly presets: readonly Preset<SettingsValueMap>[];
  readonly workspaces: WorkspaceLibrary;
  /** Workspaceに同梱した自作の資産。 */
  readonly userAssets: UserAssetsBundle;
}

export const PRESET_FILE_CODEC: AssetCodec<PresetFileContents> = defineAssetCodec({
  currentVersion: 2,
  // 版1はプリセットだけのファイル。版2の「presetsだけ」と同じ形なので、そのまま読む
  migrations: [{ fromVersion: 1, toVersion: 2, migrate: (payload) => payload }],
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    return {
      presets: decodePresets(SETTINGS_ITEM_SCHEMAS, payload.presets, 'presets', diagnostics),
      workspaces: decodeWorkspaces(payload.workspaces, 'workspaces', diagnostics),
      userAssets: isRecord(payload.userAssets) ? decodeUserAssetsBundle(payload.userAssets, 'userAssets.', diagnostics) : EMPTY_USER_ASSETS_BUNDLE,
    };
  },
  encodePayload: (contents) => ({
    ...(contents.presets.length === 0 ? {} : { presets: encodePresets(contents.presets) }),
    ...(contents.workspaces.length === 0 ? {} : { workspaces: encodeWorkspaces(contents.workspaces) }),
    ...(isEmptyUserAssetsBundle(contents.userAssets) ? {} : { userAssets: encodeUserAssetsBundle(contents.userAssets) }),
  }),
});
