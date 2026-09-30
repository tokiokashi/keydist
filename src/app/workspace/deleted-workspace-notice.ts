import type { Workspace } from '#engine/workspace.ts';

/**
 * 削除したWorkspaceの取り消し用の記憶。
 *
 * 削除すると別の画面へ移り、削除した画面のコマンド履歴（画面ごとのメモリ上のもの）は手元に残らない。
 * そこで、削除したWorkspaceと元の位置をここへ置き、移った先の画面から元に戻せるようにする。
 * 持つのは直前の1件だけ（次に削除すれば入れ替わる）。
 */
export interface DeletedWorkspace {
  readonly workspace: Workspace;
  /** 削除する前の一覧での位置。 */
  readonly index: number;
}

let current: DeletedWorkspace | undefined;
const listeners = new Set<() => void>();

export function subscribeDeletedWorkspace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDeletedWorkspaceSnapshot(): DeletedWorkspace | undefined {
  return current;
}

export function setDeletedWorkspace(next: DeletedWorkspace | undefined): void {
  current = next;
  for (const listener of listeners) listener();
}
