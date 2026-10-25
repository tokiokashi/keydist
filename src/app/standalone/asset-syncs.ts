import {
  applyCommandInScreen,
  stepInScreen,
  type Command,
  type CommandOutcome,
  type HistoryStepOutcome,
  type ScreenHistories,
} from '#input/commands/index.ts';
import { createAssetTabSync, type AssetLoadFailure, type AssetLoadReport, type AssetTabSync } from '#platform/asset-tab-sync.ts';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import type { KeyValueStorage } from '#platform/persistence/storage.ts';
import type { notifyKeydistStorageChange, subscribeKeydistStorageChanges } from '#platform/browser-storage-events.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { KEYDIST_ITEM_SCOPES } from '#engine/history-scopes.ts';
import { ASSET_KEYS, ASSET_STORAGE_SPECS } from './asset-storage-specs.ts';

/**
 * `ASSET_STORAGE_SPECS`をReactから独立して組み立てる層。
 * 資産の一覧表はKeyValueStorageを注入できる形を保つ（createAssetTabSyncと同じ）。
 *
 * `createAssetTabSync`が資産1つぶんに持つ`storage`/`subscribe`/`notify`の注入口を
 * そのまま資産ぶんまとめて中継するだけの薄い層にする。Reactを一切importしないので、
 * `use-keydist-assets.ts`（hook）を経由せずnode:testから直接組み立てて検証できる
 * （`asset-syncs.test.ts`）。
 */
export type AssetSyncMap = { readonly [K in keyof KeydistAssets]: AssetTabSync<KeydistAssets[K]> };

export interface BuildAssetSyncsOptions {
  readonly onExternalChange: <K extends keyof KeydistAssets>(key: K, value: KeydistAssets[K]) => void;
  /** 別のタブが書いた値を読めなかった時に呼ばれる。このタブは手元の値のまま動く。 */
  readonly onExternalLoadFailure?: (key: keyof KeydistAssets, reason: AssetLoadFailure) => void;
  /** 既定は`createAssetTabSync`自身の既定（`window.localStorage`）。テストでは偽物を注入する。 */
  readonly storage?: KeyValueStorage;
  /** 既定は`browser-storage-events.ts`の購読。テストでは偽物を注入する。 */
  readonly subscribe?: typeof subscribeKeydistStorageChanges;
  /** 既定は`browser-storage-events.ts`の通知。テストでは偽物を注入する。 */
  readonly notify?: typeof notifyKeydistStorageChange;
}

/**
 * `key`ごとに`AssetTabSync<KeydistAssets[K]>`を組み立てる。ジェネリック関数として
 * 1キー分だけを扱うことで、`spec`・`sync`双方の型パラメータ`K`をTypeScriptに相関させる
 * （`ASSET_KEYS.map`のような単純なループの中で直接組み立てると、map結果の配列要素の型が
 * `AssetTabSync<A> | AssetTabSync<B> | ...`という緩い合併に潰れ、`Object.fromEntries`の
 * 戻り値が`AssetSyncMap`と噛み合わなくなる）。
 */
function buildOne<K extends keyof KeydistAssets>(key: K, options: BuildAssetSyncsOptions): readonly [K, AssetTabSync<KeydistAssets[K]>] {
  const spec = ASSET_STORAGE_SPECS[key];
  const sync = createAssetTabSync({
    storageKey: spec.storageKey,
    codec: spec.codec,
    storage: options.storage,
    subscribe: options.subscribe,
    notify: options.notify,
    onExternalChange: (value) => options.onExternalChange(key, value),
    onLoadFailure: (reason) => options.onExternalLoadFailure?.(key, reason),
  });
  return [key, sync];
}

export function buildAssetSyncs(options: BuildAssetSyncsOptions): AssetSyncMap {
  const entries = ASSET_KEYS.map((key) => buildOne(key, options));
  // `ASSET_STORAGE_SPECS`が`KeydistAssets`の全キーを型で強制しているので、ここでの
  // `unknown`経由のcastは「全キー分そろっている」という保証済みの前提を表す1箇所だけの
  // 変換として許容する（`Array#map`がタプルの相関をunionへ潰してしまうためのworkaround。
  // `buildOne`のコメント参照）。
  return Object.fromEntries(entries) as unknown as AssetSyncMap;
}

function loadOne<K extends keyof KeydistAssets>(syncs: AssetSyncMap, key: K): readonly [K, KeydistAssets[K]] | undefined {
  const value = syncs[key].load();
  return value === undefined ? undefined : [key, value];
}

/** storageに何かあった資産キーだけを返す（無ければキーごと省く。呼び出し側は`{...current, ...loaded}`で合成する）。 */
export function loadAssets(syncs: AssetSyncMap): Partial<KeydistAssets> {
  const entries = ASSET_KEYS.map((key) => loadOne(syncs, key)).filter((entry) => entry !== undefined);
  return Object.fromEntries(entries) as unknown as Partial<KeydistAssets>;
}

/**
 * 起動時の読み込みで、利用者に知らせる出来事。
 * - `repaired`: 壊れた値を捨てた・直して読めた。直した形を書き戻した
 * - `reset`: 読めず、既定値で始めた。既定値を書き戻した
 * - `newer-version`: 新しい版が書いた値で読めず、既定値で始めた。元の値は書き戻さず残した
 * - `unreadable-elsewhere`: 開いた後に、別のタブが読めない値を書いた。このタブは手元の値のまま動き、初期値へは戻さない
 */
export type AssetLoadNoticeKind = 'repaired' | 'reset' | 'newer-version' | 'unreadable-elsewhere';

export interface AssetLoadNotice {
  readonly key: keyof KeydistAssets;
  readonly kind: AssetLoadNoticeKind;
  /** `repaired`の時だけ。何を捨てた・直したか。 */
  readonly diagnostics: readonly CodecDiagnostic[];
}

export interface AssetLoadOutcome {
  readonly assets: Partial<KeydistAssets>;
  readonly notices: readonly AssetLoadNotice[];
}

/** 開く時に読めなかった理由から、知らせを作る。 */
export function openFailureNotice(key: keyof KeydistAssets, reason: AssetLoadFailure): AssetLoadNotice {
  return { key, kind: reason.kind === 'future-version' ? 'newer-version' : 'reset', diagnostics: [] };
}

function reportToNotice<K extends keyof KeydistAssets>(key: K, report: AssetLoadReport<KeydistAssets[K]>): AssetLoadNotice | undefined {
  if (report.kind === 'loaded') {
    return report.diagnostics.length === 0 ? undefined : { key, kind: 'repaired', diagnostics: report.diagnostics };
  }
  if (report.kind === 'failed') {
    return openFailureNotice(key, report.reason);
  }
  return undefined;
}

/** 1資産を読み、直した形（読めなければ既定値）を書き戻す。`repair`が捨てた部分は知らせずに書き戻す。新しい版の値と、無い値は書き戻さない。 */
function loadAndRepairOne<K extends keyof KeydistAssets>(
  syncs: AssetSyncMap,
  key: K,
): { readonly entry?: readonly [K, KeydistAssets[K]]; readonly notice?: AssetLoadNotice } {
  const report = syncs[key].loadReport();
  const notice = reportToNotice(key, report);
  if (report.kind === 'loaded') {
    const repair = ASSET_STORAGE_SPECS[key].repair;
    const value = repair === undefined ? report.value : repair(report.value);
    if (notice !== undefined || value !== report.value) syncs[key].save(value);
    return notice === undefined ? { entry: [key, value] } : { entry: [key, value], notice };
  }
  if (notice !== undefined && notice.kind === 'reset') syncs[key].save(ASSET_STORAGE_SPECS[key].initial());
  return notice === undefined ? {} : { notice };
}

/**
 * アプリを開いた時の読み込み。`loadAssets`に加えて、捨てた・直した値と読めなかった値を知らせる材料を返し、
 * 直した形（読めなければ既定値）をstorageへ書き戻す。書き戻すので、次に開いた時に同じ知らせは出ない。
 * 新しい版が書いた値は書き戻さず、元の値を残す。
 */
export function loadAssetsAndRepair(syncs: AssetSyncMap): AssetLoadOutcome {
  const results = ASSET_KEYS.map((key) => loadAndRepairOne(syncs, key));
  const entries = results.flatMap((result) => (result.entry === undefined ? [] : [result.entry]));
  const notices = results.flatMap((result) => (result.notice === undefined ? [] : [result.notice]));
  return { assets: Object.fromEntries(entries) as unknown as Partial<KeydistAssets>, notices };
}

function saveOne<K extends keyof KeydistAssets>(syncs: AssetSyncMap, assets: KeydistAssets, key: K): void {
  syncs[key].save(assets[key]);
}

/** `applyCommand`が返した`changes`のキーだけをstorageへ書く。 */
export function saveChangedAssets(syncs: AssetSyncMap, assets: KeydistAssets, changedKeys: readonly (keyof KeydistAssets)[]): void {
  for (const key of changedKeys) saveOne(syncs, assets, key);
}

/**
 * 全資産の購読を始め、まとめて止める関数を返す（`AssetTabSync.start()`のコメント参照）。
 * **呼び出し側は`useEffect`の中でこれを呼び、返ってきた関数をその`cleanup`で呼ぶこと。**
 * ReactのStrictMode（開発時のmount→cleanup→mount二重実行）でcleanupが挟まっても、
 * 次のeffect実行でまた`startAssetSyncs`を呼べば正しく購読し直される
 * （構築時に自動購読・`useEffect`の外で1回だけ購読する設計だと、
 * 二重実行後ずっと外部タブの変更を受け取れなくなる。再現・原因は
 * `asset-tab-sync.test.ts`の「StrictModeの二重実行を模す」テスト参照）。
 */
export function startAssetSyncs(syncs: AssetSyncMap): () => void {
  const stops = ASSET_KEYS.map((key) => syncs[key].start());
  return () => {
    for (const stop of stops) stop();
  };
}

/** 全資産の手持ちを今のstorageへ追いつかせる。他タブの変更は通知が届いた時と同じ`onExternalChange`へ流れる。 */
export function catchUpAssets(syncs: AssetSyncMap): void {
  for (const key of ASSET_KEYS) syncs[key].catchUp();
}

export interface AssetState {
  readonly assets: KeydistAssets;
  readonly histories: ScreenHistories<KeydistAssets>;
}

/**
 * 手持ちを今のstorageへ追いつかせてからコマンドを適用し、変わった資産だけを書く。
 *
 * 資産は1つのstorageキーへ丸ごと書くので、他タブの書き込みの通知がまだ届いていない
 * 古い手持ちへ適用すると、その書き込みを消してしまう。適用の直前に追いつくことで、
 * コマンドは常に最新の資産へ効く。取り込みは通知経由と同じ`onExternalChange`を通るので、
 * 他タブの変更に触れた履歴を捨てる規則（`applyExternalChangeToScreens`）もそのまま効く。
 * `readState`は追いついた後の手持ちを返す（`onExternalChange`が書き換えた先を読む）。
 *
 * `screen`は履歴に積む画面。`undefined`なら履歴を持たない画面からの書き込みで、どの履歴にも積まない。
 *
 * 2タブがほぼ同時（他タブの書き込みがこのタブのstorageに届くまでの間）に書くと、
 * まだ防げない。Web Locksでタブ間を直列化すれば閉じるが、適用が非同期になり、
 * 描画時の値からコマンドを組む呼び出し側やpagehideでの書き出しが壊れるので採らない。
 */
export function commitCommand(
  syncs: AssetSyncMap,
  readState: () => AssetState,
  screen: string | undefined,
  command: Command<KeydistAssets>,
): AssetState & { readonly outcome: CommandOutcome<KeydistAssets> } {
  catchUpAssets(syncs);
  const { assets, histories } = readState();
  const result = applyCommandInScreen(assets, histories, screen, command);
  if (result.outcome.kind === 'applied') {
    saveChangedAssets(syncs, result.assets, Object.keys(result.outcome.changes) as (keyof KeydistAssets)[]);
  }
  return result;
}

/**
 * `screen`の履歴を1段戻す・やり直し、変わった資産だけを書く。
 *
 * `commitCommand`と同じく、先に手持ちを今のstorageへ追いつかせる。他タブが書き換えた資産に
 * 触れる履歴は取り込みの時点で捨てられるので、他タブの変更を古い値で巻き戻すことはない。
 * 他の画面などで書き換わっていて当てられない項目は、資産を変えず、その画面の履歴から捨てる（`conflict`）。
 */
export function commitHistoryStep(
  syncs: AssetSyncMap,
  readState: () => AssetState,
  screen: string,
  direction: 'undo' | 'redo',
): AssetState & { readonly outcome: HistoryStepOutcome<KeydistAssets> } {
  catchUpAssets(syncs);
  const { assets, histories } = readState();
  const result = stepInScreen(assets, histories, screen, direction, KEYDIST_ITEM_SCOPES);
  if (result.outcome.kind === 'applied') {
    saveChangedAssets(syncs, result.assets, Object.keys(result.outcome.changes) as (keyof KeydistAssets)[]);
  }
  return result;
}
