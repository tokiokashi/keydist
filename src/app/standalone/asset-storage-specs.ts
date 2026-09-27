import type { AssetCodec } from '#input/codec/index.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { initialStandaloneText } from '#input/text/standalone-text.ts';
import { STANDALONE_TEXT_CODEC } from '#input/text/standalone-text-codec.ts';
import { USER_FINGER_ASSIGNMENTS_CODEC } from '#input/shapes/user-finger-assignments.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { SETUP_LIBRARY_CODEC } from '#engine/setup-codec.ts';
import { SETUP_LIBRARY_STORAGE_KEY } from '#platform/assets/setup-library-storage.ts';
import { USER_FINGER_ASSIGNMENTS_STORAGE_KEY } from '#platform/assets/user-finger-assignments-storage.ts';
import { STANDALONE_TEXT_STORAGE_KEY } from '#platform/assets/standalone-text-storage.ts';
import { STANDALONE_ANALYZER_OPTIONS_STORAGE_KEY } from '#platform/assets/standalone-analyzer-options-storage.ts';
import { initialStandaloneAnalyzerOptions } from '#engine/standalone-analyzer-options.ts';
import { STANDALONE_ANALYZER_OPTIONS_CODEC } from '#engine/standalone-analyzer-options-codec.ts';
import { initialComparisonSelection } from '#engine/comparison-selection.ts';
import { COMPARISON_SELECTION_CODEC } from '#engine/comparison-selection-codec.ts';
import { COMPARISON_SELECTION_STORAGE_KEY } from '#platform/assets/comparison-selection-storage.ts';

/**
 * `KeydistAssets`（`engine/commands.ts`）の各キーを、永続化に要る3点
 * （storageキー・codec・初期値）と結びつける表（コーディネーター指示: 資産を1つ足すたびに
 * `use-keydist-assets.ts`側を4〜5箇所書き換える形をやめ、表を1行足すだけにする）。
 *
 * `{ [K in keyof KeydistAssets]: AssetStorageSpec<KeydistAssets[K]> }` という形にしているので、
 * `KeydistAssets` にキーを足したのにこの表へ行を足し忘れると型検査で落ちる（コンパイルが
 * 通らない）。逆にキーを消した時も、この表に消し忘れの行が残っていれば型エラーになる
 * （`Record`ではなくmapped typeにしている理由）。
 *
 * 置き場所: storageキー定数は`platform/assets/*-storage.ts`（既存のまま）、codecは
 * `input`/`engine`（既存のまま）、この表自体（両方をimportして束ねる）は`app`に置く
 * （`docs/architecture.md`の依存規則で`platform`は`input`までしかimportできず、
 * `engine`のcodecへは届かないため。`app`はEVERYTHING importできる）。
 *
 * ## `app/state/app-state-storage.ts`（`keydist:app-state`の1文書集約）との違い
 *
 * `AppStateV2`はキー1つの下に複数スライスを同居させ、`patchAppStateSlice`で
 * スライス単位に部分書き込みする集中管理（旧Analyzer由来）。この表の資産は**あえて
 * 資産ごとに別のstorageキー**へ分ける（`createAssetTabSync`が資産1つにつき1キーを前提に
 * 書かれている。`platform/asset-tab-sync.ts`参照）。理由は2つ:
 * - **版番号・codecを資産ごとに独立させたい。** 1文書に同居させると、1つの資産のmigrationが
 *   他の資産の値も巻き込んで読み書きすることになり、`defineAssetCodec`の
 *   `currentVersion`/`migrations`が資産ごとに閉じなくなる
 * - **タブ間の「最後の書き込みが勝つ」判定を資産単位にしたい。** 1キーに同居させると、
 *   別の資産だけを書き換えた他タブの変更で、このタブが今編集中の資産の値まで
 *   `applyExternalChange`に巻き込まれてしまう（`engine/commands.ts`の`KeydistAssets`
 *   コメント「独立に読み書きできるものは新しいキーとして足す」と同じ判断）
 *
 * `AppStateV2`側の既存スライス（旧Analyzerの状態）をこの表へ合流させる話はPhase 5の
 * 旧データ移行の範囲（このファイルでは行わない）。
 */
export interface AssetStorageSpec<T> {
  readonly storageKey: string;
  readonly codec: AssetCodec<T>;
  /** 初回起動時・storageに何も無い時の値。 */
  readonly initial: () => T;
}

export const ASSET_STORAGE_SPECS: { readonly [K in keyof KeydistAssets]: AssetStorageSpec<KeydistAssets[K]> } = {
  setupLibrary: {
    storageKey: SETUP_LIBRARY_STORAGE_KEY,
    codec: SETUP_LIBRARY_CODEC,
    initial: () => ({ setups: [], overrides: emptyCascadeOverrides() }),
  },
  fingerAssignments: {
    storageKey: USER_FINGER_ASSIGNMENTS_STORAGE_KEY,
    codec: USER_FINGER_ASSIGNMENTS_CODEC,
    initial: () => [],
  },
  standaloneText: {
    storageKey: STANDALONE_TEXT_STORAGE_KEY,
    codec: STANDALONE_TEXT_CODEC,
    initial: initialStandaloneText,
  },
  standaloneAnalyzerOptions: {
    storageKey: STANDALONE_ANALYZER_OPTIONS_STORAGE_KEY,
    codec: STANDALONE_ANALYZER_OPTIONS_CODEC,
    initial: initialStandaloneAnalyzerOptions,
  },
  comparisonSelection: {
    storageKey: COMPARISON_SELECTION_STORAGE_KEY,
    codec: COMPARISON_SELECTION_CODEC,
    initial: initialComparisonSelection,
  },
};

/** `ASSET_STORAGE_SPECS`の全キー。反復のたびに`Object.keys`とキャストを書かずに済むように。 */
export const ASSET_KEYS = Object.keys(ASSET_STORAGE_SPECS) as readonly (keyof KeydistAssets)[];
