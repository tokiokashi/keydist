import { useSyncExternalStore } from 'react';
import { getAssetStore } from '../standalone/asset-store.ts';

/**
 * 元に戻す・やり直すが、別の画面で値が変わっていて当てられなかった時の知らせ。
 * 資産の値は変えずに、その項目だけを履歴から捨てている。次の元に戻すは、その下の項目を戻す。
 */
export function HistoryConflictNotice() {
  const store = getAssetStore();
  const notice = useSyncExternalStore(store.subscribe, store.getNotice, () => undefined);
  if (notice === undefined) return null;
  return (
    <div className="shell-notice" role="status" data-history-conflict-notice="true" key={notice.serial}>
      <span className="shell-notice-text">{notice.text}</span>
      <button type="button" aria-label="閉じる" title="閉じる" onClick={() => store.dismissNotice()}>
        ×
      </button>
    </div>
  );
}
