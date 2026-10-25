import { WORKSPACE_LIBRARY_CODEC } from '#engine/workspace-codec.ts';
import type { WorkspaceLibrary } from '#engine/workspace.ts';
import { createAssetTabSync, type AssetTabSync, type AssetTabSyncOptions } from '#platform/asset-tab-sync.ts';
import { WORKSPACES_STORAGE_KEY } from '#platform/assets/workspaces-storage.ts';
import { reportAssetOpenFailure, reportAssetUnreadableElsewhere } from './asset-load-notice.ts';

/**
 * 資産のストアを通らずにWorkspaceの保存データを読む画面部品（サイドバーなど）用の読み込み。
 * 資産のストアを開かない画面（Aboutなど）にもこの部品は出るので、そこで読めなかった値も同じ知らせに流す。
 * 資産のストアが先に同じ値を読んで知らせていても、知らせは資産ごとに1つにまとまるので重ならない。
 */
export function createWorkspaceLibrarySync(options: {
  readonly onExternalChange: (library: WorkspaceLibrary) => void;
  /** 既定は`window.localStorage`。テストでは偽物を注入する。 */
  readonly storage?: AssetTabSyncOptions<WorkspaceLibrary>['storage'];
  /** 既定は`browser-storage-events.ts`の購読。テストでは偽物を注入する。 */
  readonly subscribe?: AssetTabSyncOptions<WorkspaceLibrary>['subscribe'];
}): AssetTabSync<WorkspaceLibrary> {
  return createAssetTabSync({
    storageKey: WORKSPACES_STORAGE_KEY,
    codec: WORKSPACE_LIBRARY_CODEC,
    storage: options.storage,
    subscribe: options.subscribe,
    onExternalChange: options.onExternalChange,
    // `load`は使わず`loadWorkspaceLibrary`で読むので、ここへ届くのは別のタブの書き込みを読めなかった時だけ
    onLoadFailure: () => reportAssetUnreadableElsewhere('workspaces'),
  });
}

/** 開く時の読み込み。読めなかった値は知らせて、無いものとして扱う。 */
export function loadWorkspaceLibrary(sync: AssetTabSync<WorkspaceLibrary>): WorkspaceLibrary {
  const report = sync.loadReport();
  if (report.kind === 'failed') reportAssetOpenFailure('workspaces', report.reason);
  return report.kind === 'loaded' ? report.value : [];
}
