/**
 * Workspaceをファイルから読み込んだ直後に出す知らせの記憶。
 *
 * 読み込みはサイドバーから行い、足したWorkspaceの画面へ移るので、結果は移った先でも読めるよう
 * 画面に属さないこの場所へ置く（`deleted-workspace-notice.ts`と同じ作り）。持つのは直前の1件だけ。
 */
export interface ImportedWorkspacesNotice {
  /** 知らせごとの通し番号。同じ文面が続いても出し直す。 */
  readonly serial: number;
  readonly summary: string;
  /** 一覧に出す文（別名で足した理由・足さなかった理由・参照先の注記）。 */
  readonly lines: readonly string[];
  /** 不具合報告用の原文。 */
  readonly details: readonly string[];
}

let current: ImportedWorkspacesNotice | undefined;
let serial = 0;
const listeners = new Set<() => void>();

export function subscribeImportedWorkspaces(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getImportedWorkspacesSnapshot(): ImportedWorkspacesNotice | undefined {
  return current;
}

export function setImportedWorkspaces(next: Omit<ImportedWorkspacesNotice, 'serial'> | undefined): void {
  serial += 1;
  current = next === undefined ? undefined : { ...next, serial };
  for (const listener of listeners) listener();
}
