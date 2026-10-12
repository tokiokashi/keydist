import { useSyncExternalStore } from 'react';
import {
  dismissAssetLoadNotice,
  getAssetLoadNoticesSnapshot,
  subscribeAssetLoadNotices,
} from '../standalone/asset-load-notice.ts';
import { assetNoticeText } from '../standalone/asset-load-notice-text.ts';

const NO_NOTICES: ReturnType<typeof getAssetLoadNoticesSnapshot> = [];

/**
 * 保存データを開いた時に、捨てた値・直した値・読めなかった値があったことの知らせ。
 * 直した形は保存し直してあるので、閉じても、次に開いても同じ知らせは出ない。
 */
export function AssetLoadNotices() {
  const notices = useSyncExternalStore(subscribeAssetLoadNotices, getAssetLoadNoticesSnapshot, () => NO_NOTICES);
  return (
    <>
      {notices.map((notice) => {
        const { summary, details } = assetNoticeText(notice);
        return (
          <div className="shell-notice shell-notice-detailed" role="status" data-asset-load-notice={notice.key} key={notice.key}>
            <div className="shell-notice-body">
              <span>{summary}</span>
              {details.length === 0 ? null : (
                <ul className="shell-notice-details">
                  {details.map((detail) => <li key={detail}>{detail}</li>)}
                </ul>
              )}
            </div>
            <button type="button" aria-label="知らせを閉じる" title="知らせを閉じる" onClick={() => dismissAssetLoadNotice(notice.key)}>×</button>
          </div>
        );
      })}
    </>
  );
}
