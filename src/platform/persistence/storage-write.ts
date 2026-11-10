/**
 * localStorageへの書き込みと、容量の超過で書き込めなかった時の記録。
 *
 * ブラウザの保存は1つのサイトで約5MBほどの枠を全キーで分け合うため、資産が増えると書き込みが容量の超過で失敗する。
 * 失敗した書き込みは保存されないまま画面の値だけが進むので、黙って捨てると、再読み込みで編集が戻って初めて気付く。
 * localStorageへ書く経路はすべて`guardedSetItem`を通し、容量の超過を記録して画面の知らせ（`app/shell/StorageWriteNotice.tsx`）へ渡す。
 * 容量の超過以外の失敗（保存の無効化など）は、利用者が対処できないので記録しない。
 */

/** 保存データの大きさを数えるキーの先頭。 */
export const KEYDIST_STORAGE_PREFIX = 'keydist:';

export interface StorageUsageEntry {
  readonly key: string;
  /** 保存している文字列の長さ（UTF-16の単位）。 */
  readonly length: number;
}

export interface StorageWriteFailure {
  readonly key: string;
  /** 書こうとした文字列の長さ。 */
  readonly attemptedLength: number;
  /** 失敗した時点の保存データの大きさ。大きい順。失敗したキーは、保存済みの値ではなく書こうとした値の大きさで数える。 */
  readonly usage: readonly StorageUsageEntry[];
}

/** 書き込める保存先。大きさの内訳を数えるには、`length`・`key`・`getItem`も要る（無ければ内訳は空）。 */
export type WritableStorage = Pick<Storage, 'setItem'> & Partial<Pick<Storage, 'length' | 'key' | 'getItem'>>;

/** 容量の超過を表す例外か。ブラウザごとに名前とコードが違う。 */
export function isQuotaExceededError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014;
}

/** `keydist:`で始まるキーの保存データの大きさを、大きい順に返す。数えられない保存先は空。 */
export function measureStorageUsage(storage: WritableStorage, prefix: string = KEYDIST_STORAGE_PREFIX): readonly StorageUsageEntry[] {
  const { length, key, getItem } = storage;
  if (typeof length !== 'number' || key === undefined || getItem === undefined) return [];
  const entries: StorageUsageEntry[] = [];
  try {
    for (let index = 0; index < length; index += 1) {
      const name = key.call(storage, index);
      if (name === null || !name.startsWith(prefix)) continue;
      entries.push({ key: name, length: getItem.call(storage, name)?.length ?? 0 });
    }
  } catch {
    return [];
  }
  return entries.sort((a, b) => b.length - a.length);
}

let failures: readonly StorageWriteFailure[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeStorageWriteFailures(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStorageWriteFailuresSnapshot(): readonly StorageWriteFailure[] {
  return failures;
}

export function dismissStorageWriteFailures(): void {
  if (failures.length === 0) return;
  failures = [];
  emit();
}

function recordFailure(storage: WritableStorage, key: string, value: string): void {
  const usage = [...measureStorageUsage(storage).filter((entry) => entry.key !== key), { key, length: value.length }].sort((a, b) => b.length - a.length);
  failures = [...failures.filter((failure) => failure.key !== key), { key, attemptedLength: value.length, usage }];
  emit();
}

/** 同じキーの書き込みが成功したら、そのキーの失敗の記録を外す。 */
function clearFailure(key: string): void {
  if (!failures.some((failure) => failure.key === key)) return;
  failures = failures.filter((failure) => failure.key !== key);
  emit();
}

/**
 * `storage.setItem`を呼ぶ。書けたら`true`。書けなければ`false`を返し、容量の超過なら記録する（例外は投げない）。
 */
export function guardedSetItem(storage: WritableStorage, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
  } catch (error) {
    if (isQuotaExceededError(error)) recordFailure(storage, key, value);
    return false;
  }
  clearFailure(key);
  return true;
}
