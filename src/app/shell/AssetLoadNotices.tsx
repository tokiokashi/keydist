import { useSyncExternalStore } from 'react';
import { dismissAssetLoadNotices, getAssetLoadNoticesSnapshot, subscribeAssetLoadNotices } from '../standalone/asset-load-notice.ts';
import { assetNoticeText } from '../standalone/asset-load-notice-text.ts';

const NO_NOTICES: ReturnType<typeof getAssetLoadNoticesSnapshot> = [];

/**
 * 保存データを開いた時に、捨てた値・直した値・読めなかった値があったことの知らせ。
 * 資産がいくつ重なっても知らせは1つにまとめ、長くなる分は知らせの中でスクロールする。
 * 直した形は保存し直してあるので、閉じても、次に開いても同じ知らせは出ない。
 */
export function AssetLoadNotices() {
  const notices = useSyncExternalStore(subscribeAssetLoadNotices, getAssetLoadNoticesSnapshot, () => NO_NOTICES);
  if (notices.length === 0) return null;
  return (
    <div className="shell-notice shell-notice-detailed" role="status" data-asset-load-notice="true">
      <div className="shell-notice-body">
        <span>保存データに読めない部分がありました。</span>
        <ul className="shell-notice-details">
          {notices.map((notice) => (
            <li key={notice.key} data-asset-load-notice-key={notice.key}>
              {assetNoticeText(notice)}
            </li>
          ))}
        </ul>
      </div>
      <button type="button" aria-label="知らせを閉じる" title="知らせを閉じる" onClick={dismissAssetLoadNotices}>
        ×
      </button>
    </div>
  );
}
