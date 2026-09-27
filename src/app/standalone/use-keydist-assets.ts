import { useEffect, useMemo, useReducer, useRef } from 'react';
import {
  applyCommand,
  applyExternalChange,
  emptyCommandHistory,
  type Command,
  type CommandHistory,
} from '#input/commands/index.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { initialStandaloneText } from '#input/text/standalone-text.ts';
import { STANDALONE_TEXT_CODEC } from '#input/text/standalone-text-codec.ts';
import { USER_FINGER_ASSIGNMENTS_CODEC } from '#input/shapes/user-finger-assignments.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { SETUP_LIBRARY_CODEC } from '#engine/setup-codec.ts';
import { createAssetTabSync, type AssetTabSync } from '#platform/asset-tab-sync.ts';
import { SETUP_LIBRARY_STORAGE_KEY } from '#platform/assets/setup-library-storage.ts';
import { USER_FINGER_ASSIGNMENTS_STORAGE_KEY } from '#platform/assets/user-finger-assignments-storage.ts';
import { STANDALONE_TEXT_STORAGE_KEY } from '#platform/assets/standalone-text-storage.ts';

/**
 * `KeydistAssets`（#544 §8-2）の永続化・タブ間追従・コマンド履歴を1つにまとめる
 * アプリ組み立て（`docs/architecture.md`「appが組み立てたアダプタをhostsへ注入する」）。
 *
 * storageを直接触るのは`platform`と`app`だけ（依存規則）なので、`createAssetTabSync`を
 * 3資産ぶん組み立てる仕事はここに置く。`hosts/standalone`はこのhookが返す
 * `{ assets, dispatch }`だけを知り、storageもcodecも一切importしない。
 */
export interface KeydistAssetsController {
  readonly assets: KeydistAssets;
  dispatch(command: Command<KeydistAssets>): void;
}

function initialAssets(): KeydistAssets {
  return {
    setupLibrary: { setups: [], overrides: emptyCascadeOverrides() },
    fingerAssignments: [],
    standaloneText: initialStandaloneText(),
  };
}

/**
 * 3つの`AssetTabSync`を1回だけ組み立てる。`useRef`の遅延初期化（`current === undefined`の
 * 時だけ作る）は、Reactの厳格モードでの二重実行下でも1つの購読しか残らないようにするため
 * （`useState(() => …)`と同じ「初期化子は1回だけ」の規約を、3つまとめて作りたいのでrefで書く）。
 */
function useAssetSyncs(onExternalChange: <K extends keyof KeydistAssets>(key: K, value: KeydistAssets[K]) => void) {
  const ref = useRef<{
    setupLibrary: AssetTabSync<KeydistAssets['setupLibrary']>;
    fingerAssignments: AssetTabSync<KeydistAssets['fingerAssignments']>;
    standaloneText: AssetTabSync<KeydistAssets['standaloneText']>;
  } | undefined>(undefined);

  if (ref.current === undefined) {
    ref.current = {
      setupLibrary: createAssetTabSync({
        storageKey: SETUP_LIBRARY_STORAGE_KEY,
        codec: SETUP_LIBRARY_CODEC,
        onExternalChange: (value) => onExternalChange('setupLibrary', value),
      }),
      fingerAssignments: createAssetTabSync({
        storageKey: USER_FINGER_ASSIGNMENTS_STORAGE_KEY,
        codec: USER_FINGER_ASSIGNMENTS_CODEC,
        onExternalChange: (value) => onExternalChange('fingerAssignments', value),
      }),
      standaloneText: createAssetTabSync({
        storageKey: STANDALONE_TEXT_STORAGE_KEY,
        codec: STANDALONE_TEXT_CODEC,
        onExternalChange: (value) => onExternalChange('standaloneText', value),
      }),
    };
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
    const loadedSetupLibrary = syncs.setupLibrary.load();
    const loadedFingerAssignments = syncs.fingerAssignments.load();
    const loadedStandaloneText = syncs.standaloneText.load();
    if (loadedSetupLibrary !== undefined || loadedFingerAssignments !== undefined || loadedStandaloneText !== undefined) {
      assetsRef.current = {
        setupLibrary: loadedSetupLibrary ?? assetsRef.current.setupLibrary,
        fingerAssignments: loadedFingerAssignments ?? assetsRef.current.fingerAssignments,
        standaloneText: loadedStandaloneText ?? assetsRef.current.standaloneText,
      };
      forceRender();
    }
    return () => {
      syncs.setupLibrary.stop();
      syncs.fingerAssignments.stop();
      syncs.standaloneText.stop();
    };
    // syncsは`useAssetSyncs`が1回だけ作る安定した参照なので、依存に含めなくてよい。
    // eslint的な警告機構はこのリポジトリに無い（AGENTS.md参照）。
  }, []);

  const dispatch = useMemo(() => (command: Command<KeydistAssets>) => {
    const result = applyCommand(assetsRef.current, historyRef.current, command);
    if (result.outcome.kind !== 'applied') return;
    assetsRef.current = result.assets;
    historyRef.current = result.history;
    for (const key of Object.keys(result.outcome.changes) as (keyof KeydistAssets)[]) {
      if (key === 'setupLibrary') syncs.setupLibrary.save(result.assets.setupLibrary);
      else if (key === 'fingerAssignments') syncs.fingerAssignments.save(result.assets.fingerAssignments);
      else if (key === 'standaloneText') syncs.standaloneText.save(result.assets.standaloneText);
    }
    forceRender();
  }, [syncs]);

  return { assets: assetsRef.current, dispatch };
}
