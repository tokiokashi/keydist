import type { StorageWriteFailure } from '#platform/persistence/storage-write.ts';
import { ASSET_NOTICE_LABELS } from '../standalone/asset-load-notice-text.ts';
import { ASSET_KEYS, ASSET_STORAGE_SPECS } from '../standalone/asset-storage-specs.ts';
import { APP_STATE_STORAGE_KEY } from '../state/app-state-storage.ts';

/**
 * 保存データを知らせに出す名前。資産のキーは、資産を読んだ時の知らせと同じ名前（`ASSET_NOTICE_LABELS`）にそろえる。
 * 資産ではない保存データは、表示とパネルの設定をまとめた1つのキーだけ。
 */
const STORAGE_KEY_LABELS: ReadonlyMap<string, string> = new Map([
  ...ASSET_KEYS.map((key) => [ASSET_STORAGE_SPECS[key].storageKey, ASSET_NOTICE_LABELS[key]] as const),
  [APP_STATE_STORAGE_KEY, '表示と入力テストの設定'] as const,
]);

/** 保存データの名前。知らないキーは「その他の保存データ」にまとめる。 */
export function storageKeyLabel(key: string): string {
  return STORAGE_KEY_LABELS.get(key) ?? 'その他の保存データ';
}

/** 読み込みで保存できなかった保存データを知らせる文。キーごとに別の文字列として書くので、失敗した保存データだけが保存されていない。 */
export function importNotSavedText(failures: readonly StorageWriteFailure[]): string {
  const labels = [...new Set(failures.map((failure) => storageKeyLabel(failure.key)))];
  return `${labels.join('、')}は、容量が足りず保存できませんでした。ほかの種類の読み込みは保存されています`;
}

/** 文字数の表記。1万字以上は万字で丸める。 */
export function characterCountText(length: number): string {
  return length >= 10_000 ? `${(length / 10_000).toFixed(1)}万字` : `${length}字`;
}

export interface StorageWriteNoticeLine {
  readonly key: string;
  readonly label: string;
  readonly size: string;
}

/** 大きい順に並べる保存データの内訳。同じ名前に当たるキーは1行にまとめる。 */
export function storageUsageLines(failure: StorageWriteFailure, limit = 5): readonly StorageWriteNoticeLine[] {
  const byLabel = new Map<string, { key: string; length: number }>();
  for (const entry of failure.usage) {
    const label = storageKeyLabel(entry.key);
    const found = byLabel.get(label);
    byLabel.set(label, { key: found?.key ?? entry.key, length: (found?.length ?? 0) + entry.length });
  }
  return [...byLabel]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, limit)
    .map(([label, { key, length }]) => ({ key, label, size: characterCountText(length) }));
}
