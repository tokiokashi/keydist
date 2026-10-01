/**
 * 個別画面から「Workspaceに追加」した直後の知らせの記憶。追加しても個別画面に留まるので、
 * 追加した事実と追加先へのリンクを画面の下端に出す（`AddedToWorkspaceNotice`）。
 * 持つのは直前の1件だけ（次に追加すれば入れ替わる）。
 */
export interface AddedToWorkspace {
  readonly workspaceId: string;
  /** 追加した時点のWorkspace名。 */
  readonly workspaceName: string;
  /** 追加ごとの通し番号。同じ先へ続けて追加しても、知らせを出し直す。 */
  readonly serial: number;
}

let current: AddedToWorkspace | undefined;
let serial = 0;
const listeners = new Set<() => void>();

export function subscribeAddedToWorkspace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAddedToWorkspaceSnapshot(): AddedToWorkspace | undefined {
  return current;
}

export function setAddedToWorkspace(next: { readonly workspaceId: string; readonly workspaceName: string } | undefined): void {
  current = next === undefined ? undefined : { ...next, serial: ++serial };
  for (const listener of listeners) listener();
}
