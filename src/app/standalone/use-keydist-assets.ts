import { useEffect, useMemo, useReducer, useRef } from 'react';
import {
  applyCommand,
  applyExternalChange,
  emptyCommandHistory,
  type Command,
  type CommandHistory,
} from '#input/commands/index.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { ASSET_KEYS, ASSET_STORAGE_SPECS } from './asset-storage-specs.ts';
import { buildAssetSyncs, loadAssets, saveChangedAssets, stopAssetSyncs, type AssetSyncMap } from './asset-syncs.ts';

/**
 * `KeydistAssets`（#544 §8-2）の永続化・タブ間追従・コマンド履歴を1つにまとめる
 * アプリ組み立て（`docs/architecture.md`「appが組み立てたアダプタをhostsへ注入する」）。
 *
 * storageを直接触るのは`platform`と`app`だけ（依存規則）なので、資産ぶんの
 * `AssetTabSync`を組み立てる仕事はここに置く。実際の組み立ては`asset-syncs.ts`
 * （Reactを知らない、node:testから直接検証できる層）へ切り出してあり、このhookは
 * それをReactのライフサイクルへ配線するだけにする。`hosts/standalone`はこのhookが返す
 * `{ assets, dispatch }`だけを知り、storageもcodecも一切importしない。
 *
 * 資産ごとの組み立て（storageキー・codec・初期値）は`asset-storage-specs.ts`の表に
 * 1本化した。ここは表を`ASSET_KEYS`でループするだけで、資産を1つ足す時にこのファイルを
 * 書き換える必要が無い（コーディネーター指示: 資産を1つ足すと4〜5箇所を書き換える形を
 * やめる）。
 */
export interface KeydistAssetsController {
  readonly assets: KeydistAssets;
  dispatch(command: Command<KeydistAssets>): void;
}

function initialAssets(): KeydistAssets {
  // `ASSET_STORAGE_SPECS`がKeydistAssetsの全キーを型で強制しているので、`unknown`経由の
  // castは「全キー分そろっている」という保証済みの前提を表す1箇所だけの変換として許容する
  // （`Array#map`がタプルの相関をunionへ潰してしまうため。`asset-syncs.ts`の`buildOne`コメント参照）。
  const entries = ASSET_KEYS.map((key) => [key, ASSET_STORAGE_SPECS[key].initial()] as const);
  return Object.fromEntries(entries) as unknown as KeydistAssets;
}

/**
 * `AssetSyncMap`を1回だけ組み立てる。`useRef`の遅延初期化（`current === undefined`の
 * 時だけ作る）は、Reactの厳格モードでの二重実行下でも1つの購読しか残らないようにするため
 * （`useState(() => …)`と同じ「初期化子は1回だけ」の規約を、資産ぶんまとめて作りたいので
 * refで書く）。
 */
function useAssetSyncs(onExternalChange: <K extends keyof KeydistAssets>(key: K, value: KeydistAssets[K]) => void) {
  const ref = useRef<AssetSyncMap | undefined>(undefined);
  if (ref.current === undefined) {
    ref.current = buildAssetSyncs({ onExternalChange });
  }
  return ref.current;
}

/**
 * `KeydistAssets`をReactの状態として持ち、`dispatch`経由のコマンド適用だけで書き換える。
 * `assets`自体はrefに持ち、変更のたびに`forceRender`で再描画する（`useState`で持つと
 * `applyExternalChange`・`dispatch`の両方から「直前の状態」を読みたい箇所で
 * 関数形の更新子を経由する必要が増えるため、単一の可変refのほうがこの用途では単純）。
 */
export function useKeydistAssets(): KeydistAssetsController {
  const assetsRef = useRef<KeydistAssets>(initialAssets());
  const historyRef = useRef<CommandHistory<KeydistAssets>>(emptyCommandHistory());
  const [, forceRender] = useReducer((count: number) => count + 1, 0);

  const syncs = useAssetSyncs((key, value) => {
    const result = applyExternalChange(assetsRef.current, historyRef.current, key, value);
    assetsRef.current = result.assets;
    historyRef.current = result.history;
    forceRender();
  });

  useEffect(() => {
    const loaded = loadAssets(syncs);
    if (Object.keys(loaded).length > 0) {
      assetsRef.current = { ...assetsRef.current, ...loaded };
      forceRender();
    }
    return () => stopAssetSyncs(syncs);
    // syncsは`useAssetSyncs`が1回だけ作る安定した参照なので、依存に含めなくてよい。
    // eslint的な警告機構はこのリポジトリに無い（AGENTS.md参照）。
  }, []);

  const dispatch = useMemo(() => (command: Command<KeydistAssets>) => {
    const result = applyCommand(assetsRef.current, historyRef.current, command);
    if (result.outcome.kind !== 'applied') return;
    assetsRef.current = result.assets;
    historyRef.current = result.history;
    saveChangedAssets(syncs, result.assets, Object.keys(result.outcome.changes) as (keyof KeydistAssets)[]);
    forceRender();
  }, [syncs]);

  return { assets: assetsRef.current, dispatch };
}
