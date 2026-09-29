import { useEffect, useState } from 'react';
import { WORKSPACE_LIBRARY_CODEC } from '#engine/workspace-codec.ts';
import { createAssetTabSync } from '#platform/asset-tab-sync.ts';
import { WORKSPACES_STORAGE_KEY } from '#platform/assets/workspaces-storage.ts';

export interface WorkspaceLink {
  readonly id: string;
  readonly name: string;
}

export interface WorkspaceLinks {
  /** 保存した手持ちを読み終えたか。読む前（プリレンダー・ハイドレーション前）は一覧が空でも「無い」とは限らない。 */
  readonly ready: boolean;
  readonly links: readonly WorkspaceLink[];
}

/**
 * サイドバーに出すWorkspaceの一覧（作った順）。サイドバーは画面をまたいで常に出ていて、どの画面の
 * 資産の手持ち（`useKeydistAssets`）にも属さないので、Workspaceの手持ちだけをここで読み、
 * 開いている画面・他タブの書き込み（作成・名前の変更・削除）の通知で読み直す。
 */
export function useWorkspaceLinks(): WorkspaceLinks {
  const [state, setState] = useState<WorkspaceLinks>({ ready: false, links: [] });

  useEffect(() => {
    const toLinks = (library: readonly { readonly id: string; readonly name: string }[]): readonly WorkspaceLink[] =>
      library.map(({ id, name }) => ({ id, name }));
    const sync = createAssetTabSync({
      storageKey: WORKSPACES_STORAGE_KEY,
      codec: WORKSPACE_LIBRARY_CODEC,
      onExternalChange: (library) => setState({ ready: true, links: toLinks(library) }),
    });
    setState({ ready: true, links: toLinks(sync.load() ?? []) });
    return sync.start();
  }, []);

  return state;
}
