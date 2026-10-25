import { useEffect, useState } from 'react';
import { createWorkspaceLibrarySync, loadWorkspaceLibrary } from '../standalone/workspace-library-sync.ts';

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
    const sync = createWorkspaceLibrarySync({
      onExternalChange: (library) => setState({ ready: true, links: toLinks(library) }),
    });
    setState({ ready: true, links: toLinks(loadWorkspaceLibrary(sync)) });
    return sync.start();
  }, []);

  return state;
}
