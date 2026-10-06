export const KEYDIST_STORAGE_CHANGE_EVENT = 'keydist:storage-change';

export interface KeydistStorageChangeDetail {
  key: string;
}

/**
 * storage event is not fired in the same tab that performed localStorage.setItem().
 * Domain/user-asset writers call this after a successful write so long-lived browser
 * composition roots can observe the same-tab change as well.
 */
export function notifyKeydistStorageChange(key: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<KeydistStorageChangeDetail>(
    KEYDIST_STORAGE_CHANGE_EVENT,
    { detail: { key } },
  ));
}

export function subscribeKeydistStorageChanges(
  keys: readonly string[],
  listener: (key: string) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const watched = new Set(keys);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && watched.has(event.key)) listener(event.key);
  };
  const onSameTab = (event: Event) => {
    const detail = (event as CustomEvent<KeydistStorageChangeDetail>).detail;
    if (detail && watched.has(detail.key)) listener(detail.key);
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(KEYDIST_STORAGE_CHANGE_EVENT, onSameTab);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(KEYDIST_STORAGE_CHANGE_EVENT, onSameTab);
  };
}
