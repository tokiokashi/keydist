/**
 * 開いている対象の選択（`TargetSelection`）を画面全体で1つに保つ。
 * Escapeで閉じる選択を1つに決めるため、別の選択を開くと、開いていた方を閉じさせる。
 * 持つのは開いている選択のidだけ。開閉の状態そのものは各`TargetSelection`が持つ。
 */
let current: string | undefined;
const listeners = new Set<() => void>();

export function openTargetSelectionId(): string | undefined {
  return current;
}

/** `id`を開いている選択にする。開いていた別の選択は、購読で気づいて閉じる。 */
export function claimTargetSelection(id: string): void {
  if (current === id) return;
  current = id;
  for (const listener of [...listeners]) listener();
}

/** `id`が開いている選択のままなら、誰も開いていない状態へ戻す。 */
export function releaseTargetSelection(id: string): void {
  if (current !== id) return;
  current = undefined;
  for (const listener of [...listeners]) listener();
}

export function subscribeTargetSelection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
