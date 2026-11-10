import { useSyncExternalStore } from 'react';
import {
  dismissStorageWriteFailures,
  getStorageWriteFailuresSnapshot,
  subscribeStorageWriteFailures,
  type StorageWriteFailure,
} from '#platform/persistence/storage-write.ts';
import { characterCountText, storageKeyLabel, storageUsageLines } from './storage-write-notice-text.ts';

const NO_FAILURES: readonly StorageWriteFailure[] = [];

/**
 * 容量が足りず、保存できなかったことの知らせ。保存できなかった資産と、保存データを大きい順に示す。
 * 保存できなかった変更は、再読み込みすると元に戻る。
 * 知らせは閉じるまで残り、同じ資産の保存が成功すると、その資産の分は外れる。
 */
export function StorageWriteNotice() {
  const failures = useSyncExternalStore(subscribeStorageWriteFailures, getStorageWriteFailuresSnapshot, () => NO_FAILURES);
  const latest = failures[failures.length - 1];
  if (latest === undefined) return null;
  // 内訳は直近の失敗のもの（失敗した時点の全体の大きさ）を出す
  return (
    <div className="shell-notice shell-notice-detailed" role="alert" data-storage-write-notice="true">
      <div className="shell-notice-body">
        <span>容量が足りず、保存できませんでした。再読み込みすると、保存できなかった変更は元に戻ります。</span>
        <ul className="shell-notice-details" data-storage-write-failed="true">
          {failures.map((failure) => (
            <li key={failure.key} data-storage-write-failed-key={failure.key}>
              保存できなかった資産: {storageKeyLabel(failure.key)}（{characterCountText(failure.attemptedLength)}）
            </li>
          ))}
        </ul>
        <span>保存データの大きさ（大きい順）</span>
        <ul className="shell-notice-details" data-storage-usage="true">
          {storageUsageLines(latest).map((line) => (
            <li key={line.key}>
              {line.label}: {line.size}
            </li>
          ))}
        </ul>
        <span>大きい資産を削除するか、データ・設定の管理で書き出してから整理してください。</span>
      </div>
      <button type="button" aria-label="知らせを閉じる" title="知らせを閉じる" onClick={dismissStorageWriteFailures}>
        ×
      </button>
    </div>
  );
}
